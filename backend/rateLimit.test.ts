// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { clientKey, RateLimiter } from './rateLimit.js';
import { MemoryStore } from './store.js';

describe('rate limiter', () => {
  it('allows up to the limit within the window, per client, then opens a new window', async () => {
    let now = 0;
    const rl = new RateLimiter(new MemoryStore(100, () => now), 2, 1);
    expect(await rl.allow('a')).toBe(true);
    now = 10;
    expect(await rl.allow('a')).toBe(true);
    now = 20;
    expect(await rl.allow('a')).toBe(false);
    expect(await rl.allow('b')).toBe(true);
    now = 1000; // the window opened at the first request and lasts 1 s
    expect(await rl.allow('a')).toBe(true);
  });

  it('keys by the forwarded IP our own proxy appended (the last one)', () => {
    // The last entry is the one our proxy appended; a client can put anything before it.
    expect(clientKey(new Headers({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))).toBe('2.2.2.2');
    expect(clientKey(new Headers({ 'x-forwarded-for': 'forged-by-client, 203.0.113.9' }))).toBe('203.0.113.9');
    expect(clientKey(new Headers({ 'x-real-ip': '3.3.3.3' }))).toBe('3.3.3.3');
    expect(clientKey(new Headers())).toBe('anonymous');
  });
});
