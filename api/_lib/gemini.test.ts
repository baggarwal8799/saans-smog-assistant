// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAirCache } from '../../src/lib/aqi';
import { handleAssistant, resetAssistantState } from './assistant';
import { ANSWER_SCHEMA } from './answer';
import { CapReachedError, callGemini, modelChain, thinkingFor } from './gemini';
import { SYSTEM_INSTRUCTION } from './prompt';
import { body, gemini, geminiResponse, modelJson, post, quietLog, sentBody, withAir } from '../../src/test/apiHelpers';

beforeEach(() => {
  resetAssistantState();
  clearAirCache();
  quietLog.warn.mockClear();
});

describe('callGemini', () => {
  const req = 'PROMPT';
  const status = (code: number) => new Response('{}', { status: code });
  const reply = (parts: Record<string, unknown>[]) =>
    new Response(JSON.stringify({ candidates: [{ content: { parts } }] }));
  const lines = (text: string) => modelJson(text);
  const opts = { log: quietLog };

  it('sends the key in a header (never the URL) to gemini-flash-lite-latest, with low thinking and the schema', async () => {
    const f = gemini('ok');
    expect(await callGemini(req, { GEMINI_API_KEY: 'k' }, f)).toEqual({
      offTopic: false,
      reply: 'none',
      lines: ['ok'],
    });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent',
    );
    expect(url).not.toContain('k=');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('k');
    const sent = sentBody(f);
    expect(sent.generationConfig).toMatchObject({
      thinkingConfig: { thinkingLevel: 'low' },
      responseMimeType: 'application/json',
      responseSchema: JSON.parse(JSON.stringify(ANSWER_SCHEMA)),
    });
    expect(sent.systemInstruction.parts[0].text).toBe(SYSTEM_INSTRUCTION);
  });

  it('builds the model chain from GEMINI_MODEL, without duplicates, and ignores unsafe names', () => {
    expect(modelChain({})).toEqual(['gemini-flash-lite-latest', 'gemini-3.1-flash-lite', 'gemini-flash-latest']);
    expect(modelChain({ GEMINI_MODEL: 'gemini-3.8-flash' })[0]).toBe('gemini-3.8-flash');
    expect(modelChain({ GEMINI_MODEL: 'gemini-3.8-flash' })).toEqual([
      'gemini-3.8-flash',
      'gemini-flash-lite-latest',
      'gemini-3.1-flash-lite',
      'gemini-flash-latest',
    ]);
    expect(modelChain({ GEMINI_MODEL: 'gemini-flash-latest' })).toEqual([
      'gemini-flash-latest',
      'gemini-flash-lite-latest',
      'gemini-3.1-flash-lite',
    ]);
    for (const bad of ['../../evil?x=', 'gemini..x', 'a/b']) {
      expect(modelChain({ GEMINI_MODEL: bad })[0]).toBe('gemini-flash-lite-latest');
    }
  });

  it('only sends the thinking setting to models that accept it', () => {
    expect(thinkingFor('gemini-3.8-flash')).toEqual({ thinkingConfig: { thinkingLevel: 'low' } });
    expect(thinkingFor('gemini-flash-lite-latest')).toEqual({ thinkingConfig: { thinkingLevel: 'low' } });
    expect(thinkingFor('gemini-2.0-flash')).toEqual({});
  });

  it('falls back to the next model when one is busy, gone or times out', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(status(503))
      .mockRejectedValueOnce(timeout)
      .mockImplementationOnce(async () => reply([{ text: lines('Third time.') }]));
    expect((await callGemini(req, { GEMINI_API_KEY: 'k' }, f, opts)).lines).toEqual(['Third time.']);
    expect(f.mock.calls.map((c) => String(c[0]).split('/models/')[1])).toEqual([
      'gemini-flash-lite-latest:generateContent',
      'gemini-3.1-flash-lite:generateContent',
      'gemini-flash-latest:generateContent',
    ]);
  });

  it('retries a model once without the thinking setting when it rejects it (real Gemini 400, Nov 2026)', async () => {
    const rejection = { error: { message: 'Thinking level MINIMAL is not supported for this model.' } };
    const rejectThinking = new Response(JSON.stringify(rejection), { status: 400 });
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(rejectThinking)
      .mockImplementationOnce(async () => reply([{ text: lines('Works.') }]));
    expect((await callGemini(req, { GEMINI_API_KEY: 'k' }, f, opts)).lines).toEqual(['Works.']);
    const second = sentBody(f, 1);
    expect(String(f.mock.calls[1]?.[0])).toContain('gemini-flash-lite-latest');
    expect(second.generationConfig.thinkingConfig).toBeUndefined();
    expect(second.generationConfig.responseSchema).toBeDefined();
  });

  it('logs the Gemini error text on the server but stops on a persistent bad request', async () => {
    const error = JSON.stringify({ error: { message: 'Invalid argument xyz' } });
    const bad = vi.fn<typeof fetch>(async () => new Response(error, { status: 400 }));
    await expect(callGemini(req, { GEMINI_API_KEY: 'k' }, bad, opts)).rejects.toThrow('Invalid argument xyz');
    expect(bad).toHaveBeenCalledTimes(2);
    expect(String(quietLog.warn.mock.calls[0]?.[0])).toContain('Invalid argument xyz');
  });

  it('reports the last failure when every model is busy', async () => {
    const busy = vi.fn<typeof fetch>().mockImplementation(async () => status(429));
    const res = await handleAssistant(post(body()), { GEMINI_API_KEY: 'k' }, withAir(busy), quietLog);
    expect(res.status).toBe(429);
    // Every model busy: a short pause and one more round, then the honest "busy" error.
    expect(busy).toHaveBeenCalledTimes(6);
  });

  it('ignores "thought" parts, and tries the next model when a reply misses the schema or is cut off', async () => {
    const withThought = vi.fn<typeof fetch>(async () =>
      reply([{ text: 'thinking…', thought: true }, { text: lines('Real answer.') }]),
    );
    expect((await callGemini(req, { GEMINI_API_KEY: 'k' }, withThought)).lines).toEqual(['Real answer.']);
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(geminiResponse('{"offTopic":false,"reply":"no","lines":["Wear an N95 outd', 'MAX_TOKENS'))
      .mockResolvedValueOnce(geminiResponse('Plain prose, not JSON.'))
      .mockResolvedValueOnce(geminiResponse(lines('Complete.')));
    expect((await callGemini(req, { GEMINI_API_KEY: 'k' }, f, opts)).lines).toEqual(['Complete.']);
    expect(String(quietLog.warn.mock.calls[0]?.[0])).toMatch(
      /does not fit the schema \(MAX_TOKENS\)\), trying next model/,
    );
  });

  it('treats empty or safety-blocked output as a failure', async () => {
    const empty = vi.fn<typeof fetch>(async () => geminiResponse(''));
    await expect(callGemini(req, { GEMINI_API_KEY: 'k' }, empty, opts)).rejects.toThrow();
    const blocked = vi.fn<typeof fetch>(async () => geminiResponse(lines('x'), 'SAFETY'));
    await expect(callGemini(req, { GEMINI_API_KEY: 'k' }, blocked, opts)).rejects.toThrow();
    const noCandidates = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }));
    await expect(callGemini(req, { GEMINI_API_KEY: 'k' }, noCandidates, opts)).rejects.toThrow();
  });

  it('charges the daily cap once per upstream attempt and stops the chain at once when it is spent', async () => {
    let units = 2;
    const charge = vi.fn(() => units-- > 0);
    const busy = vi.fn<typeof fetch>(async () => status(503));
    const started = Date.now();
    await expect(callGemini(req, { GEMINI_API_KEY: 'k' }, busy, { ...opts, charge })).rejects.toBeInstanceOf(
      CapReachedError,
    );
    expect(busy).toHaveBeenCalledTimes(2); // two models tried, the third refused before any HTTP call
    expect(charge).toHaveBeenCalledTimes(3);
    expect(Date.now() - started).toBeLessThan(1_000); // no "all busy" pause and second round
  });

  it('charges the no-thinking retry of a model as its own attempt', async () => {
    const charge = vi.fn(() => true);
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{}', { status: 400 }))
      .mockResolvedValueOnce(geminiResponse(lines('ok')));
    await callGemini(req, { GEMINI_API_KEY: 'k' }, f, { ...opts, charge });
    expect(charge).toHaveBeenCalledTimes(2);
  });
});
