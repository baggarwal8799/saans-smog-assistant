// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { isoDate } from '../core/isoTime.js';
import {
  clientDailyLimit,
  dailyLimit,
  DailyQuota,
  DEFAULT_MAX_AI_CALLS_PER_DAY,
  DEFAULT_MAX_AI_REQUESTS_PER_CLIENT_PER_DAY,
  secondsToUtcMidnight,
} from './quota.js';
import { MemoryStore } from './store.js';

describe('daily AI call ceiling', () => {
  it('reads MAX_AI_CALLS_PER_DAY, falling back to the default for missing or bad values', () => {
    expect(dailyLimit(undefined)).toBe(DEFAULT_MAX_AI_CALLS_PER_DAY);
    expect(DEFAULT_MAX_AI_CALLS_PER_DAY).toBe(1000);
    expect(dailyLimit('50')).toBe(50);
    expect(dailyLimit('0')).toBe(0);
    for (const bad of ['', ' ', '-1', '2.5', 'lots']) expect(dailyLimit(bad)).toBe(DEFAULT_MAX_AI_CALLS_PER_DAY);
  });

  it('counts calls up to the limit and starts again on the next UTC day', async () => {
    let now = new Date('2026-11-18T23:59:00Z');
    const quota = new DailyQuota(new MemoryStore(), 'global', () => now);
    expect(await quota.take(2)).toBe(true);
    expect(await quota.take(2)).toBe(true);
    expect(await quota.take(2)).toBe(false);
    expect(await quota.remaining(2)).toBe(0);
    now = new Date('2026-11-19T00:00:00Z');
    expect(await quota.remaining(2)).toBe(2);
    expect(await quota.take(2)).toBe(true);
    expect(await quota.remaining(2)).toBe(1);
  });

  it('expires each day key at the next 00:00 UTC', () => {
    expect(secondsToUtcMidnight(new Date('2026-11-18T23:59:00Z'))).toBe(60);
    expect(secondsToUtcMidnight(new Date('2026-11-18T00:00:00Z'))).toBe(86_400);
    expect(secondsToUtcMidnight(new Date('2026-11-18T23:59:59.900Z'))).toBe(1);
  });

  it('reads MAX_AI_REQUESTS_PER_CLIENT_PER_DAY the same way, defaulting to 60', () => {
    expect(DEFAULT_MAX_AI_REQUESTS_PER_CLIENT_PER_DAY).toBe(60);
    expect(clientDailyLimit(undefined)).toBe(60);
    expect(clientDailyLimit('5')).toBe(5);
    expect(clientDailyLimit('-3')).toBe(60);
  });

  it('counts each client key on its own, and forgets the least recently used key past its memory bound', async () => {
    const quota = new DailyQuota(new MemoryStore(2), 'client', () => new Date('2026-11-18T10:00:00Z'));
    expect(await quota.take(1, 'a')).toBe(true);
    expect(await quota.take(1, 'a')).toBe(false);
    expect(await quota.take(1, 'b')).toBe(true);
    expect(await quota.remaining(1, 'a')).toBe(0);
    expect(await quota.take(1, 'c')).toBe(true); // a third key: "b", the least recently used, is forgotten
    expect(await quota.remaining(1, 'a')).toBe(0);
    expect(await quota.remaining(1, 'b')).toBe(1);
  });

  it("counts under today's real UTC date when no clock is given", async () => {
    const store = new MemoryStore();
    const incr = vi.spyOn(store, 'incr');
    expect(await new DailyQuota(store, 'global').take(1)).toBe(true);
    expect(incr.mock.calls[0]?.[0]).toBe(`global:${isoDate(new Date().toISOString())}:*`);
  });
});
