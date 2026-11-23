// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { gemini, modelJson } from '../test/apiHelpers.js';
import { callGemini } from './gemini.js';
import { GeminiError, readReply } from './geminiReply.js';

const reply = (candidate: Record<string, unknown>) =>
  new Response(JSON.stringify({ candidates: [candidate] }), { status: 200 });

describe('readReply', () => {
  it('joins only the text parts, skipping parts that carry no text', async () => {
    const parts = [{ functionCall: { name: 'x' } }, { text: modelJson('Shut the windows.') }];
    expect((await readReply(reply({ content: { parts } }))).lines).toEqual(['Shut the windows.']);
  });

  it('names a missing finish reason when the reply does not fit the schema', async () => {
    const err = await readReply(reply({ content: { parts: [{ text: '{"lines":"no"}' }] } })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GeminiError);
    expect(err).toMatchObject({ status: 502, message: expect.stringContaining('(no reason)') });
  });
});

describe('callGemini edge cases', () => {
  it('sends an empty key header rather than "undefined" when no key is set', async () => {
    const f = gemini('ok');
    await callGemini('PROMPT', {}, f, { log: { warn: vi.fn() } });
    const init = f.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('');
  });

  it('logs "unknown" for a non-Error failure and does not try the next model', async () => {
    const log = { warn: vi.fn() };
    const f = vi.fn<typeof fetch>().mockRejectedValue('connection reset');
    await expect(callGemini('PROMPT', { GEMINI_API_KEY: 'k' }, f, { log })).rejects.toBe('connection reset');
    expect(f).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith('assistant: gemini-flash-lite-latest failed (unknown)');
  });
});
