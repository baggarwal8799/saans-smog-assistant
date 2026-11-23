// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { isSameOrigin } from './origin.js';

const req = (headers: Record<string, string>) => new Request('http://x/api', { method: 'POST', headers });

describe('isSameOrigin', () => {
  it('accepts a matching Origin, or Sec-Fetch-Site: same-origin', () => {
    expect(isSameOrigin(req({ origin: 'https://a.com', host: 'a.com' }))).toBe(true);
    expect(isSameOrigin(req({ origin: 'http://localhost:5173', host: 'localhost:5173' }))).toBe(true);
    expect(isSameOrigin(req({ origin: 'https://a.com', 'x-forwarded-host': 'a.com', host: 'internal' }))).toBe(true);
    expect(isSameOrigin(req({ 'sec-fetch-site': 'same-origin' }))).toBe(true);
    expect(isSameOrigin(req({ 'sec-fetch-site': 'same-origin', origin: 'https://a.com', host: 'a.com' }))).toBe(true);
  });

  it('refuses requests with neither header, a foreign or broken Origin, or another Sec-Fetch-Site', () => {
    expect(isSameOrigin(req({}))).toBe(false);
    expect(isSameOrigin(req({ host: 'a.com' }))).toBe(false);
    expect(isSameOrigin(req({ origin: 'https://evil.example', host: 'a.com' }))).toBe(false);
    expect(isSameOrigin(req({ origin: 'null', host: 'a.com' }))).toBe(false);
    expect(isSameOrigin(req({ origin: 'https://a.com' }))).toBe(false);
    for (const site of ['cross-site', 'same-site', 'none']) {
      expect(isSameOrigin(req({ 'sec-fetch-site': site, origin: 'https://a.com', host: 'a.com' }))).toBe(false);
    }
  });
});
