import type { ReactElement } from 'react';

/**
 * Placeholders shaped like the content that is loading, so the page does not jump when data arrives.
 * They are hidden from screen readers; the parent announces a short status message instead.
 */

export function AirSkeleton(): ReactElement {
  return (
    <div className="skeleton air-skeleton" aria-hidden="true">
      <span className="skel skel-title" />
      <div className="skel-reading">
        <span className="skel skel-badge" />
        <div className="skel-lines">
          <span className="skel skel-line w60" />
          <span className="skel skel-line w90" />
          <span className="skel skel-line w70" />
        </div>
      </div>
      <div className="skel-ribbon">
        {Array.from({ length: 24 }, (_, i) => (
          <span key={i} className="skel skel-bar" style={{ height: `${30 + ((i * 37) % 60)}%` }} />
        ))}
      </div>
    </div>
  );
}

export function PlanSkeleton(): ReactElement {
  return (
    <div className="skeleton plan-skeleton" aria-hidden="true">
      <span className="skel skel-title" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="skel-step">
          <span className="skel skel-num" />
          <div className="skel-lines">
            <span className="skel skel-line w70" />
            <span className="skel skel-line w100" />
            <span className="skel skel-line w90" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AnswerSkeleton(): ReactElement {
  return (
    <div className="skeleton answer-skeleton" aria-hidden="true">
      <span className="skel skel-line w40" />
      <span className="skel skel-line w100" />
      <span className="skel skel-line w90" />
      <span className="skel skel-line w70" />
    </div>
  );
}

export function FieldsSkeleton(): ReactElement {
  return (
    <div className="skeleton fields-skeleton" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="skel-lines">
          <span className="skel skel-line w40" />
          <span className="skel skel-line w100" />
        </div>
      ))}
    </div>
  );
}

export function Spinner(): ReactElement {
  return <span className="spinner" aria-hidden="true" />;
}
