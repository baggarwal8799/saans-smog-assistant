/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';

import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

import { type ApiSettings, serveAssistant } from './server/assistantRoute.js';
import { securityHeaders } from './server/headers.js';
import { assistantEnv } from './server/nodeAdapter.js';

/** /api/assistant for the dev and preview servers, through the same Node glue and headers as production. */
function localApi(settings: ApiSettings): Plugin {
  const serve = (req: IncomingMessage, res: ServerResponse): void => void serveAssistant(req, res, settings);
  return {
    name: 'saans-local-api',
    configureServer(server) {
      server.middlewares.use('/api/assistant', serve);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/assistant', serve);
    },
  };
}

const PRELOADED = /\/core\/i18n-preloaded(\.ts|\.js)?$/;
const EMPTY_PRELOAD = '\0saans-i18n-preloaded';

/**
 * Browser code gets an empty i18n-preloaded module, so Hindi is fetched only by people who use it. Server builds and
 * Vitest keep the real one, because the AI prompt calls t() in Hindi synchronously.
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

/** vercel.json's headers, so e2e tests run under the real CSP; without the HTTPS-only ones over plain HTTP. */
const productionHeaders = (): Record<string, string> =>
  securityHeaders(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'), { https: false });

/** Tests sit next to the code they cover, so one list gives both the test files and the coverage scope. */
const SOURCE_ROOTS = [
  { root: 'src', ext: '{ts,tsx}' },
  { root: 'core', ext: 'ts' },
  { root: 'api', ext: 'ts' },
  { root: 'backend', ext: 'ts' },
  { root: 'server', ext: 'ts' },
] as const;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const headers = productionHeaders();
  return {
    plugins: [react(), browserI18n(), localApi({ env: assistantEnv(env), headers, trustProxy: false })],
    preview: { headers },
    build: { target: 'es2022', sourcemap: false },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./test/setup.ts'],
      // Some tests wait through real app delays (the 1.2 s auto summary); a loaded CI runner must not turn that into
      // a timeout. A test that truly hangs still fails.
      testTimeout: 20_000,
      include: [...SOURCE_ROOTS.map(({ root, ext }) => `${root}/**/*.test.${ext}`), 'test/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        include: SOURCE_ROOTS.map(({ root, ext }) => `${root}/**/*.${ext}`),
        exclude: [...SOURCE_ROOTS.map(({ root, ext }) => `${root}/**/*.test.${ext}`), 'src/main.tsx'],
        thresholds: { lines: 99, functions: 98, branches: 99, statements: 99 },
      },
    },
  };
});
