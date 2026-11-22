/** Google Gemini client: the model chain, retries and fallbacks, and reading the typed reply. */
import { ANSWER_SCHEMA, parseAnswer, type ModelAnswer } from './answer.js';
import { MIN_ATTEMPT_MS, attemptTimeout, startDeadline, type Deadline } from './deadline.js';
import { SYSTEM_INSTRUCTION } from './prompt.js';
import type { StoreEnv } from './store.js';
import { noteFailure, usableModels } from './cooldown.js';

export interface AssistantEnv extends StoreEnv {
  GEMINI_API_KEY?: string | undefined;
  GEMINI_MODEL?: string | undefined;
  /** Ceiling on Gemini calls per UTC day (default 1000); shared across instances only with Upstash (store.ts). */
  MAX_AI_CALLS_PER_DAY?: string | undefined;
  /** Ceiling on answered requests per client address per UTC day (default 60); shared the same way. */
  MAX_AI_REQUESTS_PER_CLIENT_PER_DAY?: string | undefined;
}

/**
 * Model order. The `-latest` aliases always point at Google's newest free models, so the app cannot break the way
 * a pinned id does (gemini-2.5-flash was closed to new keys in Nov 2026). Flash-Lite answers first: in testing it
 * replied in 2–4 s while full Flash was often overloaded (503) or slow. Full Flash is the last resort.
 * Free tier: https://ai.google.dev/gemini-api/docs/pricing
 */
export const DEFAULT_MODEL = 'gemini-flash-lite-latest';
export const FALLBACK_MODELS: readonly string[] = ['gemini-3.1-flash-lite', 'gemini-flash-latest'];
/** Busy, rate-limited, gone or failing: worth trying the next model. A 400 (bad request) is not. */
const RETRYABLE = new Set([404, 429, 500, 502, 503, 504]);
/** A model name safe in the URL path: "gemini-3.1-flash-lite"; never "/" or "..". */
const SAFE_MODEL = /^[\w-]+(\.[\w-]+)*$/;

/** Error codes the client turns into a message in the user's language. */
export type AssistantErrorCode =
  | 'not_configured'
  | 'ai_rate_limited'
  | 'ai_unavailable'
  | 'too_many_requests'
  | 'daily_limit';

export class GeminiError extends Error {
  /** `detail` is Gemini's own error text: logged on the server for debugging, never sent to the browser. */
  constructor(
    readonly status: number,
    readonly detail = '',
  ) {
    super(`Gemini HTTP ${status}${detail ? `: ${detail}` : ''}`);
  }
}

/** The global daily cap refused an upstream attempt: the chain stops at once instead of trying the next model. */
export class CapReachedError extends GeminiError {
  constructor() {
    super(429, 'daily AI call ceiling reached');
  }
}

export interface CallOptions {
  log: Pick<Console, 'warn'>;
  /** One time budget for every attempt, the repair call's included. */
  deadline: Deadline;
  /** Takes one unit of the global daily cap before each upstream HTTP attempt; false when none is left. */
  charge: () => boolean | Promise<boolean>;
}

async function upstreamMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return (body.error?.message ?? '').slice(0, 160);
  } catch {
    return '';
  }
}
/** The primary model (from GEMINI_MODEL if it is a safe id) followed by the fallbacks, without duplicates. */
export function modelChain(env: AssistantEnv): string[] {
  // The model name goes into the URL path, so no slashes or dot-dot segments.
  const primary = SAFE_MODEL.test(env.GEMINI_MODEL ?? '') ? (env.GEMINI_MODEL as string) : DEFAULT_MODEL;
  return [...new Set([primary, DEFAULT_MODEL, ...FALLBACK_MODELS])];
}

/**
 * Gemini 3-series and the -latest aliases think before answering; "low" keeps replies fast and is accepted by
 * both Flash and Flash-Lite ("minimal" is rejected by full Flash models).
 */
export function thinkingFor(model: string): Record<string, unknown> {
  return /^gemini-(3|flash)/.test(model) ? { thinkingConfig: { thinkingLevel: 'low' } } : {};
}

/** Structured output: every model must answer with one JSON object that fits the answer schema (answer.ts). */
const JSON_OUTPUT = { responseMimeType: 'application/json', responseSchema: ANSWER_SCHEMA } as const;

/** One model, as one or two upstream calls. */
interface Attempt { model: string; prompt: string; env: AssistantEnv; fetchImpl: typeof fetch; opts: CallOptions }

/** Calls one model; if it rejects the thinking setting (400), retries the same model once without it. */
async function callModel(a: Attempt): Promise<ModelAnswer> {
  try {
    return await requestModel(a, true);
  } catch (err) {
    const canRetry = a.opts.deadline.remaining() >= MIN_ATTEMPT_MS && Object.keys(thinkingFor(a.model)).length > 0;
    if (err instanceof GeminiError && err.status === 400 && canRetry) {
      return requestModel(a, false);
    }
    throw err;
  }
}

async function requestModel({ model, prompt, env, fetchImpl, opts }: Attempt, thinking: boolean): Promise<ModelAnswer> {
  // Every upstream HTTP call counts against the global cap, fallbacks and retries included.
  if (!(await opts.charge())) throw new CapReachedError();
  const timeoutMs = attemptTimeout(opts.deadline);
  // A plain timer rather than AbortSignal.timeout, so tests can drive it with fake timers.
  const abort = new AbortController();
  const onTimeout = (): void => abort.abort(new DOMException(`no reply in ${timeoutMs} ms`, 'TimeoutError'));
  const timer = setTimeout(onTimeout, timeoutMs);
  try {
    return await readReply(
      await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY ?? '' },
        signal: abort.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 2048, ...JSON_OUTPUT, ...(thinking ? thinkingFor(model) : {}) },
        }),
      }),
    );
  } finally {
    clearTimeout(timer);
  }
}

async function readReply(res: Response): Promise<ModelAnswer> {
  if (!res.ok) throw new GeminiError(res.status, await upstreamMessage(res));
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  };
  const candidate = data.candidates?.[0];
  const text =
    candidate?.content?.parts
      ?.filter((p) => !p.thought)
      .map((p) => p.text ?? '')
      .join('')
      .trim() ?? '';
  if (!text || candidate?.finishReason === 'SAFETY') {
    throw new GeminiError(502, `empty reply (${candidate?.finishReason ?? 'no candidate'})`);
  }
  // A reply cut off by the token limit is broken JSON. Like any reply that misses the schema, it is a failed
  // attempt (502), so the next model is tried.
  const answer = parseAnswer(text);
  if (!answer) throw new GeminiError(502, `reply does not fit the schema (${candidate?.finishReason ?? 'no reason'})`);
  return answer;
}

/** Pause before a second round when every model answered "busy". */
const BUSY_PAUSE_MS = 1500;
/** "Too many requests" and "high demand": the statuses that mean the model is overloaded, not broken. */
const OVERLOADED: ReadonlySet<number> = new Set([429, 503]);

/**
 * Tries each model in turn on busy/timeout/unavailable; returns the first answer. Every attempt draws on the same
 * `deadline`, so the whole chain (and a repair call sharing it) ends inside the function's time limit.
 */
export async function callGemini(
  prompt: string,
  env: AssistantEnv,
  fetchImpl: typeof fetch,
  options: Partial<CallOptions> = {},
): Promise<ModelAnswer> {
  const opts: CallOptions = { log: console, deadline: startDeadline(), charge: () => true, ...options };
  const { log, deadline } = opts;
  let last: unknown = new GeminiError(504, 'request time budget spent');
  // Busy spikes hit every model at once ("high demand" 503s were seen on all three together). When every model was
  // busy, pause briefly and go round once more, as long as the time budget allows.
  for (let pass = 0; pass < 2; pass++) {
    let allBusy = true;
    for (const model of usableModels(modelChain(env))) {
      if (deadline.remaining() < MIN_ATTEMPT_MS) {
        log.warn(`assistant: time budget spent, not trying ${model}`);
        throw last;
      }
      try {
        return await callModel({ model, prompt, env, fetchImpl, opts });
      } catch (err) {
        if (err instanceof CapReachedError) throw err;
        last = err;
        if (err instanceof GeminiError) noteFailure(model, err.status, err.detail);
        const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
        const busy = err instanceof GeminiError && RETRYABLE.has(err.status);
        if (!(err instanceof GeminiError && OVERLOADED.has(err.status))) allBusy = false;
        const reason = err instanceof Error ? err.message : 'unknown';
        log.warn(`assistant: ${model} failed (${reason})${timedOut || busy ? ', trying next model' : ''}`);
        if (!timedOut && !busy) throw err;
      }
    }
    if (!allBusy || deadline.remaining() < MIN_ATTEMPT_MS + BUSY_PAUSE_MS) break;
    await new Promise((resolve) => setTimeout(resolve, BUSY_PAUSE_MS));
  }
  throw last;
}
