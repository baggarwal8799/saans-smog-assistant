// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { body, gemini, post, quietLog, withAir } from '../test/apiHelpers.js';
import { profile } from '../test/fixtures.js';
import { createAssistantHandler } from './handler.js';
import { clearAirCache } from './serverAir.js';

/** A fresh handler per test: its own answer cache and rate-limit counters. */
let handleAssistant = createAssistantHandler();

beforeEach(() => {
  handleAssistant = createAssistantHandler();
  clearAirCache();
  quietLog.warn.mockClear();
});

describe('handleAssistant', () => {
  it('rejects wrong methods, content types, bad JSON and oversized bodies', async () => {
    expect((await handleAssistant(new Request('http://x/api', { method: 'GET' }), {})).status).toBe(405);
    expect((await handleAssistant(post('x', { 'content-type': 'text/plain' }), {})).status).toBe(415);
    expect((await handleAssistant(post('{bad'), {})).status).toBe(400);
    expect((await handleAssistant(post(body({ lang: 'xx' })), {})).status).toBe(400);
    expect((await handleAssistant(post('"' + 'x'.repeat(15_100) + '"'), {})).status).toBe(413);
  });

  it('answers every refusal with a code from the contract, never English text', async () => {
    const cases: [Request, number, string][] = [
      [new Request('http://x/api', { method: 'GET' }), 405, 'method_not_allowed'],
      [post('x', { 'content-type': 'text/plain' }), 415, 'unsupported_media_type'],
      [post(body(), { 'sec-fetch-site': 'cross-site' }), 403, 'forbidden_origin'],
      [post(body(), { 'content-length': '99999' }), 413, 'too_large'],
      [post('"' + 'x'.repeat(15_100) + '"'), 413, 'too_large'],
      [post('{bad'), 400, 'invalid_request'],
      [post(body({ lang: 'xx' })), 400, 'invalid_request'],
    ];
    for (const [request, status, code] of cases) {
      const res = await handleAssistant(request, {}, fetch, quietLog);
      expect(res.status, code).toBe(status);
      expect(await res.json()).toEqual({ error: code });
    }
  });

  it('accepts only the exact JSON media type, never one that merely contains it', async () => {
    const status = async (type: string) => (await handleAssistant(post(body(), { 'content-type': type }), {})).status;
    // 503: the request got past the type check to the missing-key check.
    expect(await status('application/json; charset=utf-8')).toBe(503);
    for (const bad of ['text/plain; x=application/json', 'application/json-seq', 'application/jsonp', 'text/plain']) {
      expect(await status(bad), bad).toBe(415);
    }
  });

  it('refuses cross-site browser requests and oversized declared bodies before reading them', async () => {
    expect((await handleAssistant(post(body(), { 'sec-fetch-site': 'cross-site' }), {})).status).toBe(403);
    const evil = { origin: 'https://evil.example', host: 'saans.vercel.app' };
    expect((await handleAssistant(post(body(), evil), {})).status).toBe(403);
    const own = { origin: 'https://saans.vercel.app', host: 'saans.vercel.app' };
    expect((await handleAssistant(post(body(), own), {})).status).toBe(503);
    expect((await handleAssistant(post(body(), { 'content-length': '99999' }), {})).status).toBe(413);
  });

  it('refuses a POST with neither a same-origin Origin nor Sec-Fetch-Site: same-origin (scripts, curl)', async () => {
    const bare = new Request('http://localhost/api/assistant', {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: 'localhost' },
      body: JSON.stringify(body()),
    });
    const res = await handleAssistant(bare, { GEMINI_API_KEY: 'k' }, vi.fn());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden_origin' });
  });

  it('answers "not configured" when no Gemini key is set, without calling anything', async () => {
    const f = vi.fn();
    const res = await handleAssistant(post(body()), {}, f);
    expect(res.status).toBe(503);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ error: 'not_configured' });
    expect(f).not.toHaveBeenCalled();
  });

  it('returns Gemini text and caches identical requests', async () => {
    const f = gemini('Here is your plan.');
    const net = withAir(f);
    const r1 = await handleAssistant(post(body()), { GEMINI_API_KEY: 'k' }, net);
    const r2 = await handleAssistant(post(body()), { GEMINI_API_KEY: 'k' }, net);
    expect(await r1.json()).toEqual({ text: 'Here is your plan.' });
    expect(await r2.json()).toEqual({ text: 'Here is your plan.' });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('builds the plan from its own air data and ignores a forged context in the request', async () => {
    const f = gemini('ok');
    const forged = {
      usAqi: 999,
      level: 'Good',
      recommendations: [{ title: 'Masks are harmful for children', impact: 'Saves 9999 kg' }],
    };
    const res = await handleAssistant(post({ ...body(), context: forged }), { GEMINI_API_KEY: 'k' }, withAir(f));
    expect(res.status).toBe(200);
    const sent = JSON.parse(String((f.mock.calls[0]?.[1] as RequestInit).body)).contents[0].parts[0].text as string;
    expect(sent).toContain('US AQI 262'); // from the Open-Meteo data the server fetched
    expect(sent).toContain('Wear a well-fitted N95'); // the server's own plan
    expect(sent).not.toMatch(/999|harmful|9999/);
  });

  it('gives the model the smog-trap forecast and the household from the request', async () => {
    const f = gemini('ok');
    const coal = post(body({ profile: { ...profile(), heating: 'coal' } }));
    await handleAssistant(coal, { GEMINI_API_KEY: 'k' }, withAir(f));
    const sent = JSON.parse(String((f.mock.calls[0]?.[1] as RequestInit).body)).contents[0].parts[0].text as string;
    expect(sent).toMatch(/Smog trap \(cold, still air holding smoke near the ground\): 18:00 today to 07:00 tomorrow/);
    expect(sent).toMatch(/Cleanest 2 h window: \d\d:00–\d\d:00 (today|tomorrow) \(PM2\.5/);
    expect(sent).toContain('Never burn coal');
  });

  it('answers "unavailable" when the air data cannot be fetched, without calling Gemini', async () => {
    const f = vi.fn<typeof fetch>(async () => new Response('down', { status: 503 }));
    const res = await handleAssistant(post(body()), { GEMINI_API_KEY: 'k' }, f, quietLog);
    expect(res.status).toBe(502);
    expect(f.mock.calls.some((c) => String(c[0]).includes('generativelanguage'))).toBe(false);
  });

  const nonErrorFailure =
    'logs "unknown" and answers "unavailable" ' + 'when air or Gemini fail with something that is not an Error';
  it(nonErrorFailure, async () => {
    const env = { GEMINI_API_KEY: 'k' };
    const noAir = vi.fn<typeof fetch>().mockRejectedValue('offline');
    expect((await handleAssistant(post(body()), env, noAir, quietLog)).status).toBe(502);
    expect(quietLog.warn).toHaveBeenCalledWith('assistant: air data unavailable', 'unknown');
    const noModel = withAir(vi.fn<typeof fetch>().mockRejectedValue('connection reset'));
    expect(await (await handleAssistant(post(body()), env, noModel, quietLog)).json()).toEqual({
      error: 'ai_unavailable',
    });
    expect(quietLog.warn).toHaveBeenCalledWith('assistant: no answer', 'unknown');
  });

  it('reports the free-tier limit as "rate limited" and never leaks upstream text', async () => {
    const f = withAir(async () => new Response('quota exceeded for key AIza...', { status: 429 }));
    const res = await handleAssistant(post(body()), { GEMINI_API_KEY: 'secret' }, f, quietLog);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
    const text = JSON.stringify(await res.json());
    expect(text).toBe('{"error":"ai_rate_limited"}');
    expect(quietLog.warn).toHaveBeenCalled();
  });

  it('reports other Gemini failures as "unavailable" and does not cache them', async () => {
    const down = withAir(async () => new Response('boom', { status: 500 }));
    const res = await handleAssistant(post(body()), { GEMINI_API_KEY: 'k' }, down, quietLog);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'ai_unavailable' });
    const ok = gemini('Back now.');
    const back = await handleAssistant(post(body()), { GEMINI_API_KEY: 'k' }, withAir(ok));
    expect(await back.json()).toEqual({ text: 'Back now.' });
  });

  it('rate-limits a single client', async () => {
    const headers = { 'x-forwarded-for': '9.9.9.9' };
    const statuses: number[] = [];
    for (let i = 0; i < 16; i++) {
      const res = await handleAssistant(post(body({ mode: 'question', question: `q${i}` }), headers), {});
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 15).every((s) => s === 503)).toBe(true);
    expect(statuses[15]).toBe(429);
    const limited = await handleAssistant(post(body(), headers), {});
    expect(await limited.json()).toEqual({ error: 'too_many_requests' });
  });
});
