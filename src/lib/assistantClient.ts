import { type AssistantMode, type AssistantResponse, type AssistantUiErrorCode, LIMITS } from '../../core/contract.js';
import type { MessageKey } from '../../core/i18n.js';
import { isRecord } from '../../core/parse.js';
import type { Lang, Place, Profile } from '../../core/types.js';

export const HISTORY_TURNS = LIMITS.historyTurns;
export const QUESTION_MAX = LIMITS.question;
/** Longer than the function's 30 s maxDuration (vercel.json), so the server's own error arrives first. */
const ASSISTANT_TIMEOUT_MS = 35_000;

export async function askAssistant(
  args: { lang: Lang; mode: AssistantMode; question?: string; place: Place; profile: Profile; history?: string[] },
  fetchImpl: typeof fetch = fetch,
): Promise<AssistantResponse> {
  const res = await fetchImpl('/api/assistant', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // Only who, where and the user's own questions: the server derives every number itself, so none can be forged.
    body: JSON.stringify({
      lang: args.lang,
      mode: args.mode,
      question: args.question ?? '',
      place: args.place,
      profile: args.profile,
      history: args.history ?? [],
    }),
    signal: AbortSignal.timeout(ASSISTANT_TIMEOUT_MS),
  });
  const body: unknown = await res.json().catch(() => ({}));
  const data = isRecord(body) ? body : {};
  if (!res.ok) throw new AssistantError(isKnownCode(data.error) ? data.error : 'ai_unavailable');
  if (typeof data.text !== 'string') throw new AssistantError('ai_unavailable');
  return { text: data.text };
}

export const UI_ERROR_KEYS = {
  not_configured: 'aiNotConfigured',
  ai_rate_limited: 'aiRateLimited',
  ai_unavailable: 'aiError',
  too_many_requests: 'aiTooMany',
  daily_limit: 'aiDailyLimit',
} as const satisfies Record<AssistantUiErrorCode, MessageKey>;

/** A request-level code (too_large, forbidden_origin, …) has no message of its own, so it reads as ai_unavailable. */
const isKnownCode = (code: unknown): code is AssistantUiErrorCode =>
  typeof code === 'string' && Object.hasOwn(UI_ERROR_KEYS, code);

export class AssistantError extends Error {
  constructor(readonly code: AssistantUiErrorCode) {
    super(code);
  }
}
