/** Google Gemini client: the model chain, retries and fallbacks. Replies are read in geminiReply.ts. */
import { ANSWER_SCHEMA, type ModelAnswer } from './answer.js';
import { MIN_ATTEMPT_MS, attemptTimeout, startDeadline, type Deadline } from './deadline.js';
import { CapReachedError, GeminiError } from './geminiError.js';
import { readReply } from './geminiReply.js';
import { SYSTEM_INSTRUCTION } from './prompt.js';
import type { StoreEnv } from './store.js';
import { noteFailure, usableModels } from './cooldown.js';
import type { Logger } from './log.js';

export { CapReachedError, GeminiError } from './geminiError.js';

export interface AssistantEnv extends StoreEnv {
  GEMINI_API_KEY?: string | undefined;
  GEMINI_MODEL?: string | undefined;
  /** Ceiling on Gemini calls per UTC day (default 1000); shared across instances only with Upstash (store.ts). */
  MAX_AI_CALLS_PER_DAY?: string | undefined;
  /** Ceiling on answered requests per client address per UTC day (default 60); shared the same way. */
  MAX_AI_REQUESTS_PER_CLIENT_PER_DAY?: string | undefined;
}

// `-latest` aliases cannot be closed to new keys the way pinned gemini-2.5-flash was (Nov 2026); Flash-Lite
// goes first because it answered in 2–4 s while full Flash was often 503. https://ai.google.dev/gemini-api/docs/pricing
export const DEFAULT_MODEL = 'gemini-flash-lite-latest';
export const FALLBACK_MODELS: readonly string[] = ['gemini-3.1-flash-lite', 'gemini-flash-latest'];
/** Busy, rate-limited, gone or failing: worth trying the next model. A 400 (bad request) is not. */
const RETRYABLE = new Set([404, 429, 500, 502, 503, 504]);
/** A model name safe in the URL path: "gemini-3.1-flash-lite"; never "/" or "..". */
const SAFE_MODEL = /^[\w-]+(\.[\w-]+)*$/;

export interface CallOptions {
  log: Logger;
  /** One time budget for every attempt, the repair call's included. */
  deadline: Deadline;
  /** Takes one unit of the global daily cap before each upstream HTTP attempt; false when none is left. */
  charge: () => boolean | Promise<boolean>;
}

/** The primary model (from GEMINI_MODEL if it is a safe id) followed by the fallbacks, without duplicates. */
export function modelChain(env: AssistantEnv): string[] {
  // The model name goes into the URL path, so no slashes or dot-dot segments.
  const wanted = env.GEMINI_MODEL ?? '';
  const primary = SAFE_MODEL.test(wanted) ? wanted : DEFAULT_MODEL;
  return [...new Set([primary, DEFAULT_MODEL, ...FALLBACK_MODELS])];
}

/** "low" thinking keeps replies fast and is accepted by Flash and Flash-Lite ("minimal" is rejected by Flash). */
export function thinkingFor(model: string): Record<string, unknown> {
  return /^gemini-(3|flash)/.test(model) ? { thinkingConfig: { thinkingLevel: 'low' } } : {};
}

/** Structured output: every model must answer with one JSON object that fits the answer schema (answer.ts). */
const JSON_OUTPUT = { responseMimeType: 'application/json', responseSchema: ANSWER_SCHEMA } as const;

/** One model, as one or two upstream calls. */
interface Attempt {
  model: string;
  prompt: string;
  env: AssistantEnv;
  fetchImpl: typeof fetch;
  opts: CallOptions;
}

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
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 2048,
            ...JSON_OUTPUT,
            ...(thinking ? thinkingFor(model) : {}),
          },
        }),
      }),
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Pause before a second round when every model answered "busy". */
const BUSY_PAUSE_MS = 1500;
/** "Too many requests" and "high demand": the statuses that mean the model is overloaded, not broken. */
const OVERLOADED: ReadonlySet<number> = new Set([429, 503]);

/** Everything an attempt needs except the model. */
type Chain = Omit<Attempt, 'model'>;

/** One pass over the chain: the first answer, or the last error, whether every model was only busy, and whether
 * the time budget ran out before every model was tried. */
type Round = { answer: ModelAnswer } | { answer?: undefined; last: unknown; allBusy: boolean; spent: boolean };

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
  let last: unknown = new GeminiError(504, 'request time budget spent');
  // Busy spikes hit every model at once (503s were seen on all three together): when all were busy, go round again.
  for (let pass = 0; pass < 2; pass++) {
    const round = await tryEachModel({ prompt, env, fetchImpl, opts }, last);
    if (round.answer) return round.answer;
    if (round.spent) throw round.last;
    last = round.last;
    if (!round.allBusy || opts.deadline.remaining() < MIN_ATTEMPT_MS + BUSY_PAUSE_MS) break;
    await new Promise((resolve) => setTimeout(resolve, BUSY_PAUSE_MS));
  }
  throw last;
}

async function tryEachModel(chain: Chain, previous: unknown): Promise<Round> {
  const { log, deadline } = chain.opts;
  let last = previous;
  let allBusy = true;
  for (const model of usableModels(modelChain(chain.env))) {
    if (deadline.remaining() < MIN_ATTEMPT_MS) {
      log.warn(`assistant: time budget spent, not trying ${model}`);
      return { last, allBusy, spent: true };
    }
    try {
      return { answer: await callModel({ ...chain, model }) };
    } catch (err) {
      const failure = judgeFailure(err, model, log);
      if (!failure.retry) throw err;
      last = err;
      allBusy &&= failure.allBusy;
    }
  }
  return { last, allBusy, spent: false };
}

const isTimeout = (err: unknown): boolean =>
  err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');

/**
 * What a failed attempt means for the chain: `retry` when the next model is worth trying (busy, timeout,
 * unavailable), and `allBusy` when it was only overloaded. The global cap stops the chain at once.
 */
function judgeFailure(err: unknown, model: string, log: Logger): { retry: boolean; allBusy: boolean } {
  if (err instanceof CapReachedError) return { retry: false, allBusy: false };
  let status: number | undefined;
  if (err instanceof GeminiError) {
    status = err.status;
    noteFailure(model, err.status, err.detail);
  }
  const retry = isTimeout(err) || (status !== undefined && RETRYABLE.has(status));
  const reason = err instanceof Error ? err.message : 'unknown';
  log.warn(`assistant: ${model} failed (${reason})${retry ? ', trying next model' : ''}`);
  return { retry, allBusy: status !== undefined && OVERLOADED.has(status) };
}
