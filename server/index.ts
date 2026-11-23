/** Self-hosted production server (Docker or `npm start`): the built app, vercel.json's headers, /api/assistant. */
import { existsSync, readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { modelChain } from '../backend/gemini.js';
import type { AssistantEnv } from '../backend/types.js';
import { type ApiSettings, serveAssistant } from './assistantRoute.js';
import { securityHeaders } from './headers.js';
import { assistantEnv, sendError } from './nodeAdapter.js';
import { createStaticServer, isFile, pathOf, safePath, type StaticFiles } from './static.js';

interface AppSettings extends ApiSettings {
  root: string;
  /** startServer passes the instance it precompressed. */
  files?: StaticFiles;
}

type App = AppSettings & { files: StaticFiles };

/** A file removed or locked after the check gets a 500, never a crash. */
function sendFile(req: IncomingMessage, res: ServerResponse, file: string, { files, headers }: App): void {
  files.serveFile(req, res, file, headers).catch(() => res.writeHead(500, headers).end());
}

/** A built file, or the app's page for a page route. Never rejects. */
async function serveStatic(req: IncomingMessage, res: ServerResponse, url: string, app: App): Promise<void> {
  const { headers, root } = app;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD', ...headers }).end();
    return;
  }
  const path = safePath(root, url);
  if (!path) {
    res.writeHead(400, headers).end();
    return;
  }
  if (await isFile(path)) {
    sendFile(req, res, path, app);
    return;
  }
  // Only page routes fall back to the app. A missing file such as /assets/old.js gets a real 404, so a stale
  // tab or a typo never receives HTML in place of a script.
  if (extname(pathOf(url))) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', ...headers }).end('Not found');
    return;
  }
  sendFile(req, res, join(root, 'index.html'), app);
}

export function createApp(settings: AppSettings): Server {
  const app: App = { ...settings, files: settings.files ?? createStaticServer() };
  return createServer((req, res) => {
    const url = req.url ?? '/';
    if (url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }
    if (pathOf(url) === '/api/assistant') {
      void serveAssistant(req, res, app);
      return;
    }
    serveStatic(req, res, url, app).catch(() => sendError(res, 500, 'internal_error', app.headers));
  });
}

export function aiStatus(env: AssistantEnv): string {
  if (env.GEMINI_API_KEY) return `AI: Gemini (${modelChain(env)[0]})`;
  return [
    'AI: GEMINI_API_KEY is not set, so "Ask Saans" will ask for a key. Everything else works.',
    '  Get a free key (free tier: https://ai.google.dev/gemini-api/docs/pricing):',
    '  1. Open https://aistudio.google.com/apikey and sign in with a Google account.',
    '  2. Click "Create API key" and copy it.',
    '  3. Put it in .env as GEMINI_API_KEY=your-key',
    '  4. Restart: docker compose up -d   (or: npm start)',
  ].join('\n');
}

/** Null, after saying why, when there is no build. */
export function startServer(settings: NodeJS.ProcessEnv = process.env): Server | null {
  const root = resolve(settings.STATIC_DIR ?? 'dist');
  if (!existsSync(join(root, 'index.html'))) {
    console.error(`No build found in ${root}. Run "npm run build" first.`);
    return null;
  }
  const port = Number(settings.PORT ?? 8080);
  const env = assistantEnv(settings);
  // Keep HSTS and upgrade-insecure-requests only when the site is really served over HTTPS (e.g. behind a TLS proxy).
  const https = settings.SERVE_HTTPS_HEADERS === 'true';
  const trustProxy = settings.TRUST_PROXY === 'true';
  const headers = securityHeaders(readFileSync(settings.HEADERS_FILE ?? 'vercel.json', 'utf8'), { https });
  const files = createStaticServer();
  void files.precompress(root);
  return createApp({ env, headers, root, trustProxy, files }).listen(port, settings.HOST ?? '0.0.0.0', () => {
    // In Docker the host port can differ from the container's; compose passes the real URL.
    const url = settings.PUBLIC_URL ?? `http://localhost:${port}`;
    console.info(`Saans is running: open ${url}\n${aiStatus(env)}`);
  });
}

const isMain = resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url);
if (isMain && !startServer()) process.exit(1);
