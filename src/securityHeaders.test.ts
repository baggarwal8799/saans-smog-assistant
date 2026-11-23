// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { securityHeaders } from '../server/headers.js';
import { createApp } from '../server/index.js';

// Every security header the app ships, with its exact value. vercel.json is the single source: Vercel serves it,
// and the self-hosted server and `vite preview` read it at startup. Removing or loosening a header fails here.

const VERCEL_JSON = readFileSync(resolve(__dirname, '..', 'vercel.json'), 'utf8');

const CSP_DIRECTIVES: Record<string, string> = {
  'default-src': "'self'",
  'script-src': "'self'",
  'style-src': "'self'",
  'img-src': "'self' data:",
  'font-src': "'self'",
  'connect-src': [
    "'self'",
    'https://air-quality-api.open-meteo.com',
    'https://api.open-meteo.com',
    'https://geocoding-api.open-meteo.com',
    'https://api.bigdatacloud.net',
  ].join(' '),
  'object-src': "'none'",
  'base-uri': "'self'",
  'form-action': "'self'",
  'frame-ancestors': "'none'",
};

const EXPECTED: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(self), camera=(), microphone=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Permitted-Cross-Domain-Policies': 'none',
};
const HSTS = 'max-age=63072000; includeSubDomains; preload';

/** CSP as directive -> sources, so the check does not depend on directive order. */
function parseCsp(csp: string): Record<string, string> {
  return Object.fromEntries(
    csp
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .filter((parts) => parts[0])
      .map(([name = '', ...sources]) => [name, sources.join(' ')]),
  );
}

describe('vercel.json security headers', () => {
  type Rule = { source: string; headers: { key: string; value: string }[] };
  const rules = (JSON.parse(VERCEL_JSON) as { headers: Rule[] }).headers;
  const global = Object.fromEntries(
    (rules.find((r) => r.source === '/(.*)')?.headers ?? []).map((h) => [h.key, h.value]),
  );

  it.each(Object.entries(EXPECTED))('%s is %s', (key, value) => {
    expect(global[key]).toBe(value);
  });

  it('sends HSTS for two years with preload', () => {
    expect(global['Strict-Transport-Security']).toBe(HSTS);
  });

  it('has a strict CSP with exactly the expected directives', () => {
    expect(parseCsp(global['Content-Security-Policy'] ?? '')).toEqual({
      ...CSP_DIRECTIVES,
      'upgrade-insecure-requests': '',
    });
  });

  it('allows no inline or eval script and no wildcard source', () => {
    const csp = global['Content-Security-Policy'] ?? '';
    expect(csp).not.toMatch(/'unsafe-inline'|'unsafe-eval'|'unsafe-hashes'|\s\*[\s;]|\bhttp:/);
  });

  it('lists no header twice', () => {
    for (const r of rules) expect(new Set(r.headers.map((h) => h.key)).size, r.source).toBe(r.headers.length);
  });
});

describe('self-hosted server responses carry every security header', () => {
  let base = '';
  let close: () => void = () => undefined;

  beforeAll(async () => {
    const root = mkdtempSync(join(tmpdir(), 'saans-headers-'));
    mkdirSync(join(root, 'assets'));
    writeFileSync(join(root, 'index.html'), '<!doctype html><title>Saans</title>');
    writeFileSync(join(root, 'assets', 'app-1.js'), 'console.log(1);');
    const server = createApp({
      env: {},
      headers: securityHeaders(VERCEL_JSON, { https: true }),
      root,
      trustProxy: false,
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
  });
  afterAll(() => close());

  const json = { 'content-type': 'application/json' };
  it.each<[string, string, RequestInit]>([
    ['the page', '/', {}],
    ['an SPA route', '/some/route', {}],
    ['a hashed asset', '/assets/app-1.js', {}],
    ['a missing asset', '/assets/missing.js', {}],
    ['a rejected method', '/', { method: 'DELETE' }],
    ['a cross-origin API call', '/api/assistant', { method: 'POST', headers: json, body: '{}' }],
  ])('%s', async (_label, path, init) => {
    const res = await fetch(`${base}${path}`, init);
    for (const [key, value] of Object.entries(EXPECTED)) expect(res.headers.get(key), key).toBe(value);
    expect(res.headers.get('strict-transport-security')).toBe(HSTS);
    expect(parseCsp(res.headers.get('content-security-policy') ?? '')).toEqual({
      ...CSP_DIRECTIVES,
      'upgrade-insecure-requests': '',
    });
  });

  it('a same-origin API call', async () => {
    const res = await fetch(`${base}/api/assistant`, {
      method: 'POST',
      headers: { ...json, origin: base },
      body: '{}',
    });
    expect(res.status).toBe(400);
    for (const [key, value] of Object.entries(EXPECTED)) expect(res.headers.get(key), key).toBe(value);
  });

  it('over plain HTTP, drops only HSTS and upgrade-insecure-requests', () => {
    const http = securityHeaders(VERCEL_JSON, { https: false });
    expect(http['Strict-Transport-Security']).toBeUndefined();
    expect(parseCsp(http['Content-Security-Policy'] ?? '')).toEqual(CSP_DIRECTIVES);
    for (const [key, value] of Object.entries(EXPECTED)) expect(http[key], key).toBe(value);
  });
});
