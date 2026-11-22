/**
 * Production server for self-hosting (Docker or `npm start`): serves the built app from ./dist with the
 * same security headers as vercel.json, and runs the same /api/assistant handler Vercel runs.
 * Built into a single dependency-free file with `npm run build:server`.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { handleAssistant } from '../api/_lib/assistant.js';
import { readCapped } from '../api/_lib/body.js';
import { DEFAULT_MODEL, type AssistantEnv } from '../api/_lib/gemini.js';
import { pathOf, safePath, serveFile } from './static.js';
import { LIMITS, type AssistantErrorCode } from '../src/lib/contract.js';

export function securityHeaders(vercelJson: string, https: boolean): Record<string, string> {
  type HeaderRule = { source: string; headers: { key: string; value: string }[] };
  const config = JSON.parse(vercelJson) as { headers?: HeaderRule[] };
  const global = config.headers?.find((h) => h.source === '/(.*)')?.headers ?? [];
  return Object.fromEntries(
    global
      .filter((h) => https || h.key !== 'Strict-Transport-Security')
      .map((h) => [h.key, https ? h.value : h.value.replace(/;\s*upgrade-insecure-requests/, '')]),
  );
}

/**
 * The Node request as a web stream for readCapped. Cancelling it (an oversized body) only stops buffering: the
 * socket stays open so the 413 can still be sent, and the caller closes the connection once it is.
 */
function bodyStream(req: IncomingMessage): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(c) {
      req.on('data', (chunk: Buffer) => c.enqueue(new Uint8Array(chunk)));
      req.on('end', () => c.close());
      req.on('error', (err) => c.error(err));
    },
    cancel() {
      req.removeAllListeners('data');
      req.removeAllListeners('end');
      req.resume();
    },
  });
}

/** The same body cap the handler applies (LIMITS.bodyBytes), enforced before the handler sees the request. */
const readBody = (req: IncomingMessage): Promise<string | null> =>
  readCapped({ body: bodyStream(req) }, LIMITS.bodyBytes).catch(() => null);

const errorBody = (code: AssistantErrorCode): string => JSON.stringify({ error: code });

interface AppSettings {
  env: AssistantEnv;
  headers: Record<string, string>;
  root: string;
  trustProxy: boolean;
}

/** The incoming headers as Web headers; the client address and forwarded host are taken only from a trusted proxy. */
export function forwardHeaders(req: IncomingMessage, trustProxy: boolean): Headers {
  const h = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') h.set(k, v);
  if (!trustProxy || !h.has('x-forwarded-for')) h.set('x-forwarded-for', req.socket.remoteAddress ?? 'unknown');
  // A client can send any X-Forwarded-Host; only a proxy we trust may set it, or the origin check could be fooled.
  if (!trustProxy) h.delete('x-forwarded-host');
  return h;
}

/** The Node request as the Web Request the shared handler takes. */
export function toWebRequest(req: IncomingMessage, body: string, trustProxy: boolean): Request {
  return new Request(`http://${req.headers.host ?? 'localhost'}/api/assistant`, {
    method: req.method ?? 'GET',
    headers: forwardHeaders(req, trustProxy),
    ...(body.length > 0 ? { body } : {}),
  });
}

async function api(
  req: IncomingMessage,
  res: ServerResponse,
  { env, headers, trustProxy }: AppSettings,
): Promise<void> {
  const body = req.method === 'GET' || req.method === 'HEAD' ? '' : await readBody(req);
  if (body === null) {
    res.on('finish', () => req.destroy());
    res
      .writeHead(413, { 'content-type': 'application/json', connection: 'close', ...headers })
      .end(errorBody('too_large'));
    return;
  }
  const response = await handleAssistant(toWebRequest(req, body, trustProxy), env);
  // Merged case-insensitively: the handler sets some of the same headers (nosniff), which must not be sent twice.
  const merged = new Headers(headers);
  response.headers.forEach((v, k) => merged.set(k, v));
  res.writeHead(response.status, Object.fromEntries(merged));
  res.end(await response.text());
}

/** A built file, or the app's page for a page route; a missing asset gets a real 404. */
function serveStatic(req: IncomingMessage, res: ServerResponse, url: string, { headers, root }: AppSettings): void {
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
  if (extname(pathOf(url))) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', ...headers }).end('Not found');
    return;
  }
  serveFile(req, res, join(root, 'index.html'), headers);
}

export function createApp(env: AssistantEnv, headers: Record<string, string>, root: string, trustProxy: boolean) {
  const settings: AppSettings = { env, headers, root, trustProxy };
  return createServer((req, res) => {
    const url = req.url ?? '/';
    if (url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }
    if (pathOf(url) === '/api/assistant') {
      api(req, res, settings).catch(() => {
        if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json', ...headers });
        res.end(errorBody('internal_error'));
      });
      return;
    }
    serveStatic(req, res, url, settings);
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

/** Starts the production server from its settings (process.env); null, after saying why, when there is no build. */
export function startServer(settings: NodeJS.ProcessEnv = process.env): Server | null {
  const root = resolve(settings.STATIC_DIR ?? 'dist');
  if (!existsSync(join(root, 'index.html'))) {
    console.error(`No build found in ${root}. Run "npm run build" first.`);
    return null;
  }
  const port = Number(settings.PORT ?? 8080);
  const env: AssistantEnv = {
    GEMINI_API_KEY: settings.GEMINI_API_KEY,
    GEMINI_MODEL: settings.GEMINI_MODEL,
    MAX_AI_CALLS_PER_DAY: settings.MAX_AI_CALLS_PER_DAY,
    MAX_AI_REQUESTS_PER_CLIENT_PER_DAY: settings.MAX_AI_REQUESTS_PER_CLIENT_PER_DAY,
    UPSTASH_REDIS_REST_URL: settings.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: settings.UPSTASH_REDIS_REST_TOKEN,
  };
  // Keep HSTS and upgrade-insecure-requests only when the site is really served over HTTPS (e.g. behind a TLS proxy).
  const https = settings.SERVE_HTTPS_HEADERS === 'true';
  // Only trust X-Forwarded-For behind a real reverse proxy; otherwise clients could spoof it to dodge the rate limit.
  const trustProxy = settings.TRUST_PROXY === 'true';
  const headers = securityHeaders(readFileSync(settings.HEADERS_FILE ?? 'vercel.json', 'utf8'), https);
  return createApp(env, headers, root, trustProxy).listen(port, settings.HOST ?? '0.0.0.0', () => {
    // In Docker the host port can differ from the container port; compose passes the real URL.
    const url = settings.PUBLIC_URL ?? `http://localhost:${port}`;
    console.info(`Saans is running: open ${url}\n${aiStatus(env)}`);
  });
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);
if (isMain && !startServer()) process.exit(1);
