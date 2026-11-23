/** The assistant endpoint: admission, then a cached answer or the pipeline. Each handler owns its state. */
import type { AssistantRequest, AssistantResponse } from '../core/contract.js';
import { isoDateHour } from '../core/isoTime.js';
import { COORD_DECIMALS, coords } from '../core/place.js';
import { type TtlCache, ttlCache } from '../core/ttlCache.js';
import { admit, type Admitted, rejectByQuota } from './admission.js';
import { type Cooldown, createCooldown } from './cooldown.js';
import { startDeadline } from './deadline.js';
import { errorResponse, json } from './http.js';
import { type LimitMemory, limitMemory, limitStack } from './limits.js';
import { type AnswerDeps, answerRequest, groundedInput } from './pipeline.js';
import type { AssistantEnv, Logger } from './types.js';

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 200;

type AnswerCache = TtlCache<AssistantResponse>;

interface HandlerState {
  cache: AnswerCache;
  memory: LimitMemory;
  cooldown: Cooldown;
}

type AssistantHandler = (
  request: Request,
  env: AssistantEnv,
  fetchImpl?: typeof fetch,
  log?: Logger,
) => Promise<Response>;

/** Everything the answer depends on, known before any network call; the UTC hour because the forecast moves hourly. */
function cacheKey(req: AssistantRequest, now = new Date()): string {
  const { name, region = '', country = '' } = req.place;
  const history = req.mode === 'question' ? req.history : [];
  const where = [name, region, country, ...coords(req.place, COORD_DECIMALS.grid)];
  const hour = isoDateHour(now.toISOString());
  return JSON.stringify([req.lang, req.mode, req.question, history, where, req.profile, hour]);
}

async function respond({ req, client }: Admitted, deps: AnswerDeps & { cache: AnswerCache }): Promise<Response> {
  const key = cacheKey(req);
  const cached = deps.cache.get(key);
  if (cached) return json(200, cached);
  const refused = await rejectByQuota(deps, client);
  if (refused) return refused;
  const input = await groundedInput(req, deps.fetchImpl, deps.log);
  if (!input) return errorResponse(502, 'ai_unavailable');
  const answered = await answerRequest(input, deps);
  if (!answered.ok) return answered.response;
  // Only the final answer is cached, so a failure is asked again next time.
  deps.cache.set(key, answered.value);
  return json(200, answered.value);
}

/** Tests make a fresh handler instead of resetting shared state. */
export function createAssistantHandler({
  cache = ttlCache<AssistantResponse>(CACHE_TTL_MS, CACHE_MAX),
  memory = limitMemory(),
  cooldown = createCooldown(),
}: Partial<HandlerState> = {}): AssistantHandler {
  const limitsOf = limitStack(memory);
  return async (request, env, fetchImpl = fetch, log = console) => {
    const deadline = startDeadline();
    const limits = limitsOf(env, fetchImpl, log);
    const admitted = await admit(request, { env, log, limits });
    if (!admitted.ok) return admitted.response;
    return respond(admitted.value, { env, fetchImpl, log, limits, deadline, cooldown, cache });
  };
}

export const handleAssistant = createAssistantHandler();
