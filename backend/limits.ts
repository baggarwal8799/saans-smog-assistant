/**
 * On store errors the global cap fails CLOSED, because it protects the Gemini quota; the per-client limits fall back
 * to memory, because refusing everyone over a Redis outage would take the assistant down.
 */
import { errorText } from './log.js';
import { DailyQuota } from './quota.js';
import { RateLimiter } from './rateLimit.js';
import { type CounterStore, MemoryStore, sharedStore, withFallback } from './store.js';
import type { Logger, StoreEnv } from './types.js';

/** Per browser/IP: generous for a person clicking quickly, tight enough to protect the free Gemini quota. */
export const REQUESTS_PER_MINUTE = 15;
const MINUTE_SECONDS = 60;

/** Separate stores, so a flood of new client keys can never evict the global count. */
export interface LimitMemory {
  minute: MemoryStore;
  client: MemoryStore;
  global: MemoryStore;
}

export const limitMemory = (): LimitMemory => ({
  minute: new MemoryStore(5_000),
  client: new MemoryStore(10_000),
  global: new MemoryStore(100),
});

interface LimitOptions {
  /** Kept by the caller for the life of the instance, so counts carry over from one request to the next. */
  memory: LimitMemory;
  now?: () => Date;
}

export interface Limits {
  allowMinute(client: string): Promise<boolean>;
  takeClient(limit: number, client: string): Promise<boolean>;
  /** Gemini calls left today for everyone; 0 when the store fails. */
  globalRemaining(limit: number): Promise<number>;
  takeGlobal(limit: number): Promise<boolean>;
}

export function limitsFor(
  env: StoreEnv,
  fetchImpl: typeof fetch,
  log: Logger,
  { memory, now = () => new Date() }: LimitOptions,
): Limits {
  const shared = sharedStore(env, fetchImpl);
  const perClient = (store: MemoryStore): CounterStore => (shared ? withFallback(shared, store, log) : store);
  const minute = new RateLimiter(perClient(memory.minute), REQUESTS_PER_MINUTE, MINUTE_SECONDS);
  const clients = new DailyQuota(perClient(memory.client), 'client', now);
  const global = new DailyQuota(shared ?? memory.global, 'global', now);
  const closed = <T>(p: Promise<T>, refused: T): Promise<T> =>
    p.catch((err: unknown) => {
      log.warn('assistant: shared limit store failed, global daily cap refuses', errorText(err));
      return refused;
    });
  return {
    allowMinute: (client) => minute.allow(client),
    takeClient: (limit, client) => clients.take(limit, client),
    globalRemaining: (limit) => closed(global.remaining(limit), 0),
    takeGlobal: (limit) => closed(global.take(limit), false),
  };
}

/**
 * The limit stack for one handler, rebuilt only when what it is made from changes. In production that is never: the
 * environment, fetch and logger stay the same, so each request reuses one stack.
 */
export function limitStack(memory: LimitMemory): (env: StoreEnv, fetchImpl: typeof fetch, log: Logger) => Limits {
  let built: { from: unknown[]; limits: Limits } | undefined;
  return (env, fetchImpl, log) => {
    const from = [env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN, fetchImpl, log];
    if (!built || built.from.some((part, i) => part !== from[i])) {
      built = { from, limits: limitsFor(env, fetchImpl, log, { memory }) };
    }
    return built.limits;
  };
}
