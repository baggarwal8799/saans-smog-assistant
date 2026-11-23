/** Calls Gemini for a typed answer, falling back through the model chain when a model is busy or gone. */
import { ANSWER_SCHEMA, type ModelAnswer } from './answer.js';
import { type Cooldown, createCooldown } from './cooldown.js';
import { attemptTimeout, type Deadline, MIN_ATTEMPT_MS, startDeadline } from './deadline.js';
import { CapReachedError, GeminiError, readReply } from './geminiReply.js';
import { errorText } from './log.js';
import { SYSTEM_INSTRUCTION } from './prompt.js';
import { withTimeout } from './timeout.js';
import type { AssistantEnv, Logger } from './types.js';

// `-latest` aliases, because Google can close a pinned model to new keys; Flash-Lite first, because it is the
// fastest and the least often overloaded. https://ai.google.dev/gemini-api/docs/pricing
export const DEFAULT_MODEL = 'gemini-flash-lite-latest';
export const FALLBACK_MODELS: readonly string[] = ['gemini-3.1-flash-lite', 'gemini-flash-latest'];
/** Busy, rate-limited, gone or failing: worth trying the next model. A 400 (bad request) is not. */
const RETRYABLE = new Set([404, 429, 500, 502, 503, 504]);
/** A model name safe in the URL path: "gemini-3.1-flash-lite"; never "/" or "..". */
const SAFE_MODEL = /^[\w-]+(\.[\w-]+)*$/;
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TEMPERATURE = 0.4;
const MAX_OUTPUT_TOKENS = 2048;
/** Every model, fallbacks too, answers under the schema, so the server renders one shape whichever answered. */
const JSON_OUTPUT = { responseMimeType: 'application/json', responseSchema: ANSWER_SCHEMA } as const;
const BUSY_PAUSE_MS = 1500;
/** "Too many requests" and "high demand": the statuses that mean the model is overloaded, not broken. */
const OVERLOADED: ReadonlySet<number> = new Set([429, 503]);

interface CallOptions {
  log: Logger;
  deadline: Deadline;
  /** Takes one unit of the global daily cap before each upstream HTTP attempt; false when none is left. */
  charge: () => boolean | Promise<boolean>;
  cooldown: Cooldown;
}

/** The primary model (GEMINI_MODEL if it is safe in the URL path) followed by the fallbacks, without duplicates. */
export function modelChain(env: AssistantEnv): [string, ...string[]] {
  const wanted = env.GEMINI_MODEL ?? '';
  const primary = SAFE_MODEL.test(wanted) ? wanted : DEFAULT_MODEL;
  return [primary, ...[DEFAULT_MODEL, ...FALLBACK_MODELS].filter((m) => m !== primary)];
}

/** "low" thinking keeps replies fast and is accepted by Flash and Flash-Lite ("minimal" is rejected by Flash). */
export function thinkingFor(model: string): Record<string, unknown> {
  return /^gemini-(3|flash)/.test(model) ? { thinkingConfig: { thinkingLevel: 'low' } } : {};
}

interface Attempt {
  model: string;
  prompt: string;
  env: AssistantEnv;
  fetchImpl: typeof fetch;
  opts: CallOptions;
}

/** Calls one model; if it rejects the thinking setting (400), retries the same model once without it. */
async function callModel(a: Attempt): Promise<ModelAnswer> {
  const thinking = thinkingFor(a.model);
  try {
    return await requestModel(a, thinking);
  } catch (err) {
    const canRetry = a.opts.deadline.remaining() >= MIN_ATTEMPT_MS && Object.keys(thinking).length > 0;
    if (err instanceof GeminiError && err.status === 400 && canRetry) {
      return requestModel(a, {});
    }
    throw err;
  }
}

async function requestModel(
  { model, prompt, env, fetchImpl, opts }: Attempt,
  thinking: Record<string, unknown>,
): Promise<ModelAnswer> {
  // Every upstream HTTP call counts against the global cap, fallbacks and retries included.
  if (!(await opts.charge())) throw new CapReachedError();
  const timeoutMs = attemptTimeout(opts.deadline);
  return withTimeout(timeoutMs, `no reply in ${timeoutMs} ms`, async (signal) =>
    readReply(
      await fetchImpl(`${API_BASE}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY ?? '' },
        signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: TEMPERATURE,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            ...JSON_OUTPUT,
            ...thinking,
          },
        }),
      }),
    ),
  );
}

type Chain = Omit<Attempt, 'model'>;

/** How one pass over the chain ended; `allBusy` when every model that failed was only overloaded. */
type Round =
  | { kind: 'answered'; answer: ModelAnswer }
  | { kind: 'failed'; last: unknown; allBusy: boolean }
  | { kind: 'outOfTime'; last: unknown };

/** The first answer from the chain. All attempts share one `deadline`, so the chain and a repair end in time. */
export async function callGemini(
  prompt: string,
  env: AssistantEnv,
  fetchImpl: typeof fetch,
  options: Partial<CallOptions> = {},
): Promise<ModelAnswer> {
  const defaults = { log: console, deadline: startDeadline(), charge: () => true, cooldown: createCooldown() };
  const opts: CallOptions = { ...defaults, ...options };
  let last: unknown = new GeminiError(504, 'request time budget spent');
  // An overload spike hits every model at once, so when all were only busy, go round the chain once more.
  for (let pass = 0; pass < 2; pass++) {
    const round = await tryEachModel({ prompt, env, fetchImpl, opts }, last);
    if (round.kind === 'answered') return round.answer;
    if (round.kind === 'outOfTime') throw round.last;
    last = round.last;
    if (!round.allBusy || opts.deadline.remaining() < MIN_ATTEMPT_MS + BUSY_PAUSE_MS) break;
    await new Promise((resolve) => setTimeout(resolve, BUSY_PAUSE_MS));
  }
  throw last;
}

async function tryEachModel(chain: Chain, previous: unknown): Promise<Round> {
  const { log, deadline, cooldown } = chain.opts;
  let last = previous;
  let allBusy = true;
  for (const model of cooldown.usable(modelChain(chain.env))) {
    if (deadline.remaining() < MIN_ATTEMPT_MS) {
      log.warn(`assistant: time budget spent, not trying ${model}`);
      return { kind: 'outOfTime', last };
    }
    try {
      return { kind: 'answered', answer: await callModel({ ...chain, model }) };
    } catch (err) {
      const failure = judgeFailure(err, model, chain.opts);
      if (!failure.retry) throw err;
      last = err;
      allBusy &&= failure.allBusy;
    }
  }
  return { kind: 'failed', last, allBusy };
}

const isTimeout = (err: unknown): boolean =>
  err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');

/** Whether the next model is worth trying, and whether this one was only overloaded. The global cap stops all. */
function judgeFailure(
  err: unknown,
  model: string,
  { log, cooldown }: Pick<CallOptions, 'log' | 'cooldown'>,
): { retry: boolean; allBusy: boolean } {
  if (err instanceof CapReachedError) return { retry: false, allBusy: false };
  let status: number | undefined;
  if (err instanceof GeminiError) {
    status = err.status;
    cooldown.note(model, err.status, err.detail);
  }
  const retry = isTimeout(err) || (status !== undefined && RETRYABLE.has(status));
  const reason = errorText(err);
  log.warn(`assistant: ${model} failed (${reason})${retry ? ', trying next model' : ''}`);
  return { retry, allBusy: status !== undefined && OVERLOADED.has(status) };
}
