/**
 * A fake Upstash REST endpoint for tests: answers /pipeline with INCR, INCRBY and EXPIRE NX on an in-memory map,
 * with an adjustable clock for TTLs. Several stores pointed at it behave like instances sharing one Redis. Test-only.
 */
import { vi } from 'vitest';

export const REDIS_URL = 'https://saans-test.upstash.io';
export const REDIS_TOKEN = 'test-token';
export const redisEnv = { UPSTASH_REDIS_REST_URL: REDIS_URL, UPSTASH_REDIS_REST_TOKEN: REDIS_TOKEN };

/** The URL a fetch call asks for, whether it was given a string, a URL or a Request. */
export const urlOf = (input: RequestInfo | URL): string => (input instanceof Request ? input.url : input.toString());

export function fakeRedis() {
  const data = new Map<string, { n: number; expiresAt?: number }>();
  const clock = { now: 0 };
  const live = (key: string) => {
    const e = data.get(key);
    if (e?.expiresAt !== undefined && e.expiresAt <= clock.now) data.delete(key);
    return data.get(key);
  };
  const incr = (key: string, by: number): { result: number } => {
    const e = live(key) ?? { n: 0 };
    e.n += by;
    data.set(key, e);
    return { result: e.n };
  };
  const expireNx = (key: string, seconds: number): { result: number } => {
    const e = live(key);
    if (!e || e.expiresAt !== undefined) return { result: 0 };
    e.expiresAt = clock.now + seconds * 1000;
    return { result: 1 };
  };
  const run = ([cmd = '', key = '', arg = '0', flag]: string[]): { result: number } | { error: string } => {
    if (cmd === 'INCR') return incr(key, 1);
    if (cmd === 'INCRBY') return incr(key, Number(arg));
    if (cmd === 'EXPIRE' && flag === 'NX') return expireNx(key, Number(arg));
    return { error: `ERR unknown command '${cmd}'` };
  };
  const respond = (input: RequestInfo | URL, init?: RequestInit): Response => {
    const auth = (init?.headers as Record<string, string> | undefined)?.authorization;
    if (urlOf(input) !== `${REDIS_URL}/pipeline` || auth !== `Bearer ${REDIS_TOKEN}`) {
      return new Response('{"error":"Unauthorized"}', { status: 401 });
    }
    const commands = JSON.parse(typeof init?.body === 'string' ? init.body : '') as string[][];
    return new Response(JSON.stringify(commands.map(run)));
  };
  const fetchImpl = vi.fn<typeof fetch>((input, init) => Promise.resolve(respond(input, init)));
  /** Seconds left on `key`, or undefined when it has no TTL (or does not exist). */
  const ttl = (key: string): number | undefined => {
    const at = live(key)?.expiresAt;
    return at === undefined ? undefined : (at - clock.now) / 1000;
  };
  return { fetchImpl, data, clock, ttl };
}
