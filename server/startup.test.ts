// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { type IncomingMessage, request, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { forwardHeaders } from './assistantRoute.js';
import { createApp, startServer } from './index.js';
import { pathOf } from './static.js';

const fakeReq = (o: Record<string, unknown>) => ({ headers: {}, socket: {}, ...o }) as unknown as IncomingMessage;
const settle = (server: Server) => new Promise<void>((r) => server.once('listening', r));
const closeAll = (server: Server) => new Promise<void>((r) => server.close(() => r()));

function buildDir(): string {
  const root = mkdtempSync(join(tmpdir(), 'saans-s-'));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>Saans</title>');
  writeFileSync(join(root, 'assets', 'app.js'), 'console.log("saans");'.repeat(50));
  writeFileSync(join(root, 'assets', 'logo.png'), Buffer.from([137, 80, 78, 71]));
  writeFileSync(join(root, 'assets', 'data.bin'), Buffer.from([1, 2, 3]));
  return root;
}

/** One raw HTTP exchange, so a test controls the Host header and sees exactly what the server sends. */
function raw(base: string, path: string, opts: { method?: string; headers?: Record<string, string> } = {}) {
  type Raw = { status: number; headers: IncomingMessage['headers']; body: string };
  return new Promise<Raw>((done, fail) => {
    const req = request(`${base}${path}`, opts, (res) => {
      let body = '';
      res.on('data', (c: Buffer) => (body += c.toString()));
      res.on('end', () => done({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', fail);
    req.end();
  });
}

describe('forwardHeaders', () => {
  it('trusts X-Forwarded-For and X-Forwarded-Host only behind a trusted proxy', () => {
    const viaProxy = fakeReq({
      headers: { 'x-forwarded-for': '203.0.113.9', 'x-forwarded-host': 'saans.example' },
      socket: { remoteAddress: '10.0.0.1' },
    });
    const trusted = forwardHeaders(viaProxy, { trustProxy: true });
    expect(trusted.get('x-forwarded-for')).toBe('203.0.113.9');
    expect(trusted.get('x-forwarded-host')).toBe('saans.example');
    const direct = forwardHeaders(viaProxy, { trustProxy: false });
    expect(direct.get('x-forwarded-for')).toBe('10.0.0.1');
    expect(direct.has('x-forwarded-host')).toBe(false);
    // A trusted proxy that sent no address still gets the socket's address as the rate-limit key.
    expect(
      forwardHeaders(fakeReq({ socket: { remoteAddress: '10.0.0.2' } }), { trustProxy: true }).get('x-forwarded-for'),
    ).toBe('10.0.0.2');
  });

  it('keys a closed socket as "unknown" and drops repeated headers that are not single strings', () => {
    const h = forwardHeaders(fakeReq({ headers: { 'set-cookie': ['a=1', 'b=2'], accept: 'x/y' } }), {
      trustProxy: false,
    });
    expect(h.get('x-forwarded-for')).toBe('unknown');
    expect(h.has('set-cookie')).toBe(false);
    expect(h.get('accept')).toBe('x/y');
  });
});

describe('createApp: edge requests', () => {
  let base = '';
  let server: Server;
  beforeAll(async () => {
    server = createApp({ env: {}, headers: { 'X-Frame-Options': 'DENY' }, root: buildDir(), trustProxy: false });
    server.listen(0, '127.0.0.1');
    await settle(server);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => closeAll(server));

  const fakeRes = ({ headersSent }: { headersSent: boolean }) => {
    const res = { headersSent, writeHead: vi.fn(), end: vi.fn() };
    res.writeHead.mockReturnValue(res);
    return res;
  };

  it('answers 400 to a path that cannot be decoded', async () => {
    const res = await raw(base, '/%E0%A4%A');
    expect(res.status).toBe(400);
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('answers 500 internal_error when the request cannot become a Web request (a broken Host)', async () => {
    const res = await raw(base, '/api/assistant', { headers: { host: 'bad host' } });
    expect(res.status).toBe(500);
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(JSON.parse(res.body)).toEqual({ error: 'internal_error' });
  });

  it('still ends the response, without new headers, when the failure comes after they were sent', async () => {
    const res = fakeRes({ headersSent: true });
    server.emit('request', fakeReq({ url: '/api/assistant', method: 'GET', headers: { host: 'bad host' } }), res);
    await vi.waitFor(() => expect(res.end).toHaveBeenCalledWith('{"error":"internal_error"}'));
    expect(res.writeHead).not.toHaveBeenCalled();
  });

  it('serves the app page to a request with no URL', async () => {
    const res = fakeRes({ headersSent: false });
    server.emit('request', fakeReq({ method: 'HEAD' }), res as unknown as ServerResponse);
    await vi.waitFor(() =>
      expect(res.writeHead).toHaveBeenCalledWith(
        200,
        expect.objectContaining({ 'content-type': expect.stringContaining('text/html') }),
      ),
    );
  });

  it('answers HEAD with the headers only, compressed or not, and types unknown files as octet-stream', async () => {
    const br = await raw(base, '/assets/app.js', { method: 'HEAD', headers: { 'accept-encoding': 'br' } });
    expect(br.headers['content-encoding']).toBe('br');
    expect(Number(br.headers['content-length'])).toBeGreaterThan(0);
    expect(br.body).toBe('');
    const png = await raw(base, '/assets/logo.png', { method: 'HEAD' });
    expect(png.headers['content-length']).toBe('4');
    expect(png.body).toBe('');
    expect((await raw(base, '/assets/data.bin')).headers['content-type']).toBe('application/octet-stream');
  });
});

describe('startServer', () => {
  afterEach(() => vi.restoreAllMocks());

  it('refuses to start, and says why, when there is no build', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const empty = mkdtempSync(join(tmpdir(), 'saans-empty-'));
    expect(startServer({ STATIC_DIR: empty })).toBeNull();
    expect(error).toHaveBeenCalledWith(`No build found in ${empty}. Run "npm run build" first.`);
  });

  it('looks for the build in ./dist under the working directory by default', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const cwd = mkdtempSync(join(tmpdir(), 'saans-cwd-'));
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);
    expect(startServer({})).toBeNull();
    expect(error).toHaveBeenCalledWith(`No build found in ${join(cwd, 'dist')}. Run "npm run build" first.`);
  });

  it('serves the build with the vercel.json headers and prints the public URL and AI status', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const headersFile = join(mkdtempSync(join(tmpdir(), 'saans-h-')), 'headers.json');
    const rule = [{ key: 'Strict-Transport-Security', value: 'max-age=9' }];
    writeFileSync(headersFile, JSON.stringify({ headers: [{ source: '/(.*)', headers: rule }] }));
    const settings = { STATIC_DIR: buildDir(), PORT: '0', HOST: '127.0.0.1', HEADERS_FILE: headersFile };
    const server = startServer({ ...settings, SERVE_HTTPS_HEADERS: 'true', PUBLIC_URL: 'https://saans.example' });
    if (!server) throw new Error('server did not start');
    await settle(server);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    expect((await raw(base, '/')).headers['strict-transport-security']).toBe('max-age=9');
    expect(info.mock.calls[0]?.[0]).toMatch(
      /^Saans is running: open https:\/\/saans\.example\nAI: GEMINI_API_KEY is not set/,
    );
    await closeAll(server);
  });

  it('defaults to every interface, the repo vercel.json and a localhost URL', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const server = startServer({ STATIC_DIR: buildDir(), PORT: '0', GEMINI_API_KEY: 'k' });
    if (!server) throw new Error('server did not start');
    await settle(server);
    const { address, port } = server.address() as AddressInfo;
    expect(address).toBe('0.0.0.0');
    const res = await raw(`http://127.0.0.1:${port}`, '/');
    expect(res.headers['x-frame-options']).toBeDefined();
    // Without SERVE_HTTPS_HEADERS, HSTS is left out.
    expect(res.headers['strict-transport-security']).toBeUndefined();
    expect(info.mock.calls[0]?.[0]).toBe(
      `Saans is running: open http://localhost:0\nAI: Gemini (gemini-flash-lite-latest)`,
    );
    await closeAll(server);
  });
});

describe('pathOf', () => {
  it('drops the query string and keeps a path without one', () => {
    expect(pathOf('/api/assistant?x=1?y')).toBe('/api/assistant');
    expect(pathOf('/a/b')).toBe('/a/b');
  });
});
