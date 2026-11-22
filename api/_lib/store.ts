/**
 * Counters behind the rate limit and the daily caps. By default they live in this instance's memory, so every
 * serverless instance counts on its own. With UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN set, they live in
 * Upstash Redis (its REST API over plain fetch), so every instance shares one count.
 */
export interface CounterStore {
  /** Adds `by` (default 1) to `key` and returns the new count. The first write sets the TTL; later writes keep it. */
  incr(key: string, ttlSeconds: number, by?: number): Promise<number>;
}

export interface StoreEnv {
  UPSTASH_REDIS_REST_URL?: string | undefined;
  UPSTASH_REDIS_REST_TOKEN?: string | undefined;
}

/** The in-memory store: the default, and the per-client fallback when the shared store fails. */
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
      const oldest = this.counts.keys().next().value;
      if (oldest !== undefined) this.counts.delete(oldest);
    }
    return Promise.resolve(entry.n);
  }

  clear(): void {
    this.counts.clear();
  }
}

/** A hung Redis must not hold the request: past this the call fails and the caller's error policy applies. */
export const UPSTASH_TIMEOUT_MS = 1500;

type PipelineReply = { result?: unknown; error?: string }[];

/** Upstash Redis over REST: one pipeline of INCR (or INCRBY) and EXPIRE NX per count, so the TTL is set once. */
export class UpstashStore implements CounterStore {
  private readonly url: string;

  constructor(
    url: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.url = url.replace(/\/+$/, '');
  }

  async incr(key: string, ttlSeconds: number, by = 1): Promise<number> {
    const add = by === 1 ? ['INCR', key] : ['INCRBY', key, String(by)];
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(new DOMException('Upstash timed out', 'TimeoutError')), UPSTASH_TIMEOUT_MS);
    try {
      const res = await this.fetchImpl(`${this.url}/pipeline`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify([add, ['EXPIRE', key, String(ttlSeconds), 'NX']]),
        signal: abort.signal,
      });
      // The error text never includes the token: only the status or Redis's own message.
      if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
      const reply = (await res.json()) as PipelineReply;
      const first = Array.isArray(reply) ? reply[0] : undefined;
      if (typeof first?.result !== 'number') throw new Error(`Upstash: ${first?.error ?? 'no count in reply'}`);
      return first.result;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** The shared store when both Upstash variables are set, otherwise undefined (the caller uses memory). */
export function sharedStore(env: StoreEnv, fetchImpl: typeof fetch = fetch): CounterStore | undefined {
  const url = env.UPSTASH_REDIS_REST_URL?.trim();
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();
  return url && token ? new UpstashStore(url, token, fetchImpl) : undefined;
}

/** Uses `primary`, and on any error logs one line and counts in `fallback` instead. */
export function withFallback(primary: CounterStore, fallback: CounterStore, log: Pick<Console, 'warn'>): CounterStore {
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

export const errorText = (err: unknown): string => (err instanceof Error ? err.message : 'unknown');
