import { afterEach, describe, expect, it, vi } from 'vitest';

import { withTimeout } from './timeout.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('withTimeout', () => {
  it('returns the result and clears its timer', async () => {
    vi.useFakeTimers();
    await expect(withTimeout(1000, 'slow', () => Promise.resolve(7))).resolves.toBe(7);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts the signal with a TimeoutError carrying the message once the time is up', async () => {
    vi.useFakeTimers();
    const seen = withTimeout(
      1000,
      'no reply in 1000 ms',
      (signal) =>
        new Promise<never>((_, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason as Error));
        }),
    );
    const settled = expect(seen).rejects.toMatchObject({ name: 'TimeoutError', message: 'no reply in 1000 ms' });
    await vi.advanceTimersByTimeAsync(1000);
    await settled;
    expect(vi.getTimerCount()).toBe(0);
  });
});
