import type { CounterStore } from './store.js';

/** Fixed window: it opens at a client's first request and lasts `windowSeconds`, the key's TTL. */
export class RateLimiter {
  constructor(
    private readonly store: CounterStore,
    private readonly limit: number,
    private readonly windowSeconds: number,
  ) {}

  async allow(key: string): Promise<boolean> {
    return (await this.store.incr(`rate:${key}`, this.windowSeconds)) <= this.limit;
  }
}

/**
 * The client a request counts against. Proxies append the address they saw to `X-Forwarded-For`, so only the last
 * entry was written by our own proxy; earlier entries come from the client and can be forged to dodge the limit.
 * (Vercel sends a single entry, which is the last one.)
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  return forwarded || headers.get('x-real-ip') || 'anonymous';
}
