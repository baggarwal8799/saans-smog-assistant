import type { CounterStore } from './store.js';

/**
 * Fixed-window limiter on a counter store: a client's window opens at its first request and lasts `windowSeconds`
 * (the key's TTL). Enough to keep one client from draining the free Gemini quota. Shared across instances when the
 * store is (store.ts), per instance otherwise.
 */
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

export function clientKey(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || headers.get('x-real-ip') || 'anonymous';
}
