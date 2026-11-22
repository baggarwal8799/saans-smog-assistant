import type { AssistantErrorCode } from '../../api/_lib/gemini.js';
import type { AssistantMode, AssistantResponse } from '../../api/_lib/contract.js';
import { LIMITS } from '../../api/_lib/contract.js';
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
    // Only the place, household and the user's own questions go to the server; it fetches the air data and computes
    // the plan itself, so nothing the browser sends can change the numbers the AI is given. Answers are never sent back.
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

const KNOWN_CODES: readonly AssistantErrorCode[] = ['not_configured', 'ai_rate_limited', 'ai_unavailable', 'too_many_requests', 'daily_limit'];
const isKnownCode = (code: unknown): code is AssistantErrorCode => KNOWN_CODES.includes(code as AssistantErrorCode);

/** A failed assistant call, with a code the UI turns into a message in the user's language. */
export class AssistantError extends Error {
  constructor(readonly code: AssistantErrorCode) {
    super(code);
  }
}
