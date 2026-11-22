// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeRedis, redisEnv } from './fake-redis';
import { REQUESTS_PER_MINUTE, limitsFor, resetLimits } from './limits';

const log = { warn: vi.fn() };
const at = (iso: string) => () => new Date(iso);
const failing = vi.fn<typeof fetch>(async () => new Response('{"error":"down"}', { status: 503 }));

beforeEach(() => {
  resetLimits();
  log.warn.mockClear();
  failing.mockClear();
});

describe('limits on a shared Upstash store', () => {
  it('shares every count across two instances', async () => {
    const redis = fakeRedis();
    const a = limitsFor(redisEnv, redis.fetchImpl, log);
    const b = limitsFor(redisEnv, redis.fetchImpl, log);
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
    const limits = limitsFor(redisEnv, redis.fetchImpl, log, at('2026-11-18T23:00:00Z'));
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
    expect(await limitsFor(redisEnv, redis.fetchImpl, log, at('2026-11-18T23:59:59Z')).takeClient(1, 'ip')).toBe(true);
    expect(await limitsFor(redisEnv, redis.fetchImpl, log, at('2026-11-18T23:59:59Z')).takeClient(1, 'ip')).toBe(false);
    expect(await limitsFor(redisEnv, redis.fetchImpl, log, at('2026-11-19T00:00:00Z')).takeClient(1, 'ip')).toBe(true);
  });
});

describe('limits when the shared store fails', () => {
  it('fails CLOSED for the global daily cap, logging one line per refusal', async () => {
    const limits = limitsFor(redisEnv, failing, log);
    expect(await limits.globalRemaining(1000)).toBe(0);
    expect(await limits.takeGlobal(1000)).toBe(false);
    expect(log.warn).toHaveBeenCalledTimes(2);
    expect(log.warn.mock.calls[0]).toEqual([expect.stringMatching(/global daily cap refuses/), 'Upstash HTTP 503']);
  });

  it('falls back to this instance memory for the per-client limits', async () => {
    const limits = limitsFor(redisEnv, failing, log);
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
    const limits = limitsFor({}, net, log);
    expect(await limits.takeGlobal(1)).toBe(true);
    expect(await limits.globalRemaining(1)).toBe(0);
    expect(await limits.takeClient(1, 'ip')).toBe(true);
    expect(await limitsFor({}, net, log).takeClient(1, 'ip')).toBe(false); // module memory: same instance
    expect(net).not.toHaveBeenCalled();
    resetLimits();
    expect(await limits.globalRemaining(1)).toBe(1);
  });
});
