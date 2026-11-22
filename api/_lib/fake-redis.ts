/**
 * A fake Upstash REST endpoint for tests: answers /pipeline with INCR, INCRBY and EXPIRE NX on an in-memory map,
 * with an adjustable clock for TTLs. Several stores pointed at it behave like instances sharing one Redis. Test-only.
 */
import { vi } from 'vitest';

export const REDIS_URL = 'https://saans-test.upstash.io';
export const REDIS_TOKEN = 'test-token';
export const redisEnv = { UPSTASH_REDIS_REST_URL: REDIS_URL, UPSTASH_REDIS_REST_TOKEN: REDIS_TOKEN };

export function fakeRedis() {
  const data = new Map<string, { n: number; expiresAt?: number }>();
  const clock = { now: 0 };
  const live = (key: string) => {
    const e = data.get(key);
    if (e?.expiresAt !== undefined && e.expiresAt <= clock.now) data.delete(key);
    return data.get(key);
  };
  // eslint-disable-next-line complexity -- this test double intentionally mirrors three Redis commands.
  const run = ([cmd, key = '', arg = '0', flag]: string[]): { result: number } | { error: string } => {
    const e = live(key) ?? { n: 0 };
    if (cmd === 'INCR' || cmd === 'INCRBY') {
      e.n += cmd === 'INCR' ? 1 : Number(arg);
      data.set(key, e);
      return { result: e.n };
    }
    if (cmd === 'EXPIRE' && flag === 'NX') {
      if (!data.has(key) || e.expiresAt !== undefined) return { result: 0 };
      e.expiresAt = clock.now + Number(arg) * 1000;
      return { result: 1 };
    }
    return { error: `ERR unknown command '${String(cmd)}'` };
  };
  const fetchImpl = vi.fn<typeof fetch>((input, init) => {
    const auth = (init?.headers as Record<string, string> | undefined)?.authorization;
    let url: string;
    if (typeof input === 'string') url = input;
    else if (input instanceof URL) url = input.href;
    else url = input.url;
    if (url !== `${REDIS_URL}/pipeline` || auth !== `Bearer ${REDIS_TOKEN}`) {
      return Promise.resolve(new Response('{"error":"Unauthorized"}', { status: 401 }));
    }
    const rawBody = init?.body;
    const commands = JSON.parse(typeof rawBody === 'string' ? rawBody : '[]') as string[][];
    return Promise.resolve(new Response(JSON.stringify(commands.map(run))));
  });
  /** Seconds left on `key`, or undefined when it has no TTL (or does not exist). */
  const ttl = (key: string): number | undefined => {
    const at = live(key)?.expiresAt;
    return at === undefined ? undefined : (at - clock.now) / 1000;
  };
  return { fetchImpl, data, clock, ttl };
}
