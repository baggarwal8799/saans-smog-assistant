// @vitest-environment node
// The dev and preview servers run /api/assistant through vite.config.ts; this checks its body cap.
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { DEV_MAX_BODY, apiMiddleware } from '../vite.config';

const handler = vi.hoisted(() =>
  vi.fn(async (req: Request) => new Response(JSON.stringify({ got: (await req.text()).length }), { status: 200 })),
);
vi.mock('../api/_lib/assistant.js', () => ({ handleAssistant: handler }));

/** A fake request that emits `chunks`, and a response that records what was sent. */
function exchange(chunks: Buffer[]) {
  const req = Object.assign(new EventEmitter(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    resume: vi.fn(),
  });
  const sent: { status?: number; body?: string; headers: Record<string, string> } = { headers: {} };
  const done = new Promise<void>((resolve) => {
    const res = {
      statusCode: 200,
      setHeader: (k: string, v: string) => {
        sent.headers[k] = v;
      },
      writeHead(status: number, headers: Record<string, string>) {
        sent.status = status;
        Object.assign(sent.headers, headers);
        return res;
      },
      end(body: string) {
        sent.status ??= res.statusCode;
        sent.body = body;
        resolve();
      },
    };
    apiMiddleware({})(req as unknown as IncomingMessage, res as unknown as ServerResponse);
  });
  for (const c of chunks) req.emit('data', c);
  req.emit('end');
  return { done, sent, req };
}

describe('dev and preview /api/assistant middleware', () => {
  it('passes a body within the cap to the handler', async () => {
    handler.mockClear();
    const { done, sent } = exchange([Buffer.from('{"a":'), Buffer.from('1}')]);
    await done;
    expect(sent.status).toBe(200);
    expect(JSON.parse(sent.body ?? '')).toEqual({ got: 7 });
  });

  it('answers 413 once the body passes the cap, like server/index.ts, and never calls the handler', async () => {
    handler.mockClear();
    const half = Buffer.alloc(DEV_MAX_BODY / 2 + 1, 'a');
    const { done, sent, req } = exchange([half, half, half]);
    await done;
    expect(DEV_MAX_BODY).toBe(16 * 1024);
    expect(sent.status).toBe(413);
    expect(sent.headers.connection).toBe('close');
    expect(JSON.parse(sent.body ?? '')).toEqual({ error: 'Request too large' });
    expect(req.resume).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
  });
});
