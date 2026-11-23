// @vitest-environment node
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { createApp } from './index.js';
import { createStaticServer } from './static.js';

const js = 'console.log("saans");'.repeat(100);

function buildDir(): string {
  const root = mkdtempSync(join(tmpdir(), 'saans-c-'));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>Saans</title>');
  writeFileSync(join(root, 'assets', 'app.js'), js);
  return root;
}

/** A response that records the status and body it is given. */
function recorder() {
  const sent: { status?: number; body?: Buffer | undefined } = {};
  const res = {
    writeHead(status: number) {
      sent.status = status;
      return res;
    },
    end(body?: Buffer) {
      sent.body = body;
    },
  };
  return { res: res as unknown as ServerResponse, sent };
}

describe('compressed static files', () => {
  it('compresses a file once for requests that arrive together, and every one gets the same body', async () => {
    const file = join(buildDir(), 'assets', 'app.js');
    const req = { method: 'GET', headers: { 'accept-encoding': 'br' } } as unknown as IncomingMessage;
    const [a, b] = [recorder(), recorder()];
    const files = createStaticServer();
    await Promise.all([files.serveFile(req, a.res, file, {}), files.serveFile(req, b.res, file, {})]);
    expect(a.sent.status).toBe(200);
    expect(brotliDecompressSync(a.sent.body ?? Buffer.alloc(0)).toString()).toBe(js);
    expect(b.sent.body).toBe(a.sent.body);
  });

  it.skipIf(process.getuid?.() === 0)('answers 500, and keeps serving, when a file cannot be read', async () => {
    const root = buildDir();
    chmodSync(join(root, 'assets', 'app.js'), 0o000);
    const server = createApp({ env: {}, headers: { 'X-Frame-Options': 'DENY' }, root, trustProxy: false });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const locked = await fetch(`${base}/assets/app.js`, { headers: { 'accept-encoding': 'gzip' } });
      expect(locked.status).toBe(500);
      expect(locked.headers.get('x-frame-options')).toBe('DENY');
      expect((await fetch(`${base}/`)).status).toBe(200);
    } finally {
      server.close();
    }
  });
});

describe('precompress', () => {
  it('fills the cache at startup, skipping a file it cannot read, and copes with a build without assets', async () => {
    const root = buildDir();
    writeFileSync(join(root, 'assets', 'locked.css'), 'a{}');
    chmodSync(join(root, 'assets', 'locked.css'), 0o000);
    const files = createStaticServer();
    await expect(files.precompress(root)).resolves.toBeUndefined();
    const req = { method: 'GET', headers: { 'accept-encoding': 'gzip' } } as unknown as IncomingMessage;
    const { res, sent } = recorder();
    await files.serveFile(req, res, join(root, 'assets', 'app.js'), {});
    expect(gunzipSync(sent.body ?? Buffer.alloc(0)).toString()).toBe(js);
    const bare = mkdtempSync(join(tmpdir(), 'saans-p-'));
    writeFileSync(join(bare, 'index.html'), '<!doctype html>');
    await expect(files.precompress(bare)).resolves.toBeUndefined();
  });
});
