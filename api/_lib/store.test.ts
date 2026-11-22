// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REDIS_TOKEN, REDIS_URL, fakeRedis, redisEnv } from './fake-redis';
import { MemoryStore, UPSTASH_TIMEOUT_MS, UpstashStore, sharedStore, withFallback } from './store';

afterEach(() => {
  vi.useRealTimers();
});

describe('MemoryStore', () => {
  it('counts per key, sets the TTL on the first write only, and starts again once it expires', async () => {
    let now = 0;
    const store = new MemoryStore(100, () => now);
    expect(await store.incr('k', 10)).toBe(1);
    now = 9_000;
    expect(await store.incr('k', 10)).toBe(2); // a later write does not push the expiry back
    expect(await store.incr('k', 10, 0)).toBe(2); // adding 0 only reads
    now = 10_000;
    expect(await store.incr('k', 10)).toBe(1);
    store.clear();
    expect(await store.incr('k', 10, 0)).toBe(0);
  });
});

describe('UpstashStore', () => {
  it('sends one pipeline of INCR and EXPIRE NX with the bearer token, and reads the count', async () => {
    const redis = fakeRedis();
    const store = new UpstashStore(`${REDIS_URL}/`, REDIS_TOKEN, redis.fetchImpl);
    expect(await store.incr('rate:1.1.1.1', 60)).toBe(1);
    const [url, init] = redis.fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${REDIS_URL}/pipeline`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${REDIS_TOKEN}`);
    expect(JSON.parse(String(init.body))).toEqual([['INCR', 'rate:1.1.1.1'], ['EXPIRE', 'rate:1.1.1.1', '60', 'NX']]);
    expect(await store.incr('rate:1.1.1.1', 60, 0)).toBe(1);
    expect(JSON.parse(String(redis.fetchImpl.mock.calls[1]?.[1]?.body))[0]).toEqual(['INCRBY', 'rate:1.1.1.1', '0']);
  });

  it('shares one count between two instances, and keeps the first TTL until the key expires', async () => {
    const redis = fakeRedis();
    const a = sharedStore(redisEnv, redis.fetchImpl);
    const b = sharedStore(redisEnv, redis.fetchImpl);
    expect(await a?.incr('k', 60)).toBe(1);
    redis.clock.now = 30_000;
    expect(await b?.incr('k', 60)).toBe(2);
    expect(redis.ttl('k')).toBe(30); // EXPIRE NX: the second write left the first TTL alone
    redis.clock.now = 60_000;
    expect(await a?.incr('k', 60)).toBe(1);
    expect(redis.ttl('k')).toBe(60);
  });

  it('is used only when both variables are set', () => {
    expect(sharedStore({})).toBeUndefined();
    expect(sharedStore({ UPSTASH_REDIS_REST_URL: REDIS_URL })).toBeUndefined();
    expect(sharedStore({ UPSTASH_REDIS_REST_URL: ' ', UPSTASH_REDIS_REST_TOKEN: REDIS_TOKEN })).toBeUndefined();
    expect(sharedStore(redisEnv)).toBeInstanceOf(UpstashStore);
  });

  it('throws on an HTTP error, a Redis error and a reply without a count, never echoing the token', async () => {
    const reply = (body: string, status = 200) => vi.fn<typeof fetch>(async () => new Response(body, { status }));
    const cases: [ReturnType<typeof reply>, RegExp][] = [
      [reply('{"error":"Unauthorized"}', 401), /Upstash HTTP 401/],
      [reply('[{"error":"ERR max requests limit exceeded"},{"result":0}]'), /max requests limit exceeded/],
      [reply('{"result":"OK"}'), /no count in reply/],
    ];
    for (const [f, message] of cases) {
      const err = await new UpstashStore(REDIS_URL, REDIS_TOKEN, f).incr('k', 60).catch((e: unknown) => e);
      expect(String(err)).toMatch(message);
      expect(String(err)).not.toContain(REDIS_TOKEN);
    }
  });

  it('gives up on a hung request after the timeout', async () => {
    vi.useFakeTimers();
    const hang = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason as Error));
        }),
    );
    const pending = new UpstashStore(REDIS_URL, REDIS_TOKEN, hang).incr('k', 60);
    const outcome = expect(pending).rejects.toThrow('Upstash timed out');
    await vi.advanceTimersByTimeAsync(UPSTASH_TIMEOUT_MS);
    await outcome;
  });
});

describe('withFallback', () => {
  it('counts in the fallback and logs one line when the primary fails', async () => {
    const log = { warn: vi.fn() };
    const broken = { incr: vi.fn(async () => Promise.reject(new Error('Upstash HTTP 503'))) };
    const memory = new MemoryStore();
    const store = withFallback(broken, memory, log);
    expect(await store.incr('k', 60)).toBe(1);
    expect(await store.incr('k', 60)).toBe(2);
    expect(log.warn).toHaveBeenCalledTimes(2);
    expect(log.warn.mock.calls[0]).toEqual([expect.stringMatching(/counting this client in memory/), 'Upstash HTTP 503']);
    expect(await withFallback(memory, broken, log).incr('k', 60)).toBe(3);
  });
});
