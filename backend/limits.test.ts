// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeRedis, redisEnv } from '../test/fakeRedis.js';
import { limitMemory, limitsFor, limitStack, REQUESTS_PER_MINUTE } from './limits.js';
import type { AssistantEnv } from './types.js';

const log = { warn: vi.fn() };
const at = (iso: string) => () => new Date(iso);
const failing = vi.fn<typeof fetch>(async () => new Response('{"error":"down"}', { status: 503 }));

/** This instance's memory: a fresh one for each test, as a new serverless instance starts with. */
let memory = limitMemory();

beforeEach(() => {
  memory = limitMemory();
  log.warn.mockClear();
  failing.mockClear();
});

describe('limits on a shared Upstash store', () => {
  it('shares every count across two instances', async () => {
    const redis = fakeRedis();
    const a = limitsFor(redisEnv, redis.fetchImpl, log, { memory });
    const b = limitsFor(redisEnv, redis.fetchImpl, log, { memory });
    expect(await a.takeClient(2, 'ip')).toBe(true);
    expect(await b.takeClient(2, 'ip')).toBe(true);
    expect(await a.takeClient(2, 'ip')).toBe(false);
    expect(await a.takeGlobal(1)).toBe(true);
    expect(await b.globalRemaining(1)).toBe(0);
    expect(await b.takeGlobal(1)).toBe(false);
    for (let i = 0; i < REQUESTS_PER_MINUTE; i++) expect(await (i % 2 ? a : b).allowMinute('ip')).toBe(true);
    expect(await a.allowMinute('ip')).toBe(false);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('expires the minute key after 60 s and the day keys at 00:00 UTC', async () => {
    const redis = fakeRedis();
    const limits = limitsFor(redisEnv, redis.fetchImpl, log, { memory, now: at('2026-11-18T23:00:00Z') });
    await limits.allowMinute('ip');
    await limits.takeClient(5, 'ip');
    await limits.takeGlobal(5);
    expect(redis.ttl('rate:ip')).toBe(60);
    expect(redis.ttl('client:2026-11-18:ip')).toBe(3600);
    expect(redis.ttl('global:2026-11-18:*')).toBe(3600);
    redis.clock.now = 60_000;
    expect(redis.data.has('rate:ip')).toBe(true);
    expect(redis.ttl('rate:ip')).toBeUndefined(); // expired
  });

  it('starts a new day at zero, whatever the old key still holds', async () => {
    const redis = fakeRedis();
    const on = (iso: string) => limitsFor(redisEnv, redis.fetchImpl, log, { memory, now: at(iso) });
    expect(await on('2026-11-18T23:59:59Z').takeClient(1, 'ip')).toBe(true);
    expect(await on('2026-11-18T23:59:59Z').takeClient(1, 'ip')).toBe(false);
    expect(await on('2026-11-19T00:00:00Z').takeClient(1, 'ip')).toBe(true);
  });
});

describe('limits when the shared store fails', () => {
  it('fails CLOSED for the global daily cap, logging one line per refusal', async () => {
    const limits = limitsFor(redisEnv, failing, log, { memory });
    expect(await limits.globalRemaining(1000)).toBe(0);
    expect(await limits.takeGlobal(1000)).toBe(false);
    expect(log.warn).toHaveBeenCalledTimes(2);
    expect(log.warn.mock.calls[0]).toEqual([expect.stringMatching(/global daily cap refuses/), 'Upstash HTTP 503']);
  });

  it('falls back to this instance memory for the per-client limits', async () => {
    const limits = limitsFor(redisEnv, failing, log, { memory });
    expect(await limits.takeClient(1, 'ip')).toBe(true);
    expect(await limits.takeClient(1, 'ip')).toBe(false); // still counted, in memory
    for (let i = 0; i < REQUESTS_PER_MINUTE; i++) expect(await limits.allowMinute('ip')).toBe(true);
    expect(await limits.allowMinute('ip')).toBe(false);
    expect(log.warn).toHaveBeenCalledTimes(2 + REQUESTS_PER_MINUTE + 1);
    expect(String(log.warn.mock.calls[0]?.[0])).toMatch(/counting this client in memory/);
  });
});

describe('limits without Upstash', () => {
  it('count in memory per instance and make no network call', async () => {
    const net = vi.fn<typeof fetch>();
    const limits = limitsFor({}, net, log, { memory });
    expect(await limits.takeGlobal(1)).toBe(true);
    expect(await limits.globalRemaining(1)).toBe(0);
    expect(await limits.takeClient(1, 'ip')).toBe(true);
    expect(await limitsFor({}, net, log, { memory }).takeClient(1, 'ip')).toBe(false); // same instance memory
    expect(net).not.toHaveBeenCalled();
    expect(await limitsFor({}, net, log, { memory: limitMemory() }).globalRemaining(1)).toBe(1); // a new instance
  });
});

describe('limitStack', () => {
  it('builds the stack once and reuses it while the store settings, fetch and logger stay the same', () => {
    const net = vi.fn<typeof fetch>();
    const limitsOf = limitStack(memory);
    const keyOnly: AssistantEnv = { GEMINI_API_KEY: 'k' };
    const first = limitsOf({}, net, log);
    expect(limitsOf(keyOnly, net, log)).toBe(first);
    expect(limitsOf(redisEnv, net, log)).not.toBe(first);
    const other = limitsOf(redisEnv, vi.fn<typeof fetch>(), log);
    expect(limitsOf(redisEnv, vi.fn<typeof fetch>(), { warn: vi.fn() })).not.toBe(other);
  });

  it('keeps counting in the same memory when it rebuilds', async () => {
    const net = vi.fn<typeof fetch>();
    const limitsOf = limitStack(memory);
    expect(await limitsOf({}, net, log).takeClient(1, 'ip')).toBe(true);
    expect(await limitsOf({}, vi.fn<typeof fetch>(), log).takeClient(1, 'ip')).toBe(false);
  });
});
