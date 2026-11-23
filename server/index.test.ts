// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LIMITS } from '../core/contract.js';
import { securityHeaders } from './headers.js';
import { aiStatus, createApp } from './index.js';
import { pickEncoding, safePath } from './static.js';

const VERCEL = JSON.stringify({
  headers: [
    {
      source: '/(.*)',
      headers: [
        { key: 'Content-Security-Policy', value: "default-src 'self'; upgrade-insecure-requests" },
        { key: 'Strict-Transport-Security', value: 'max-age=1' },
        { key: 'X-Frame-Options', value: 'DENY' },
      ],
    },
  ],
});

/** A built app in a fresh temp folder: index.html plus the given files under assets/. */
function builtRoot(prefix: string, assets: Record<string, string | Buffer>): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>Saans</title>');
  for (const [name, content] of Object.entries(assets)) writeFileSync(join(root, 'assets', name), content);
  return root;
}

/** The app serving `root` on a free local port. */
async function listen(root: string, headers: Record<string, string>): Promise<{ base: string; close: () => void }> {
  const server = createApp({ env: {}, headers, root, trustProxy: false });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() };
}

describe('securityHeaders', () => {
  it('keeps HTTPS-only headers only when serving over HTTPS', () => {
    expect(securityHeaders(VERCEL, { https: false })).toEqual({
      'Content-Security-Policy': "default-src 'self'",
      'X-Frame-Options': 'DENY',
    });
    expect(securityHeaders(VERCEL, { https: true })['Strict-Transport-Security']).toBe('max-age=1');
    expect(securityHeaders(VERCEL, { https: true })['Content-Security-Policy']).toContain('upgrade-insecure-requests');
    expect(securityHeaders('{}', { https: false })).toEqual({});
  });
});

describe('safePath', () => {
  it('stays inside the root and rejects traversal and bad encoding', () => {
    expect(safePath('/srv/dist', '/assets/a.js?v=1')).toBe('/srv/dist/assets/a.js');
    expect(safePath('/srv/dist', '/../etc/passwd')).toBeNull();
    expect(safePath('/srv/dist', '/a/../../dist-other/x')).toBeNull();
    expect(safePath('/srv/dist', '/%2e%2e/%2e%2e/etc/passwd')).toBeNull();
    expect(safePath('/srv/dist', '/%E0%A4%A')).toBeNull();
  });
});

describe('createApp', () => {
  let base = '';
  let close: () => void = () => undefined;

  beforeAll(async () => {
    const root = builtRoot('saans-', { 'app-123.js': 'console.log("saans");'.repeat(200) });
    ({ base, close } = await listen(root, { 'X-Frame-Options': 'DENY' }));
  });
  afterAll(() => close());

  it('serves the app with security headers and no-cache HTML', async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(await res.text()).toContain('Saans');
  });

  it('caches hashed assets for a year and falls back to index.html for unknown paths', async () => {
    const asset = await fetch(`${base}/assets/app-123.js`);
    expect(asset.headers.get('cache-control')).toContain('immutable');
    expect(asset.headers.get('content-type')).toContain('javascript');
    expect(await (await fetch(`${base}/some/route`)).text()).toContain('Saans');
    // A missing file is a real 404, never the HTML page served as a script.
    const missing = await fetch(`${base}/assets/gone-999.js`);
    expect(missing.status).toBe(404);
    expect(missing.headers.get('content-type')).toContain('text/plain');
  });

  it('answers health checks, rejects writes to static paths and serves the assistant API', async () => {
    expect(await (await fetch(`${base}/healthz`)).text()).toBe('ok');
    expect((await fetch(`${base}/`, { method: 'POST' })).status).toBe(405);
    expect((await fetch(`${base}/api/assistant`)).status).toBe(405);
    const json = { 'content-type': 'application/json' };
    // A browser on the page sends its Origin; a POST without one (a script) is refused.
    const bad = await fetch(`${base}/api/assistant`, {
      method: 'POST',
      headers: { ...json, origin: base },
      body: '{}',
    });
    expect(bad.status).toBe(400);
    expect(bad.headers.get('x-frame-options')).toBe('DENY');
    expect((await fetch(`${base}/api/assistant`, { method: 'POST', headers: json, body: '{}' })).status).toBe(403);
    // A forged X-Forwarded-Host cannot make a foreign Origin look like ours without a trusted proxy.
    const forged = { ...json, origin: 'https://evil.example', 'x-forwarded-host': 'evil.example' };
    expect((await fetch(`${base}/api/assistant`, { method: 'POST', headers: forged, body: '{}' })).status).toBe(403);
  });

  it('refuses oversized bodies before the handler reads them', async () => {
    const res = await fetch(`${base}/api/assistant`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(LIMITS.bodyBytes + 1),
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'too_large' });
    // The same cap as the handler: a body of exactly LIMITS.bodyBytes reaches it (and fails the origin check).
    const atCap = await fetch(`${base}/api/assistant`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(LIMITS.bodyBytes),
    });
    expect(atCap.status).toBe(403);
  });
});

describe('compression and caching', () => {
  let base = '';
  let close: () => void = () => undefined;
  const js = 'console.log("saans");'.repeat(200);

  beforeAll(async () => {
    ({ base, close } = await listen(
      builtRoot('saans-z-', { 'app.js': js, 'logo.png': Buffer.from([137, 80, 78, 71]) }),
      {},
    ));
  });
  afterAll(() => close());

  // Raw HTTP so the test sees exactly what the server sends (fetch would decompress for us).
  async function raw(path: string, headers: Record<string, string>) {
    const { request } = await import('node:http');
    type Raw = { status: number; headers: Record<string, string | string[] | undefined>; body: Buffer };
    return new Promise<Raw>((done, fail) => {
      const req = request(`${base}${path}`, { headers }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
      });
      req.on('error', fail);
      req.end();
    });
  }

  it('picks Brotli, then gzip, then nothing', () => {
    expect(pickEncoding('gzip, deflate, br')).toBe('br');
    expect(pickEncoding('gzip')).toBe('gzip');
    expect(pickEncoding('identity')).toBeNull();
    expect(pickEncoding(undefined)).toBeNull();
  });

  it('sends text assets compressed, and leaves binary files alone', async () => {
    const br = await raw('/assets/app.js', { 'accept-encoding': 'br' });
    expect(br.headers['content-encoding']).toBe('br');
    expect(br.headers.vary).toBe('Accept-Encoding');
    expect(br.body.length).toBeLessThan(js.length / 5);
    expect(brotliDecompressSync(br.body).toString()).toBe(js);
    const gz = await raw('/assets/app.js', { 'accept-encoding': 'gzip' });
    expect(gunzipSync(gz.body).toString()).toBe(js);
    const png = await raw('/assets/logo.png', { 'accept-encoding': 'br' });
    expect(png.headers['content-encoding']).toBeUndefined();
  });

  it('answers 304 Not Modified when the browser already has the file', async () => {
    const first = await raw('/assets/app.js', {});
    const etag = String(first.headers.etag);
    expect(etag).toMatch(/^W\/"/);
    const again = await raw('/assets/app.js', { 'if-none-match': etag });
    expect(again.status).toBe(304);
    expect(again.body.length).toBe(0);
  });
});

describe('startup message', () => {
  it('names the model when a key is set, and explains how to get a free key when not', () => {
    expect(aiStatus({ GEMINI_API_KEY: 'k' })).toBe('AI: Gemini (gemini-flash-lite-latest)');
    expect(aiStatus({ GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-3.8-flash' })).toBe('AI: Gemini (gemini-3.8-flash)');
    // The model the server really calls: an unsafe name is never used, so it is never printed either.
    expect(aiStatus({ GEMINI_API_KEY: 'k', GEMINI_MODEL: '../x' })).toBe('AI: Gemini (gemini-flash-lite-latest)');
    const help = aiStatus({});
    expect(help).toMatch(/GEMINI_API_KEY is not set/);
    expect(help).toMatch(/aistudio\.google\.com\/apikey/);
    expect(help).toMatch(/ai\.google\.dev\/gemini-api\/docs\/pricing/);
  });
});
