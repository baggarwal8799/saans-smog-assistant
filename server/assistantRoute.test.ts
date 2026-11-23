// @vitest-environment node
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { describe, expect, it, vi } from 'vitest';

import { LIMITS } from '../core/contract.js';
import { serveAssistant } from './assistantRoute.js';

const handler = vi.hoisted(() =>
  vi.fn(async (req: Request) => new Response(JSON.stringify({ got: (await req.text()).length }), { status: 200 })),
);
vi.mock('../backend/handler.js', () => ({ handleAssistant: handler }));

const SECURITY = { 'X-Frame-Options': 'DENY' };
const settings = { env: {}, headers: SECURITY, trustProxy: false };

/** A fake request that emits `chunks`, and a response that records what was sent. */
function exchange(chunks: Buffer[]) {
  const req = Object.assign(new EventEmitter(), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '6.6.6.6' },
    resume: vi.fn(),
    destroy: vi.fn(),
    socket: { remoteAddress: '127.0.0.1' },
  });
  const sent: { status?: number; body?: string; headers: Record<string, string> } = { headers: {} };
  const finished: (() => void)[] = [];
  const done = new Promise<void>((resolve) => {
    const res = {
      headersSent: false,
      on(event: string, listener: () => void) {
        if (event === 'finish') finished.push(listener);
        return res;
      },
      writeHead(status: number, headers: Record<string, string>) {
        sent.status = status;
        Object.assign(sent.headers, headers);
        return res;
      },
      end(body: string) {
        sent.body = body;
        for (const listener of finished) listener();
        resolve();
      },
    };
    void serveAssistant(req as unknown as IncomingMessage, res as unknown as ServerResponse, settings);
  });
  for (const c of chunks) req.emit('data', c);
  req.emit('end');
  return { done, sent, req };
}

describe('serveAssistant: /api/assistant over Node http', () => {
  it('passes a body within the cap to the handler', async () => {
    handler.mockClear();
    const { done, sent } = exchange([Buffer.from('{"a":'), Buffer.from('1}')]);
    await done;
    expect(sent.status).toBe(200);
    expect(sent.headers['x-frame-options']).toBe('DENY');
    expect(JSON.parse(sent.body ?? '')).toEqual({ got: 7 });
  });

  it('sets the client address from the socket, not from a header the client sent', async () => {
    handler.mockClear();
    const { done } = exchange([Buffer.from('{}')]);
    await done;
    const forwarded = handler.mock.calls[0]?.[0];
    expect(forwarded?.headers.get('x-forwarded-for')).toBe('127.0.0.1');
  });

  it('passes a body of exactly LIMITS.bodyBytes, the same cap as the handler and server/index.ts', async () => {
    handler.mockClear();
    const { done, sent } = exchange([Buffer.alloc(LIMITS.bodyBytes, 'a')]);
    await done;
    expect(JSON.parse(sent.body ?? '')).toEqual({ got: LIMITS.bodyBytes });
  });

  it('answers 500 internal_error when the handler throws, the same body as server/index.ts', async () => {
    handler.mockRejectedValueOnce(new Error('boom'));
    const { done, sent } = exchange([Buffer.from('{}')]);
    await done;
    expect(sent.status).toBe(500);
    expect(sent.headers['content-type']).toBe('application/json');
    expect(sent.headers['X-Frame-Options']).toBe('DENY');
    expect(JSON.parse(sent.body ?? '')).toEqual({ error: 'internal_error' });
  });

  it('answers 413 once the body passes the cap, like server/index.ts, and never calls the handler', async () => {
    handler.mockClear();
    const half = Buffer.alloc(LIMITS.bodyBytes / 2 + 1, 'a');
    const { done, sent, req } = exchange([half, half, half]);
    await done;
    expect(sent.status).toBe(413);
    expect(sent.headers.connection).toBe('close');
    expect(sent.headers['X-Frame-Options']).toBe('DENY');
    expect(sent.headers['content-type']).toBe('application/json');
    expect(JSON.parse(sent.body ?? '')).toEqual({ error: 'too_large' });
    expect(req.resume).toHaveBeenCalledOnce();
    expect(req.destroy).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
  });
});
