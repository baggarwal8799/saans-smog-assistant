/** The handler's JSON responses, and the result of a step that may end the request early. */
import type { AssistantErrorCode } from '../core/contract.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
} as const;

export function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
}

/** Only the code reaches the client; the reason stays in the server log. */
export const errorResponse = (
  status: number,
  code: AssistantErrorCode,
  headers: Record<string, string> = {},
): Response => json(status, { error: code }, headers);

export const retryAfter = (seconds: string): Record<string, string> => ({ 'retry-after': seconds });

export type Step<T> = { ok: true; value: T } | { ok: false; response: Response };

export const proceed = <T>(value: T): Step<T> => ({ ok: true, value });

export const stop = (response: Response): Step<never> => ({ ok: false, response });
