/** Node glue for the shared /api/assistant handler, one copy for production and dev so they cannot drift apart. */
import type { IncomingMessage, ServerResponse } from 'node:http';

import { readCapped } from '../backend/body.js';
import type { AssistantEnv } from '../backend/types.js';
import { type AssistantErrorCode, LIMITS } from '../core/contract.js';

export const assistantEnv = (env: Record<string, string | undefined>): AssistantEnv => ({
  GEMINI_API_KEY: env.GEMINI_API_KEY,
  GEMINI_MODEL: env.GEMINI_MODEL,
  MAX_AI_CALLS_PER_DAY: env.MAX_AI_CALLS_PER_DAY,
  MAX_AI_REQUESTS_PER_CLIENT_PER_DAY: env.MAX_AI_REQUESTS_PER_CLIENT_PER_DAY,
  UPSTASH_REDIS_REST_URL: env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: env.UPSTASH_REDIS_REST_TOKEN,
});

/** Repeated headers (not single strings) are dropped. */
export function toHeaders(req: IncomingMessage): Headers {
  const h = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') h.set(k, v);
  return h;
}

export function toWebRequest(req: IncomingMessage, body: string, headers: Headers = toHeaders(req)): Request {
  return new Request(`http://${req.headers.host ?? 'localhost'}/api/assistant`, {
    method: req.method ?? 'GET',
    headers,
    ...(body.length > 0 ? { body } : {}),
  });
}

/** Cancelling (an oversized body) only stops buffering: the socket stays open so the 413 can still be sent. */
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

/** '' for GET and HEAD; null past LIMITS.bodyBytes, enforced while reading, or when the upload fails. */
export const readBody = (req: IncomingMessage): Promise<string | null> =>
  req.method === 'GET' || req.method === 'HEAD'
    ? Promise.resolve('')
    : readCapped({ body: bodyStream(req) }, LIMITS.bodyBytes).catch(() => null);

/** The handler's own error body, `{"error":"<code>"}`; headers already sent stay as they are. */
export function sendError(
  res: ServerResponse,
  status: number,
  code: AssistantErrorCode,
  headers: Record<string, string> = {},
): void {
  if (!res.headersSent) res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify({ error: code }));
}

/** The handler's response, with `headers` under it: merged case-insensitively, so nosniff is never sent twice. */
export async function writeWebResponse(
  res: ServerResponse,
  response: Response,
  headers: Record<string, string>,
): Promise<void> {
  const merged = new Headers(headers);
  response.headers.forEach((v, k) => merged.set(k, v));
  res.writeHead(response.status, Object.fromEntries(merged));
  res.end(await response.text());
}
