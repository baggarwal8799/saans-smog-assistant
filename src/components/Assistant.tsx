import { useEffect, useEffectEvent, useId, useRef, useState, type FormEvent } from 'react';
import type { AssistantMode } from '../../api/_lib/contract';
import { AssistantError, HISTORY_TURNS, QUESTION_MAX, askAssistant } from '../lib/assistantClient';
import { AnswerText } from './AnswerText';
import { t } from '../lib/i18n';
import type { Lang, Place, Profile } from '../lib/types';
import { AnswerSkeleton, Spinner } from './Skeleton';

/** How long the plan must stay unchanged before Gemini is asked to explain it. */
export const AUTO_SUMMARY_DELAY_MS = 1200;

/**
 * The automatic summary is a courtesy, not something the person asked for, so it is skipped when nobody is looking
 * (a background tab) or when the browser asks to save data. The "Explain my plan" button still asks on demand.
 */
export function autoSummaryAllowed(): boolean {
  if (globalThis.document?.visibilityState === 'hidden') return false;
  const nav = globalThis.navigator as (Navigator & { connection?: { saveData?: boolean } }) | undefined;
  return nav?.connection?.saveData !== true;
}

interface Props {
  lang: Lang;
  place: Place;
  profile: Profile;
  /** Explain the plan without a click: true only for the first plan at a place, so edits never spend quota. */
  autoSummary?: boolean;
  /** Called when that automatic summary is used up: requested, or skipped by autoSummaryAllowed. */
  onAutoSummary?: () => void;
}

interface Answer {
  text: string;
  mode: AssistantMode;
  /** Requested on its own when the plan appeared, not by a click. */
  auto: boolean;
}

const ERROR_KEY = {
  not_configured: 'aiNotConfigured',
  ai_rate_limited: 'aiRateLimited',
  ai_unavailable: 'aiError',
  too_many_requests: 'aiTooMany',
  daily_limit: 'aiDailyLimit',
} as const;

export function Assistant({ lang, place, profile, autoSummary = false, onAutoSummary }: Props) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  // The user's last few typed questions (never the answers or summary requests), so a follow-up such as "and for my father?" has its context.
  const [history, setHistory] = useState<string[]>([]);
  // Which request is in flight, so only that button shows a spinner.
  const [pending, setPending] = useState<AssistantMode | null>(null);
  const busy = pending !== null;
  const [error, setError] = useState('');
  const answerRef = useRef<HTMLElement>(null);
  const qId = useId();

  // On phones the answer renders below the fold; bring an answer the person asked for into view without stealing
  // focus. The automatic summary never scrolls: the page must not jump while someone is reading the plan.
  useEffect(() => {
    if (!answer || answer.auto) return;
    const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    answerRef.current?.scrollIntoView?.({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [answer]);
  const hintId = useId();

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
      if (id === latest.current) setError(t(lang, ERROR_KEY[err instanceof AssistantError ? err.code : 'ai_unavailable']));
    } finally {
      if (id === latest.current) setPending(null);
    }
  }

  // Gemini explains the plan once it settles. App remounts this component (its key) when the place, household or
  // language changes; unmounting cancels the timer, so clicking through the household form asks once, for the
  // final answer, not once per field. Repeat loads are served by the server's cache. A skipped summary still counts
  // as used, so a later household edit at the same place never asks on its own either.
  const askSummary = useEffectEvent(() => void run('summary', true));
  const autoAsked = useEffectEvent(() => onAutoSummary?.());
  useEffect(() => {
    if (!autoSummary) return;
    const timer = setTimeout(() => {
      autoAsked();
      if (autoSummaryAllowed()) askSummary();
    }, AUTO_SUMMARY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [autoSummary]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (question.trim().length > 0) void run('question');
  }

  const tooLong = question.length > QUESTION_MAX;

  return (
    <section aria-labelledby="ask-heading" className="ask">
      <h2 id="ask-heading">{t(lang, 'assistantHeading')}</h2>
      <p className="note">{t(lang, 'assistantIntro')}</p>
      <p className="note">{t(lang, 'poweredBy')}</p>

      <button type="button" onClick={() => void run('summary')} disabled={busy} aria-busy={pending === 'summary'}>
        {pending === 'summary' && <Spinner />}
        {t(lang, 'getSummary')}
      </button>

      <form onSubmit={onSubmit} className="ask-form">
        <label htmlFor={qId}>{t(lang, 'question')}</label>
        <textarea
          id={qId}
          rows={3}
          maxLength={QUESTION_MAX}
          value={question}
          placeholder={t(lang, 'questionPlaceholder')}
          aria-describedby={hintId}
          aria-invalid={tooLong}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <p id={hintId} className="note">
          {question.length}/{QUESTION_MAX}
          {tooLong && ` · ${t(lang, 'tooLong', { n: QUESTION_MAX })}`}
        </p>
        <button type="submit" disabled={busy || tooLong || question.trim().length === 0} aria-busy={pending === 'question'}>
          {pending === 'question' && <Spinner />}
          {t(lang, 'ask')}
        </button>
      </form>

      <div className="answer-region">
        {busy && (
          <div role="status" aria-busy="true">
            <p className="note">{t(lang, 'thinking')}</p>
            <AnswerSkeleton />
          </div>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>
      {/* Always in the page, so screen readers reliably announce the answer when it is filled in. */}
      <div aria-live="polite" className="answer-live">
        {answer && !busy && (
          <figure className="answer" ref={answerRef}>
            <figcaption>{t(lang, answer.mode === 'summary' ? 'aiSummary' : 'aiAnswer')}</figcaption>
            <AnswerText text={answer.text} />
          </figure>
        )}
      </div>
    </section>
  );
}
