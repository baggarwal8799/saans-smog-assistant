/**
 * The assistant endpoint: facts are computed in code, the model returns a typed object, and the server renders it.
 * Order matters: cheap refusals (method, type, origin, size, rate) come before any work or upstream call.
 */
import { LIMITS, type AssistantRequest, type AssistantResponse } from './contract.js';
import { fetchAirReport } from '../../src/lib/aqi.js';
import { buildContext } from '../../src/lib/context.js';
import { buildPlan } from '../../src/lib/recommend.js';
import { renderAnswer, type ModelAnswer } from './answer.js';
import type { CheckInput } from './checks.js';
import { MIN_REPAIR_MS, startDeadline } from './deadline.js';
import { GeminiError, callGemini, type AssistantEnv, type AssistantErrorCode } from './gemini.js';
import { isSameOrigin } from './origin.js';
import { buildUserPrompt } from './prompt.js';
import { limitsFor, resetLimits } from './limits.js';
import { clientDailyLimit, dailyLimit } from './quota.js';
import { clientKey } from './rateLimit.js';
import { guardedAnswer } from './repair.js';
import { ValidationError, isJsonContentType, parseAssistantRequest } from './validate.js';
import { readCapped } from './body.js';

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 200;

export { REQUESTS_PER_MINUTE } from './limits.js';
const cache = new Map<string, { at: number; value: AssistantResponse }>();

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
} as const;

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
}

function cacheGet(key: string): AssistantResponse | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

function cacheSet(key: string, value: AssistantResponse): void {
  cache.set(key, { at: Date.now(), value });
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

export function resetAssistantState(): void {
  cache.clear();
  resetLimits();
}

/**
 * Everything the answer depends on, known before any network call: the request (place rounded to the ~1 km grid
 * the air data uses) and the current UTC hour, since the forecast moves on hourly. A hit skips Open-Meteo and Gemini.
 */
function cacheKey(req: AssistantRequest, now = new Date()): string {
  const { name, region = '', country = '', lat, lon } = req.place;
  const history = req.mode === 'question' ? req.history : [];
  const where = [name, region, country, lat.toFixed(2), lon.toFixed(2)];
  const hour = now.toISOString().slice(0, 13);
  return JSON.stringify([req.lang, req.mode, req.question, history, where, req.profile, hour]);
}

/** Web-standard handler, used by the Vercel function and the Vite dev server alike. */
export async function handleAssistant(
  request: Request,
  env: AssistantEnv,
  fetchImpl: typeof fetch = fetch,
  log: Pick<Console, 'warn'> = console,
): Promise<Response> {
  // One time budget for the whole request: the model chain and the repair call both draw on it.
  const deadline = startDeadline();
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' }, { allow: 'POST' });
  if (!isJsonContentType(request.headers.get('content-type'))) {
    return json(415, { error: 'Content-Type must be application/json' });
  }
  if (!isSameOrigin(request)) return json(403, { error: 'Only same-origin requests are allowed' });
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > LIMITS.bodyBytes) return json(413, { error: 'Request too large' });
  const client = clientKey(request.headers);
  const limits = limitsFor(env, fetchImpl, log);
  if (!(await limits.allowMinute(client))) {
    return json(429, { error: 'too_many_requests' satisfies AssistantErrorCode }, { 'retry-after': '60' });
  }

  const raw = await readCapped(request, LIMITS.bodyBytes);
  if (raw === null) return json(413, { error: 'Request too large' });

  let req: AssistantRequest;
  try {
    req = parseAssistantRequest(JSON.parse(raw));
  } catch (err) {
    const message = err instanceof ValidationError ? err.message : 'Invalid JSON';
    return json(400, { error: message });
  }

  if (!env.GEMINI_API_KEY) return json(503, { error: 'not_configured' satisfies AssistantErrorCode });

  const key = cacheKey(req);
  const cached = cacheGet(key);
  if (cached) return json(200, cached);

  const limit = dailyLimit(env.MAX_AI_CALLS_PER_DAY);
  if ((await limits.globalRemaining(limit)) === 0) {
    log.warn('assistant: daily AI call ceiling reached (MAX_AI_CALLS_PER_DAY)');
    return json(429, { error: 'ai_rate_limited' satisfies AssistantErrorCode }, { 'retry-after': '3600' });
  }
  const clientLimit = clientDailyLimit(env.MAX_AI_REQUESTS_PER_CLIENT_PER_DAY);
  const clientCapped = (): Response => {
    log.warn('assistant: a client reached its daily cap (MAX_AI_REQUESTS_PER_CLIENT_PER_DAY)');
    return json(429, { error: 'daily_limit' satisfies AssistantErrorCode }, { 'retry-after': '3600' });
  };
  // One unit per user request, taken before any upstream call, so a capped client cannot even trigger an air fetch.
  // The repair call below is part of the same request.
  if (!(await limits.takeClient(clientLimit, client))) return clientCapped();

  // The server fetches the air data and computes the plan itself, with the same engine as the app. Nothing in the
  // request body can change the numbers or the advice the model is given.
  let input: CheckInput;
  try {
    const report = await fetchAirReport(req.place, fetchImpl);
    const plan = buildPlan(report, req.profile, req.lang);
    const said = req.mode === 'question' ? [req.question, ...req.history] : [];
    const context = buildContext(report, req.profile, plan, req.lang, said);
    input = { prompt: buildUserPrompt(req, context), req, epaReply: context.epaReply };
  } catch (err) {
    log.warn('assistant: air data unavailable', err instanceof Error ? err.message : 'unknown');
    return json(502, { error: 'ai_unavailable' satisfies AssistantErrorCode });
  }

  // The global cap is charged per upstream HTTP attempt (fallback models and retries included), so the real number of
  // Gemini calls can never pass MAX_AI_CALLS_PER_DAY; concurrent requests cannot overshoot it either.
  const charge = (): Promise<boolean> => limits.takeGlobal(limit);
  const ask = (p: string): Promise<ModelAnswer> => callGemini(p, env, fetchImpl, { log, deadline, charge });
  const canRepair = async (): Promise<boolean> =>
    deadline.remaining() >= MIN_REPAIR_MS && (await limits.globalRemaining(limit)) > 0;
  try {
    // The reply word, the refusal and the medical lines are fixed text added by code. Only the final answer is cached.
    const answer = await guardedAnswer(input, ask, log, canRepair);
    const response: AssistantResponse = { text: renderAnswer(answer, req, input.epaReply) };
    cacheSet(key, response);
    return json(200, response);
  } catch (err) {
    // Never pass upstream details (which can echo the key) to the client; log the cause on the server only.
    log.warn('assistant: no answer', err instanceof Error ? err.message : 'unknown');
    if (err instanceof GeminiError && err.status === 429) {
      return json(429, { error: 'ai_rate_limited' satisfies AssistantErrorCode }, { 'retry-after': '60' });
    }
    return json(502, { error: 'ai_unavailable' satisfies AssistantErrorCode });
  }
}
