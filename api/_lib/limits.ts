/**
 * The assistant's three limits, on one counter store: per client per minute, per client per day, and the global
 * daily cap on Gemini calls. Shared across instances when Upstash is configured, per instance otherwise (store.ts).
 * Store errors: the global cap fails CLOSED, because it protects the Gemini quota; the per-client limits fall back to
 * this instance's memory, because refusing everyone over a Redis outage would take the assistant down.
 */
import { DailyQuota } from './quota.js';
import { RateLimiter } from './rateLimit.js';
import { MemoryStore, errorText, sharedStore, withFallback, type StoreEnv } from './store.js';
import type { Logger } from './log.js';

/** Per browser/IP: generous for a person clicking quickly, tight enough to protect the free Gemini quota. */
export const REQUESTS_PER_MINUTE = 15;
const MINUTE_SECONDS = 60;

// Kept for the life of the instance: the default counters, and the per-client fallback for the shared store.
// Separate stores, so a flood of new client keys can never evict the global count.
const minuteMemory = new MemoryStore(5_000);
const clientMemory = new MemoryStore(10_000);
const globalMemory = new MemoryStore(100);

export function resetLimits(): void {
  minuteMemory.clear();
  clientMemory.clear();
  globalMemory.clear();
}

export interface Limits {
  /** One request from `client` against its per-minute limit; false when over it. */
  allowMinute(client: string): Promise<boolean>;
  /** Takes one of the client's answered requests for today; false when its cap is reached. */
  takeClient(limit: number, client: string): Promise<boolean>;
  /** Gemini calls left today for everyone; 0 when the store fails. */
  globalRemaining(limit: number): Promise<number>;
  /** Takes one Gemini call from today's global cap; false when it is spent or the store fails. */
  takeGlobal(limit: number): Promise<boolean>;
}

export function limitsFor(
  env: StoreEnv,
  fetchImpl: typeof fetch,
  log: Logger,
  now: () => Date = () => new Date(),
): Limits {
  const shared = sharedStore(env, fetchImpl);
  const perClient = (memory: MemoryStore) => (shared ? withFallback(shared, memory, log) : memory);
  const minute = new RateLimiter(perClient(minuteMemory), REQUESTS_PER_MINUTE, MINUTE_SECONDS);
  const clients = new DailyQuota(perClient(clientMemory), 'client', now);
  const global = new DailyQuota(shared ?? globalMemory, 'global', now);
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
