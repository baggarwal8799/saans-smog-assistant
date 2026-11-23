import { type RefObject, useEffect, useEffectEvent, useRef, useState } from 'react';

import type { AssistantMode } from '../../core/contract.js';
import { t } from '../../core/i18n.js';
import type { Lang, Place, Profile } from '../../core/types.js';
import { askAssistant, AssistantError, HISTORY_TURNS, QUESTION_MAX, UI_ERROR_KEYS } from '../lib/assistantClient.js';
import { scrollIntoViewRespectingMotion } from './scrollIntoView.js';

export const AUTO_SUMMARY_DELAY_MS = 1200;

/** Typed as possibly missing: there is no document outside a browser, and only some browsers have `connection`. */
interface MaybeBrowser {
  document?: Pick<Document, 'visibilityState'>;
  navigator?: Navigator & { connection?: { saveData?: boolean } };
}

/**
 * The automatic summary is a courtesy, not something the person asked for, so it is skipped when nobody is looking
 * (a background tab) or when the browser asks to save data. The "Explain my plan" button still asks on demand.
 */
export function autoSummaryAllowed(): boolean {
  const browser: MaybeBrowser = globalThis;
  if (browser.document?.visibilityState === 'hidden') return false;
  return browser.navigator?.connection?.saveData !== true;
}

export interface Answer {
  text: string;
  mode: AssistantMode;
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

function errorMessage(lang: Lang, err: unknown): string {
  return t(lang, UI_ERROR_KEYS[err instanceof AssistantError ? err.code : 'ai_unavailable']);
}

interface RunOptions {
  /** The automatic summary: it keeps the current answer on screen until the new one arrives, and never scrolls. */
  auto?: boolean;
}

interface AssistantState {
  input: { question: string; setQuestion: (question: string) => void };
  request: { pending: AssistantMode | null; busy: boolean; error: string };
  reply: { answer: Answer | null; answerRef: RefObject<HTMLElement | null> };
  run: (mode: AssistantMode) => Promise<void>;
}

export function useAssistant({ lang, place, profile, autoSummary, onAutoSummary }: AssistantOptions): AssistantState {
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
  // Only typed questions: sending the summary button's label would tell the model the person asked "Explain my plan".
  function rememberQuestion(mode: AssistantMode, asked: string) {
    if (mode === 'question') setHistory((h) => [...h, asked.trim().slice(0, QUESTION_MAX)].slice(-HISTORY_TURNS));
  }

  async function run(mode: AssistantMode, { auto = false }: RunOptions = {}) {
    const id = ++latest.current;
    setPending(mode);
    setError('');
    // A new question replaces the old answer at once, so nobody reads the previous reply as the new one.
    if (!auto) setAnswer(null);
    // Captured before the call, so editing the box while the reply is on its way cannot change what is remembered.
    const asked = question;
    try {
      const res = await askAssistant({ lang, mode, question: asked, place, profile, history });
      if (id !== latest.current) return;
      setAnswer({ text: res.text, mode, auto });
      rememberQuestion(mode, asked);
    } catch (err) {
      if (id === latest.current) setError(errorMessage(lang, err));
    } finally {
      if (id === latest.current) setPending(null);
    }
  }

  useAutoSummary({ autoSummary, onAutoSummary, ask: () => void run('summary', { auto: true }) });
  return {
    input: { question, setQuestion },
    request: { pending, busy: pending !== null, error },
    reply: { answer, answerRef },
    run,
  };
}

/**
 * On phones the answer renders below the fold; bring an answer the person asked for into view without stealing
 * focus. The automatic summary never scrolls: the page must not jump while someone is reading the plan.
 */
function useScrollToAnswer(answer: Answer | null): RefObject<HTMLElement | null> {
  const answerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!answer || answer.auto) return;
    scrollIntoViewRespectingMotion(answerRef.current, 'nearest');
  }, [answer]);
  return answerRef;
}

interface AutoSummaryOptions {
  autoSummary: boolean | undefined;
  onAutoSummary: (() => void) | undefined;
  ask: () => void;
}

/**
 * Waits for the plan to settle: a context change remounts the assistant and cancels the timer, so clicking through
 * the form asks once, not once per field. A skipped summary still counts as used, so later edits never ask either.
 */
function useAutoSummary({ autoSummary = false, onAutoSummary, ask }: AutoSummaryOptions): void {
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
