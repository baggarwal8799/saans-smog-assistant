/** Test-only helpers for the App tests: a fake network for every external call, and an axe check. */
import axe from 'axe-core';
import { vi } from 'vitest';
import { jsonResponse, openMeteoPayload } from './fixtures';

type AssistantMock = 'ok' | 'not_configured' | 'ai_rate_limited' | 'too_many_requests' | 'daily_limit' | 'error';

export function mockNetwork(opts: { airFails?: boolean; assistant?: AssistantMock } = {}) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('geocoding-api')) {
      return jsonResponse({ results: [{ name: 'New Delhi', latitude: 28.61, longitude: 77.21, admin1: 'Delhi', country: 'India' }] });
    }
    if (url.includes('air-quality-api')) {
      return opts.airFails ? new Response('down', { status: 503 }) : jsonResponse(openMeteoPayload(10));
    }
    if (url === '/api/assistant') {
      if (opts.assistant === 'error') return new Response('boom', { status: 500 });
      if (opts.assistant === 'not_configured') return jsonResponse({ error: 'not_configured' }, 503);
      if (opts.assistant === 'ai_rate_limited') return jsonResponse({ error: 'ai_rate_limited' }, 429);
      if (opts.assistant === 'too_many_requests') return jsonResponse({ error: 'too_many_requests' }, 429);
      if (opts.assistant === 'daily_limit') return jsonResponse({ error: 'daily_limit' }, 429);
      const sent = JSON.parse(String(init?.body)) as { mode: string };
      return jsonResponse({ text: `Answer for ${sent.mode}` });
    }
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}

export async function axeViolations(container: HTMLElement) {
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}
