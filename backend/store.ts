/** Counters in this instance's memory, or in Upstash Redis (REST over fetch) so every instance shares one count. */
import { asArray, isRecord } from '../core/parse.js';
import { errorText } from './log.js';
import { withTimeout } from './timeout.js';
import type { Logger, StoreEnv } from './types.js';

export interface CounterStore {
  /** Adds `by` (default 1) to `key` and returns the new count. The first write sets the TTL; later writes keep it. */
  incr(key: string, ttlSeconds: number, by?: number): Promise<number>;
}

export class MemoryStore implements CounterStore {
  private readonly counts = new Map<string, { n: number; expires: number }>();

  constructor(
    private readonly maxKeys = 10_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  incr(key: string, ttlSeconds: number, by = 1): Promise<number> {
    const t = this.now();
    const hit = this.counts.get(key);
    const entry = hit && hit.expires > t ? hit : { n: 0, expires: t + ttlSeconds * 1000 };
    entry.n += by;
    // Re-inserted so the Map's order is least recently used first.
    this.counts.delete(key);
    this.counts.set(key, entry);
    // Bounded memory: forget the oldest key. It can only gain that key a fresh count, never block anyone.
    if (this.counts.size > this.maxKeys) {
      const [oldest = key] = this.counts.keys();
      this.counts.delete(oldest);
    }
    return Promise.resolve(entry.n);
  }

  clear(): void {
    this.counts.clear();
  }
}

/** A hung Redis must not hold the request: past this the call fails and the caller's error policy applies. */
export const UPSTASH_TIMEOUT_MS = 1500;

/** Upstash Redis over REST: one pipeline of INCR (or INCRBY) and EXPIRE NX per count, so the TTL is set once. */
export class UpstashStore implements CounterStore {
  private readonly url: string;

  constructor(
    url: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    let end = url.length;
    while (end > 0 && url[end - 1] === '/') end--; // trailing slashes, without a backtracking regex
    this.url = url.slice(0, end);
  }

  async incr(key: string, ttlSeconds: number, by = 1): Promise<number> {
    const add = by === 1 ? ['INCR', key] : ['INCRBY', key, String(by)];
    return withTimeout(UPSTASH_TIMEOUT_MS, 'Upstash timed out', async (signal) => {
      const res = await this.fetchImpl(`${this.url}/pipeline`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify([add, ['EXPIRE', key, String(ttlSeconds), 'NX']]),
        signal,
      });
      // The error text never includes the token: only the status or Redis's own message.
      if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
      return countOf(await res.json());
    });
  }
}

function countOf(reply: unknown): number {
  const first = asArray(reply)[0];
  const entry = isRecord(first) ? first : {};
  if (typeof entry.result === 'number') return entry.result;
  throw new Error(`Upstash: ${typeof entry.error === 'string' ? entry.error : 'no count in reply'}`);
}

export function sharedStore(env: StoreEnv, fetchImpl: typeof fetch = fetch): CounterStore | undefined {
  const url = env.UPSTASH_REDIS_REST_URL?.trim();
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();
  return url && token ? new UpstashStore(url, token, fetchImpl) : undefined;
}

export function withFallback(primary: CounterStore, fallback: CounterStore, log: Logger): CounterStore {
  return {
    async incr(key, ttlSeconds, by) {
      try {
        return await primary.incr(key, ttlSeconds, by);
      } catch (err) {
        log.warn('assistant: shared limit store failed, counting this client in memory', errorText(err));
        return fallback.incr(key, ttlSeconds, by);
      }
    },
  };
}
