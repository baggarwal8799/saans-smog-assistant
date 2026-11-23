// @vitest-environment node
import type { AddressInfo } from 'node:net';

import { describe, expect, it, vi } from 'vitest';

import { createApp } from './index.js';
import type * as files from './static.js';

vi.mock('./static.js', async (importOriginal) => ({
  ...(await importOriginal<typeof files>()),
  isFile: vi.fn(() => Promise.reject(new Error('disk gone'))),
}));

describe('createApp when serving a file fails unexpectedly', () => {
  it('answers 500 internal_error with the security headers, as the API does, and keeps serving', async () => {
    const server = createApp({
      env: {},
      headers: { 'X-Frame-Options': 'DENY' },
      root: '/nonexistent',
      trustProxy: false,
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const res = await fetch(`${base}/`);
      expect(res.status).toBe(500);
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(await res.json()).toEqual({ error: 'internal_error' });
      expect(await (await fetch(`${base}/healthz`)).text()).toBe('ok');
    } finally {
      server.close();
    }
  });
});
