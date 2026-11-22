/**
 * Production server for self-hosting (Docker or `npm start`): serves the built app from ./dist with the
 * same security headers as vercel.json, and runs the same /api/assistant handler Vercel runs.
 * Built into a single dependency-free file with `npm run build:server`.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { handleAssistant } from '../api/_lib/assistant.js';
import { DEFAULT_MODEL, type AssistantEnv } from '../api/_lib/gemini.js';
import { safePath, serveFile } from './static.js';

const ROOT = resolve(process.env.STATIC_DIR ?? 'dist');
const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';
/** Keep HSTS and upgrade-insecure-requests only when the site is really served over HTTPS (e.g. behind a TLS proxy). */
const HTTPS = process.env.SERVE_HTTPS_HEADERS === 'true';
const MAX_BODY = 16 * 1024;
/** Only trust X-Forwarded-For behind a real reverse proxy; otherwise clients could spoof it to dodge the rate limit. */
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';

export function securityHeaders(vercelJson: string, https: boolean): Record<string, string> {
  const config = JSON.parse(vercelJson) as { headers?: { source: string; headers: { key: string; value: string }[] }[] };
  const global = config.headers?.find((h) => h.source === '/(.*)')?.headers ?? [];
  return Object.fromEntries(
    global
      .filter((h) => https || h.key !== 'Strict-Transport-Security')
      .map((h) => [h.key, https ? h.value : h.value.replace(/;\s*upgrade-insecure-requests/, '')]),
  );
}

function readBody(req: IncomingMessage): Promise<Buffer | null> {
  return new Promise((done) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        // Stop buffering; the caller answers 413 and closes the connection once the reply is sent.
        req.removeAllListeners('data');
        req.resume();
        done(null);
      } else chunks.push(c);
    });
    req.on('end', () => done(Buffer.concat(chunks)));
    req.on('error', () => done(null));
  });
}

async function api(
  req: IncomingMessage,
  res: ServerResponse,
  env: AssistantEnv,
  headers: Record<string, string>,
  trustProxy: boolean,
): Promise<void> {
  const body = req.method === 'GET' || req.method === 'HEAD' ? Buffer.alloc(0) : await readBody(req);
  if (body === null) {
    res.on('finish', () => req.destroy());
    res.writeHead(413, { 'content-type': 'application/json', connection: 'close', ...headers }).end('{"error":"Request too large"}');
    return;
  }
  const h = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') h.set(k, v);
  if (!trustProxy || !h.has('x-forwarded-for')) h.set('x-forwarded-for', req.socket.remoteAddress ?? 'unknown');
  // A client can send any X-Forwarded-Host; only a proxy we trust may set it, or the origin check could be fooled.
  if (!trustProxy) h.delete('x-forwarded-host');
  const request = new Request(`http://${req.headers.host ?? 'localhost'}/api/assistant`, {
    method: req.method ?? 'GET',
    headers: h,
    ...(body.length > 0 ? { body: new Uint8Array(body) } : {}),
  });
  const response = await handleAssistant(request, env);
  res.writeHead(response.status, { ...headers, ...Object.fromEntries(response.headers) });
  res.end(await response.text());
}

export function createApp(env: AssistantEnv, headers: Record<string, string>, root = ROOT, trustProxy = TRUST_PROXY) {
  return createServer((req, res) => {
    const url = req.url ?? '/';
    if (url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }
    if (url.split('?')[0] === '/api/assistant') {
      api(req, res, env, headers, trustProxy).catch(() => {
        if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json', ...headers });
        res.end('{"error":"Internal error"}');
      });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD', ...headers }).end();
      return;
    }
    const path = safePath(root, url);
    if (!path) {
      res.writeHead(400, headers).end();
      return;
    }
    if (existsSync(path) && statSync(path).isFile()) {
      serveFile(req, res, path, headers);
      return;
    }
    // Only page routes fall back to the app. A missing file such as /assets/old.js gets a real 404, so a stale
    // tab or a typo never receives HTML in place of a script.
    if (extname(url.split('?')[0] ?? '')) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', ...headers }).end('Not found');
      return;
    }
    serveFile(req, res, join(root, 'index.html'), headers);
  });
}

export function aiStatus(env: AssistantEnv): string {
  if (env.GEMINI_API_KEY) return `AI: Gemini (${env.GEMINI_MODEL || DEFAULT_MODEL})`;
  return [
    'AI: GEMINI_API_KEY is not set, so "Ask Saans" will ask for a key. Everything else works.',
    '  Get a free key (free tier: https://ai.google.dev/gemini-api/docs/pricing):',
    '  1. Open https://aistudio.google.com/apikey and sign in with a Google account.',
    '  2. Click "Create API key" and copy it.',
    '  3. Put it in .env as GEMINI_API_KEY=your-key',
    '  4. Restart: docker compose up -d   (or: npm start)',
  ].join('\n');
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (!existsSync(join(ROOT, 'index.html'))) {
    console.error(`No build found in ${ROOT}. Run "npm run build" first.`);
    process.exit(1);
  }
  const env: AssistantEnv = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    MAX_AI_CALLS_PER_DAY: process.env.MAX_AI_CALLS_PER_DAY,
    MAX_AI_REQUESTS_PER_CLIENT_PER_DAY: process.env.MAX_AI_REQUESTS_PER_CLIENT_PER_DAY,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  };
  const headers = securityHeaders(readFileSync(process.env.HEADERS_FILE ?? 'vercel.json', 'utf8'), HTTPS);
  createApp(env, headers).listen(PORT, HOST, () => {
    // In Docker the host port can differ from the container port; compose passes the real URL.
    const url = process.env.PUBLIC_URL ?? `http://localhost:${PORT}`;
    console.warn(`Saans is running: open ${url}\n${aiStatus(env)}`);
  });
}
