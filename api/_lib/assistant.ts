/**
 * The assistant endpoint: facts are computed in code, the model returns a typed object, and the server renders it.
 * Order matters: cheap refusals (method, type, origin, size, rate) come before any work or upstream call.
 */
import {
  LIMITS,
  type AssistantErrorCode,
  type AssistantRequest,
  type AssistantResponse,
} from '../../src/lib/contract.js';
import { fetchAirReport } from '../../src/lib/aqi.js';
import { buildContext } from '../../src/lib/context.js';
import { buildPlan } from '../../src/lib/recommend.js';
import { renderAnswer, type ModelAnswer } from './answer.js';
import type { CheckInput } from './checks.js';
import { MIN_REPAIR_MS, startDeadline, type Deadline } from './deadline.js';
import { GeminiError, callGemini, type AssistantEnv } from './gemini.js';
import { isSameOrigin } from './origin.js';
import { buildUserPrompt } from './prompt.js';
import { limitsFor, resetLimits } from './limits.js';
import { clientDailyLimit, dailyLimit } from './quota.js';
import { clientKey } from './rateLimit.js';
import { guardedAnswer } from './repair.js';
import { ValidationError, isJsonContentType, parseAssistantRequest } from './validate.js';
import { readCapped } from './body.js';
import type { Logger } from './log.js';
import { ttlCache } from '../../src/lib/ttlCache.js';

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 200;

export { REQUESTS_PER_MINUTE } from './limits.js';
const cache = ttlCache<AssistantResponse>(CACHE_TTL_MS, CACHE_MAX);

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
} as const;

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
}

export function resetAssistantState(): void {
  cache.clear();
  resetLimits();
}

/** Everything the answer depends on, known before any network call; the UTC hour because the forecast moves hourly. */
function cacheKey(req: AssistantRequest, now = new Date()): string {
  const { name, region = '', country = '', lat, lon } = req.place;
  const history = req.mode === 'question' ? req.history : [];
  const where = [name, region, country, lat.toFixed(2), lon.toFixed(2)];
  const hour = now.toISOString().slice(0, 13);
  return JSON.stringify([req.lang, req.mode, req.question, history, where, req.profile, hour]);
}

type Limits = ReturnType<typeof limitsFor>;
const error = (status: number, code: AssistantErrorCode, retryAfter?: string): Response =>
  json(status, { error: code }, retryAfter ? { 'retry-after': retryAfter } : {});

/** Cheap refusals that need no body and no store: method, type, origin, declared size. */
function rejectEarly(request: Request): Response | null {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' }, { allow: 'POST' });
  if (!isJsonContentType(request.headers.get('content-type'))) return error(415, 'unsupported_media_type');
  if (!isSameOrigin(request)) return error(403, 'forbidden_origin');
  const declared = Number(request.headers.get('content-length') ?? '0');
  return declared > LIMITS.bodyBytes ? error(413, 'too_large') : null;
}

async function readRequest(request: Request, log: Logger): Promise<AssistantRequest | Response> {
  const raw = await readCapped(request, LIMITS.bodyBytes);
  if (raw === null) return error(413, 'too_large');
  try {
    return parseAssistantRequest(JSON.parse(raw));
  } catch (err) {
    // The reason stays in the server log; the client gets only the code.
    log.warn('assistant: invalid request', err instanceof ValidationError ? err.message : 'invalid JSON');
    return error(400, 'invalid_request');
  }
}

/** The daily caps; the client's unit is taken before any upstream call, so a capped client cannot trigger a fetch. */
async function rejectByQuota(env: AssistantEnv, limits: Limits, client: string, log: Logger): Promise<Response | null> {
  if ((await limits.globalRemaining(dailyLimit(env.MAX_AI_CALLS_PER_DAY))) === 0) {
    log.warn('assistant: daily AI call ceiling reached (MAX_AI_CALLS_PER_DAY)');
    return error(429, 'ai_rate_limited', '3600');
  }
  if (!(await limits.takeClient(clientDailyLimit(env.MAX_AI_REQUESTS_PER_CLIENT_PER_DAY), client))) {
    log.warn('assistant: a client reached its daily cap (MAX_AI_REQUESTS_PER_CLIENT_PER_DAY)');
    return error(429, 'daily_limit', '3600');
  }
  return null;
}

/** The server fetches the air and builds the plan itself: nothing in the body can change the model's numbers. */
async function groundedInput(req: AssistantRequest, fetchImpl: typeof fetch, log: Logger): Promise<CheckInput | null> {
  try {
    const report = await fetchAirReport(req.place, fetchImpl);
    const plan = buildPlan(report, req.profile, req.lang);
    const said = req.mode === 'question' ? [req.question, ...req.history] : [];
    const context = buildContext({ report, profile: req.profile, plan, lang: req.lang, said });
    return { prompt: buildUserPrompt(req, context), req, epaReply: context.epaReply };
  } catch (err) {
    log.warn('assistant: air data unavailable', err instanceof Error ? err.message : 'unknown');
    return null;
  }
}

interface AnswerDeps {
  env: AssistantEnv;
  fetchImpl: typeof fetch;
  log: Logger;
  limits: Limits;
  deadline: Deadline;
}

async function answer(input: CheckInput, key: string, d: AnswerDeps): Promise<Response> {
  const limit = dailyLimit(d.env.MAX_AI_CALLS_PER_DAY);
  // Charged per upstream HTTP attempt, fallbacks and retries included, so real calls never pass the daily cap.
  const charge = (): Promise<boolean> => d.limits.takeGlobal(limit);
  const opts = { log: d.log, deadline: d.deadline, charge };
  const ask = (p: string): Promise<ModelAnswer> => callGemini(p, d.env, d.fetchImpl, opts);
  const canRepair = async (): Promise<boolean> =>
    d.deadline.remaining() >= MIN_REPAIR_MS && (await d.limits.globalRemaining(limit)) > 0;
  try {
    // Reply word, refusal and medical lines are fixed text added by code; only the final answer is cached.
    const model = await guardedAnswer(input, ask, d.log, canRepair);
    const response: AssistantResponse = { text: renderAnswer(model, input.req, input.epaReply) };
    cache.set(key, response);
    return json(200, response);
  } catch (err) {
    // Upstream details can echo the key: log the cause on the server only.
    d.log.warn('assistant: no answer', err instanceof Error ? err.message : 'unknown');
    if (err instanceof GeminiError && err.status === 429) return error(429, 'ai_rate_limited', '60');
    return error(502, 'ai_unavailable');
  }
}

/** Web-standard handler, used by the Vercel function and the Vite dev server alike. */
export async function handleAssistant(
  request: Request,
  env: AssistantEnv,
  fetchImpl: typeof fetch = fetch,
  log: Logger = console,
): Promise<Response> {
  // One time budget for the whole request: the model chain and the repair call both draw on it.
  const deadline = startDeadline();
  const early = rejectEarly(request);
  if (early) return early;
  const client = clientKey(request.headers);
  const limits = limitsFor(env, fetchImpl, log);
  if (!(await limits.allowMinute(client))) return error(429, 'too_many_requests', '60');
  const req = await readRequest(request, log);
  if (req instanceof Response) return req;
  if (!env.GEMINI_API_KEY) return error(503, 'not_configured');
  const key = cacheKey(req);
  const cached = cache.get(key);
  if (cached) return json(200, cached);
  const refused = await rejectByQuota(env, limits, client, log);
  if (refused) return refused;
  const input = await groundedInput(req, fetchImpl, log);
  if (!input) return error(502, 'ai_unavailable');
  return answer(input, key, { env, fetchImpl, log, limits, deadline });
}
