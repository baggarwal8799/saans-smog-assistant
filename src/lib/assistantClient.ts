import { LIMITS, type AssistantMode, type AssistantUiErrorCode, type AssistantResponse } from './contract.js';
import type { Lang, Place, Profile } from './types.js';

export const HISTORY_TURNS = LIMITS.historyTurns;
export const QUESTION_MAX = LIMITS.question;

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
    signal: AbortSignal.timeout(35_000),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<AssistantResponse> & { error?: string };
  if (!res.ok) throw new AssistantError(isKnownCode(data.error) ? data.error : 'ai_unavailable');
  if (typeof data.text !== 'string') throw new AssistantError('ai_unavailable');
  return { text: data.text };
}

const KNOWN_CODES: readonly AssistantUiErrorCode[] = [
  'not_configured',
  'ai_rate_limited',
  'ai_unavailable',
  'too_many_requests',
  'daily_limit',
];
/** A request-level code (too_large, forbidden_origin, …) has no message of its own, so it reads as ai_unavailable. */
const isKnownCode = (code: unknown): code is AssistantUiErrorCode => KNOWN_CODES.includes(code as AssistantUiErrorCode);

/** A failed assistant call, with a code the UI turns into a message in the user's language. */
export class AssistantError extends Error {
  constructor(readonly code: AssistantUiErrorCode) {
    super(code);
  }
}
