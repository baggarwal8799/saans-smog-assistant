/** /api/assistant over Node's http: one copy for the production server and the Vite dev and preview servers. */
import type { IncomingMessage, ServerResponse } from 'node:http';

import { handleAssistant } from '../backend/handler.js';
import type { AssistantEnv } from '../backend/types.js';
import { readBody, sendError, toHeaders, toWebRequest, writeWebResponse } from './nodeAdapter.js';

export interface ApiSettings {
  env: AssistantEnv;
  /** Security headers sent under every response. */
  headers: Record<string, string>;
  /** Only a real reverse proxy may set X-Forwarded-For; otherwise clients could spoof it to dodge the rate limit. */
  trustProxy: boolean;
}

/** The client address and forwarded host are taken only from a trusted proxy. */
export function forwardHeaders(req: IncomingMessage, { trustProxy }: Pick<ApiSettings, 'trustProxy'>): Headers {
  const h = toHeaders(req);
  if (!trustProxy || !h.has('x-forwarded-for')) h.set('x-forwarded-for', req.socket.remoteAddress ?? 'unknown');
  // A client can send any X-Forwarded-Host; only a proxy we trust may set it, or the origin check could be fooled.
  if (!trustProxy) h.delete('x-forwarded-host');
  return h;
}

async function serve(
  req: IncomingMessage,
  res: ServerResponse,
  { env, headers, trustProxy }: ApiSettings,
): Promise<void> {
  const body = await readBody(req);
  if (body === null) {
    res.on('finish', () => req.destroy());
    sendError(res, 413, 'too_large', { connection: 'close', ...headers });
    return;
  }
  const response = await handleAssistant(toWebRequest(req, body, forwardHeaders(req, { trustProxy })), env);
  await writeWebResponse(res, response, headers);
}

/** Never rejects: the handler answers its own errors, and anything else becomes a 500 rather than a hung request. */
export function serveAssistant(req: IncomingMessage, res: ServerResponse, settings: ApiSettings): Promise<void> {
  return serve(req, res, settings).catch(() => sendError(res, 500, 'internal_error', settings.headers));
}
