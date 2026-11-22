/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleAssistant } from './api/_lib/assistant.js';

type Middleware = (req: IncomingMessage, res: ServerResponse) => void;

/** Same cap as MAX_BODY in server/index.ts, so dev and preview refuse an oversized body exactly as production does. */
export const DEV_MAX_BODY = 16 * 1024;

export function apiMiddleware(env: Record<string, string>): Middleware {
  return (req, res) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (c: Buffer) => {
      if (tooLarge) return;
      size += c.length;
      if (size <= DEV_MAX_BODY) {
        chunks.push(c);
        return;
      }
      // Stop buffering at once: an unbounded body would otherwise sit in memory until it ends.
      tooLarge = true;
      chunks.length = 0;
      res
        .writeHead(413, { 'content-type': 'application/json', connection: 'close' })
        .end('{"error":"Request too large"}');
      req.resume();
    });
    req.on('end', () => {
      if (tooLarge) return;
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
      const method = req.method ?? 'GET';
      const request = new Request('http://localhost/api/assistant', {
        method,
        headers,
        ...(method === 'GET' || method === 'HEAD' ? {} : { body: Buffer.concat(chunks) }),
      });
      handleAssistant(request, serverEnv(env)).then(
        (r) => send(res, r),
        () => fail(res),
      );
    });
  };
}

/** The settings the handler reads, taken from `.env`. */
const serverEnv = (env: Record<string, string>) => ({
  GEMINI_API_KEY: env.GEMINI_API_KEY,
  GEMINI_MODEL: env.GEMINI_MODEL,
  MAX_AI_CALLS_PER_DAY: env.MAX_AI_CALLS_PER_DAY,
  MAX_AI_REQUESTS_PER_CLIENT_PER_DAY: env.MAX_AI_REQUESTS_PER_CLIENT_PER_DAY,
  UPSTASH_REDIS_REST_URL: env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: env.UPSTASH_REDIS_REST_TOKEN,
});

async function send(res: ServerResponse, r: Response): Promise<void> {
  res.statusCode = r.status;
  r.headers.forEach((v, k) => res.setHeader(k, v));
  res.end(await r.text());
}

/** The handler answers every error itself; this only stops a dev-server crash leaving the request hanging. */
function fail(res: ServerResponse): void {
  res.statusCode = 500;
  res.end('{"error":"error"}');
}

/** Serves /api/assistant locally (dev and preview) with the same handler Vercel runs in production. */
function localApi(env: Record<string, string>): Plugin {
  return {
    name: 'saans-local-api',
    configureServer(server) {
      server.middlewares.use('/api/assistant', apiMiddleware(env));
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/assistant', apiMiddleware(env));
    },
  };
}

const PRELOADED = /\/src\/lib\/i18n-preloaded(\.ts|\.js)?$/;
const EMPTY_PRELOAD = '\0saans-i18n-preloaded';

/**
 * Browser code gets an empty i18n-preloaded module, so Hindi is fetched only by people who use it (i18n.ts). Server
 * builds keep the real module, because the AI prompt calls t() in Hindi synchronously. Vitest keeps it too; the
 * loading path is tested against a fresh module there.
 */
function browserI18n(): Plugin {
  return {
    name: 'saans-browser-i18n',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (process.env.VITEST || this.environment.name !== 'client' || !/i18n-preloaded/.test(source)) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      return resolved && PRELOADED.test(resolved.id) ? EMPTY_PRELOAD : null;
    },
    load(id) {
      return id === EMPTY_PRELOAD ? 'export const preloaded = {};' : null;
    },
  };
}

/**
 * Production security headers from vercel.json, applied to `vite preview` so end-to-end tests run under
 * the real CSP. HSTS and upgrade-insecure-requests are dropped because the preview server is plain HTTP.
 */
function productionHeaders(): Record<string, string> {
  const config = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as {
    headers: { source: string; headers: { key: string; value: string }[] }[];
  };
  const global = config.headers.find((h) => h.source === '/(.*)')?.headers ?? [];
  return Object.fromEntries(
    global
      .filter((h) => h.key !== 'Strict-Transport-Security')
      .map((h) => [h.key, h.value.replace(/;\s*upgrade-insecure-requests/, '')]),
  );
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), browserI18n(), localApi(env)],
    preview: { headers: productionHeaders() },
    build: { target: 'es2022', sourcemap: false },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      // Some tests wait through real app delays (the 1.2 s auto summary); a loaded CI runner must not turn that into
      // a timeout. A test that truly hangs still fails.
      testTimeout: 20_000,
      include: ['src/**/*.test.{ts,tsx}', 'api/**/*.test.ts', 'server/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}', 'api/**/*.ts', 'server/**/*.ts'],
        exclude: [
          'src/**/*.test.*',
          'api/**/*.test.ts',
          'server/**/*.test.ts',
          'src/test/**',
          'api/_lib/contract.ts',
          'api/_lib/fake-redis.ts',
          'api/_lib/log.ts',
          'api/_lib/test-helpers.ts',
          'src/main.tsx',
        ],
        thresholds: { lines: 99, functions: 98, branches: 99, statements: 99 },
      },
    },
  };
});
