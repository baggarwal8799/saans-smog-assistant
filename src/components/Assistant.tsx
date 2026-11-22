import { useId, type SubmitEvent, type RefObject } from 'react';
import { useAssistant, type Answer, type AssistantOptions } from '../hooks/useAssistant';
import { QUESTION_MAX } from '../lib/assistantClient';
import type { AssistantMode } from '../lib/contract';
import { t } from '../lib/i18n';
import type { Lang } from '../lib/types';
import { AnswerText } from './AnswerText';
import { AnswerSkeleton, Spinner } from './Skeleton';

export function Assistant(props: Readonly<AssistantOptions>) {
  const { lang } = props;
  const { question, setQuestion, answer, answerRef, pending, busy, error, run } = useAssistant(props);

  return (
    <section aria-labelledby="ask-heading" className="ask">
      <h2 id="ask-heading">{t(lang, 'assistantHeading')}</h2>
      <p className="note">{t(lang, 'assistantIntro')}</p>
      <p className="note">{t(lang, 'poweredBy')}</p>

      <button type="button" onClick={() => void run('summary')} disabled={busy} aria-busy={pending === 'summary'}>
        {pending === 'summary' && <Spinner />}
        {t(lang, 'getSummary')}
      </button>

      <AskForm
        lang={lang}
        question={question}
        onQuestion={setQuestion}
        pending={pending}
        onAsk={() => void run('question')}
      />
      <AnswerArea lang={lang} busy={busy} error={error} answer={answer} answerRef={answerRef} />
    </section>
  );
}

interface AskFormProps {
  lang: Lang;
  question: string;
  onQuestion: (q: string) => void;
  pending: AssistantMode | null;
  onAsk: () => void;
}

function AskForm({ lang, question, onQuestion, pending, onAsk }: Readonly<AskFormProps>) {
  const qId = useId();
  const hintId = useId();
  const busy = pending !== null;
  const tooLong = question.length > QUESTION_MAX;
  function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (question.trim().length > 0) onAsk();
  }
  return (
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
        onChange={(e) => onQuestion(e.target.value)}
      />
      <p id={hintId} className="note">
        {question.length}/{QUESTION_MAX}
        {tooLong && ` · ${t(lang, 'tooLong', { n: QUESTION_MAX })}`}
      </p>
      <button
        type="submit"
        disabled={busy || tooLong || question.trim().length === 0}
        aria-busy={pending === 'question'}
      >
        {pending === 'question' && <Spinner />}
        {t(lang, 'ask')}
      </button>
    </form>
  );
}

interface AnswerAreaProps {
  lang: Lang;
  busy: boolean;
  error: string;
  answer: Answer | null;
  answerRef: RefObject<HTMLElement | null>;
}

function AnswerArea({ lang, busy, error, answer, answerRef }: Readonly<AnswerAreaProps>) {
  return (
    <>
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
    </>
  );
}
