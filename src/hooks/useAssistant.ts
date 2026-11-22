import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { AssistantError, HISTORY_TURNS, QUESTION_MAX, askAssistant } from '../lib/assistantClient';
import type { AssistantMode } from '../lib/contract';
import { t } from '../lib/i18n';
import type { Lang, Place, Profile } from '../lib/types';
import { scrollIntoViewRespectingMotion } from './scrollIntoView';

/** How long the plan must stay unchanged before Gemini is asked to explain it. */
export const AUTO_SUMMARY_DELAY_MS = 1200;

/**
 * The automatic summary is a courtesy, not something the person asked for, so it is skipped when nobody is looking
 * (a background tab) or when the browser asks to save data. The "Explain my plan" button still asks on demand.
 */
export function autoSummaryAllowed(): boolean {
  // No document outside a browser (server-side tests), though the DOM types say it always exists.
  const doc = globalThis.document as Document | undefined;
  if (doc?.visibilityState === 'hidden') return false;
  const nav = globalThis.navigator as (Navigator & { connection?: { saveData?: boolean } }) | undefined;
  return nav?.connection?.saveData !== true;
}

export interface Answer {
  text: string;
  mode: AssistantMode;
  /** Requested on its own when the plan appeared, not by a click. */
  auto: boolean;
}

export interface AssistantOptions {
  lang: Lang;
  place: Place;
  profile: Profile;
  /** Explain the plan without a click: true only for the first plan at a place, so edits never spend quota. */
  autoSummary?: boolean;
  /** Called when that automatic summary is used up: requested, or skipped by autoSummaryAllowed. */
  onAutoSummary?: () => void;
}

const ERROR_KEY = {
  not_configured: 'aiNotConfigured',
  ai_rate_limited: 'aiRateLimited',
  ai_unavailable: 'aiError',
  too_many_requests: 'aiTooMany',
  daily_limit: 'aiDailyLimit',
} as const;

/** Requests to Ask Saans: the typed question and its history, the answer, what is pending, and the auto-summary. */
export function useAssistant({ lang, place, profile, autoSummary = false, onAutoSummary }: AssistantOptions) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  // The user's last few typed questions (never answers), so a follow-up like "and for my father?" has context.
  const [history, setHistory] = useState<string[]>([]);
  // Which request is in flight, so only that button shows a spinner.
  const [pending, setPending] = useState<AssistantMode | null>(null);
  const [error, setError] = useState('');
  const answerRef = useScrollToAnswer(answer);

  // Only the latest request may change the screen, so a slow earlier reply can never replace a newer one.
  const latest = useRef(0);
  async function run(mode: AssistantMode, auto = false) {
    const id = ++latest.current;
    setPending(mode);
    setError('');
    // A new question replaces the old answer at once, so nobody reads the previous reply as the new one.
    if (!auto) setAnswer(null);
    try {
      const res = await askAssistant({ lang, mode, question, place, profile, history });
      if (id !== latest.current) return;
      setAnswer({ text: res.text, mode, auto });
      // History holds only what the person typed. A summary request is a button press, not a question, and sending
      // its label would tell the model the person asked "Explain my plan".
      if (mode === 'question') setHistory((h) => [...h, question.trim().slice(0, QUESTION_MAX)].slice(-HISTORY_TURNS));
    } catch (err) {
      if (id === latest.current)
        setError(t(lang, ERROR_KEY[err instanceof AssistantError ? err.code : 'ai_unavailable']));
    } finally {
      if (id === latest.current) setPending(null);
    }
  }

  useAutoSummary(autoSummary, onAutoSummary, () => void run('summary', true));
  return { question, setQuestion, answer, answerRef, pending, busy: pending !== null, error, run };
}

/**
 * On phones the answer renders below the fold; bring an answer the person asked for into view without stealing
 * focus. The automatic summary never scrolls: the page must not jump while someone is reading the plan.
 */
function useScrollToAnswer(answer: Answer | null) {
  const answerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!answer || answer.auto) return;
    scrollIntoViewRespectingMotion(answerRef.current, 'nearest');
  }, [answer]);
  return answerRef;
}

/**
 * Gemini explains the plan once it settles. App remounts the assistant (its key) when the place, household or
 * language changes; unmounting cancels the timer, so clicking through the household form asks once, for the
 * final answer, not once per field. Repeat loads are served by the server's cache. A skipped summary still counts
 * as used, so a later household edit at the same place never asks on its own either.
 */
function useAutoSummary(autoSummary: boolean, onAutoSummary: (() => void) | undefined, ask: () => void) {
  const askSummary = useEffectEvent(ask);
  const autoAsked = useEffectEvent(() => onAutoSummary?.());
  useEffect(() => {
    if (!autoSummary) return;
    const timer = setTimeout(() => {
      autoAsked();
      if (autoSummaryAllowed()) askSummary();
    }, AUTO_SUMMARY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [autoSummary]);
}
