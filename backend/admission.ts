/**
 * The gates a request passes before any work: the cheap refusals (method, type, origin, size) first, then the
 * per-minute limit, the body and the key. The daily caps come later, after the cache, but before any upstream call.
 */
import { type AssistantRequest, LIMITS } from '../core/contract.js';
import { readCapped } from './body.js';
import { errorResponse, proceed, retryAfter, type Step, stop } from './http.js';
import type { Limits } from './limits.js';
import { isSameOrigin } from './origin.js';
import { clientDailyLimit, dailyLimit } from './quota.js';
import { clientKey } from './rateLimit.js';
import type { AssistantEnv, Logger } from './types.js';
import { isJsonContentType, parseAssistantRequest, ValidationError } from './validate.js';

export interface Admitted {
  req: AssistantRequest;
  client: string;
}

interface Gate {
  env: AssistantEnv;
  log: Logger;
  limits: Limits;
}

function rejectEarly(request: Request): Response | null {
  if (request.method !== 'POST') return errorResponse(405, 'method_not_allowed', { allow: 'POST' });
  if (!isJsonContentType(request.headers.get('content-type'))) return errorResponse(415, 'unsupported_media_type');
  if (!isSameOrigin(request)) return errorResponse(403, 'forbidden_origin');
  const declared = Number(request.headers.get('content-length') ?? '0');
  return declared > LIMITS.bodyBytes ? errorResponse(413, 'too_large') : null;
}

async function readRequest(request: Request, log: Logger): Promise<Step<AssistantRequest>> {
  const raw = await readCapped(request, LIMITS.bodyBytes);
  if (raw === null) return stop(errorResponse(413, 'too_large'));
  try {
    return proceed(parseAssistantRequest(JSON.parse(raw)));
  } catch (err) {
    log.warn('assistant: invalid request', err instanceof ValidationError ? err.message : 'invalid JSON');
    return stop(errorResponse(400, 'invalid_request'));
  }
}

export async function admit(request: Request, { env, log, limits }: Gate): Promise<Step<Admitted>> {
  const early = rejectEarly(request);
  if (early) return stop(early);
  const client = clientKey(request.headers);
  if (!(await limits.allowMinute(client))) return stop(errorResponse(429, 'too_many_requests', retryAfter('60')));
  const read = await readRequest(request, log);
  if (!read.ok) return read;
  if (!env.GEMINI_API_KEY) return stop(errorResponse(503, 'not_configured'));
  return proceed({ req: read.value, client });
}

/** The client's unit is taken here, before any upstream call, so a capped client cannot trigger a fetch. */
export async function rejectByQuota({ env, log, limits }: Gate, client: string): Promise<Response | null> {
  if ((await limits.globalRemaining(dailyLimit(env.MAX_AI_CALLS_PER_DAY))) === 0) {
    log.warn('assistant: daily AI call ceiling reached (MAX_AI_CALLS_PER_DAY)');
    return errorResponse(429, 'ai_rate_limited', retryAfter('3600'));
  }
  if (!(await limits.takeClient(clientDailyLimit(env.MAX_AI_REQUESTS_PER_CLIENT_PER_DAY), client))) {
    log.warn('assistant: a client reached its daily cap (MAX_AI_REQUESTS_PER_CLIENT_PER_DAY)');
    return errorResponse(429, 'daily_limit', retryAfter('3600'));
  }
  return null;
}
