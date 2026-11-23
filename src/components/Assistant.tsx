import { type ReactElement, type RefObject, type SubmitEvent, useId } from 'react';

import type { AssistantMode } from '../../core/contract.js';
import { t } from '../../core/i18n.js';
import { type Answer, type AssistantOptions, useAssistant } from '../hooks/useAssistant.js';
import { useCurrentLang } from '../hooks/useCurrentLang.js';
import { QUESTION_MAX } from '../lib/assistantClient.js';
import { AnswerText } from './AnswerText.js';
import { AnswerSkeleton, Spinner } from './Skeleton.js';

export function Assistant(props: Readonly<Omit<AssistantOptions, 'lang'>>): ReactElement {
  const lang = useCurrentLang();
  const { input, request, reply, run } = useAssistant({ ...props, lang });
  const { pending, busy } = request;

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
        question={input.question}
        onQuestion={input.setQuestion}
        pending={pending}
        onAsk={() => void run('question')}
      />
      <AnswerArea busy={busy} error={request.error} answer={reply.answer} answerRef={reply.answerRef} />
    </section>
  );
}

interface AskFormProps {
  question: string;
  onQuestion: (q: string) => void;
  pending: AssistantMode | null;
  onAsk: () => void;
}

function AskForm({ question, onQuestion, pending, onAsk }: Readonly<AskFormProps>) {
  const lang = useCurrentLang();
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
  busy: boolean;
  error: string;
  answer: Answer | null;
  answerRef: RefObject<HTMLElement | null>;
}

function AnswerArea({ busy, error, answer, answerRef }: Readonly<AnswerAreaProps>) {
  const lang = useCurrentLang();
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
