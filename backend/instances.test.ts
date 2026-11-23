// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { isoDate } from '../core/isoTime.js';
import { body, gemini, post, quietLog, withAir } from '../test/apiHelpers.js';
import { fakeRedis, REDIS_URL, redisEnv } from '../test/fakeRedis.js';

/** A fresh copy of the handler module: what a new serverless instance (a cold start) runs, with empty memory. */
async function instance() {
  vi.resetModules();
  return (await import('./handler.js')).handleAssistant;
}

const env = { GEMINI_API_KEY: 'k', MAX_AI_REQUESTS_PER_CLIENT_PER_DAY: '1' };
const headers = { 'x-forwarded-for': '7.7.7.7' };
const question = (q: string) => post(body({ mode: 'question', question: q }), headers);

/** One network for both instances: Upstash calls go to the shared fake Redis, the rest to air data and Gemini. */
function network() {
  const redis = fakeRedis();
  const rest = withAir(gemini('Keep the windows shut tonight.'));
  const net = vi.fn<typeof fetch>(async (input, init) =>
    String(input).startsWith(REDIS_URL) ? redis.fetchImpl(input, init) : rest(input, init),
  );
  return { net, redis };
}

describe('limits across instances', () => {
  it('with Upstash, a client capped on one instance is still capped on a fresh one', async () => {
    const { net, redis } = network();
    const a = await instance();
    expect((await a(question('Is the air bad?'), { ...env, ...redisEnv }, net, quietLog)).status).toBe(200);
    const b = await instance();
    const second = await b(question('And tomorrow?'), { ...env, ...redisEnv }, net, quietLog);
    expect(second.status).toBe(429);
    expect(await second.json()).toEqual({ error: 'daily_limit' });
    expect(redis.data.get(`client:${isoDate(new Date().toISOString())}:7.7.7.7`)?.n).toBe(2);
  });

  it('without Upstash, each instance counts on its own (a cold start starts again)', async () => {
    const { net, redis } = network();
    const a = await instance();
    expect((await a(question('Is the air bad?'), env, net, quietLog)).status).toBe(200);
    expect((await a(question('And tomorrow?'), env, net, quietLog)).status).toBe(429);
    const b = await instance();
    expect((await b(question('And tomorrow?'), env, net, quietLog)).status).toBe(200);
    expect(redis.fetchImpl).not.toHaveBeenCalled();
  });

  it('with Upstash down, the global cap refuses: no Gemini call, "rate limited"', async () => {
    const down = vi.fn<typeof fetch>(async (input) =>
      String(input).startsWith(REDIS_URL) ? new Response('', { status: 503 }) : new Response('{}'),
    );
    const res = await (await instance())(question('Is the air bad?'), { ...env, ...redisEnv }, down, quietLog);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'ai_rate_limited' });
    expect(down.mock.calls.every(([url]) => String(url).startsWith(REDIS_URL))).toBe(true);
  });
});
