// @vitest-environment node
import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';

import { describe, expect, it, vi } from 'vitest';

import { LIMITS } from '../core/contract.js';
import { assistantEnv, readBody, toHeaders, toWebRequest } from './nodeAdapter.js';

const fakeReq = (o: Record<string, unknown>) => ({ headers: {}, socket: {}, ...o }) as unknown as IncomingMessage;

/** A request stream that emits `chunks` and then ends (or fails with `error`). */
function streamed(chunks: Buffer[], opts: { method?: string; error?: Error } = {}) {
  const req = Object.assign(new EventEmitter(), { method: opts.method ?? 'POST', headers: {}, resume: vi.fn() });
  const body = readBody(req as unknown as IncomingMessage);
  for (const c of chunks) req.emit('data', c);
  if (opts.error) req.emit('error', opts.error);
  else req.emit('end');
  return { body, req };
}

describe('assistantEnv', () => {
  it('takes only the settings the handler reads', () => {
    const env = assistantEnv({ GEMINI_API_KEY: 'k', GEMINI_MODEL: 'm', PATH: '/bin', UPSTASH_REDIS_REST_URL: 'u' });
    expect(env).toEqual({
      GEMINI_API_KEY: 'k',
      GEMINI_MODEL: 'm',
      MAX_AI_CALLS_PER_DAY: undefined,
      MAX_AI_REQUESTS_PER_CLIENT_PER_DAY: undefined,
      UPSTASH_REDIS_REST_URL: 'u',
      UPSTASH_REDIS_REST_TOKEN: undefined,
    });
  });
});

describe('toHeaders and toWebRequest', () => {
  it('keeps single-string headers and drops repeated ones', () => {
    const h = toHeaders(fakeReq({ headers: { 'set-cookie': ['a=1', 'b=2'], accept: 'x/y' } }));
    expect(h.has('set-cookie')).toBe(false);
    expect(h.get('accept')).toBe('x/y');
  });

  it('builds the handler request on localhost with GET when the request has no Host or method', () => {
    const r = toWebRequest(fakeReq({}), '');
    expect(r.url).toBe('http://localhost/api/assistant');
    expect(r.method).toBe('GET');
    expect(r.body).toBeNull();
  });

  it('uses the Host header, the method, the body and the headers it is given', async () => {
    const req = fakeReq({ method: 'POST', headers: { host: 'saans.example', accept: 'x/y' } });
    const r = toWebRequest(req, '{"a":1}', new Headers({ 'x-test': '1' }));
    expect(r.url).toBe('http://saans.example/api/assistant');
    expect(r.method).toBe('POST');
    expect(r.headers.get('x-test')).toBe('1');
    expect(r.headers.has('accept')).toBe(false);
    expect(await r.text()).toBe('{"a":1}');
    expect(toWebRequest(req, '').headers.get('accept')).toBe('x/y');
  });
});

describe('readBody', () => {
  it('reads nothing for GET and HEAD', async () => {
    expect(await streamed([Buffer.from('x')], { method: 'GET' }).body).toBe('');
    expect(await streamed([Buffer.from('x')], { method: 'HEAD' }).body).toBe('');
  });

  it('joins the chunks of a body up to exactly LIMITS.bodyBytes', async () => {
    expect(await streamed([Buffer.from('{"a":'), Buffer.from('1}')]).body).toBe('{"a":1}');
    const full = await streamed([Buffer.alloc(LIMITS.bodyBytes, 'a')]).body;
    expect(full?.length).toBe(LIMITS.bodyBytes);
  });

  it('gives null past LIMITS.bodyBytes and stops buffering, leaving the socket open for the 413', async () => {
    const { body, req } = streamed([Buffer.alloc(LIMITS.bodyBytes, 'a'), Buffer.from('a'), Buffer.from('a')]);
    expect(await body).toBeNull();
    expect(req.resume).toHaveBeenCalledOnce();
    expect(req.listenerCount('data')).toBe(0);
  });

  it('gives null when the upload fails', async () => {
    expect(await streamed([Buffer.from('{')], { error: new Error('reset') }).body).toBeNull();
  });
});
