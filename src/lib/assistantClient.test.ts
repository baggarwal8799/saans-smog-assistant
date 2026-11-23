import { describe, expect, it, vi } from 'vitest';

import { DELHI, jsonResponse, profile } from '../../test/fixtures.js';
import { askAssistant, AssistantError } from './assistantClient.js';

const base = { lang: 'en' as const, mode: 'summary' as const, place: DELHI, profile: profile() };

function sentBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

describe('askAssistant', () => {
  it('sends an empty question and history when none are given, and returns the text', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ text: 'Hello' }));
    await expect(askAssistant(base, fetchMock)).resolves.toEqual({ text: 'Hello' });
    expect(sentBody(fetchMock)).toMatchObject({ question: '', history: [], mode: 'summary', lang: 'en' });
  });

  it('passes the question and history through', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ text: 'ok' }));
    await askAssistant({ ...base, mode: 'question', question: 'Walk?', history: ['Q', 'A'] }, fetchMock);
    expect(sentBody(fetchMock)).toMatchObject({ question: 'Walk?', history: ['Q', 'A'] });
  });

  it.each([
    ['a known error code', jsonResponse({ error: 'daily_limit' }, 429), 'daily_limit'],
    ['a request-level code', jsonResponse({ error: 'too_large' }, 413), 'ai_unavailable'],
    ['a body that is not JSON', new Response('boom', { status: 500 }), 'ai_unavailable'],
    ['an OK reply with no text', jsonResponse({ answer: 'x' }), 'ai_unavailable'],
    ['a JSON body that is not an object', jsonResponse(null, 500), 'ai_unavailable'],
  ])('turns %s into an AssistantError the UI can word', async (_case, response, code) => {
    const err = await askAssistant(
      base,
      vi.fn(async () => response),
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AssistantError);
    expect((err as AssistantError).code).toBe(code);
  });
});
