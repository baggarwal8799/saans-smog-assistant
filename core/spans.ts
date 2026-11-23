/**
 * The one way a time span is written, in the plan and the UI. Every day change is named, so "16:00 to 10:00" can
 * never be read as a single afternoon.
 */
import { bilingual, type Text } from './copy/text.js';
import { isoDate } from './isoTime.js';
import type { TimeWindow } from './types.js';
import { formatHour } from './windows.js';

type Span = Pick<TimeWindow, 'start' | 'end'>;

interface Parts {
  /** "tomorrow " / "कल " when the span starts on a later day than `now`, else empty. */
  lead: Text;
  from: string;
  /** The end time, with its day named when it falls after the start's day: "10:00 tomorrow" / "कल 10:00". */
  to: Text;
  crosses: boolean;
}

function parts(span: Span, now: string): Parts {
  const later = isoDate(span.start) > isoDate(now);
  const crosses = isoDate(span.end) > isoDate(span.start);
  const to = formatHour(span.end);
  // "tomorrow" relative to a start that is itself tomorrow is "the day after".
  const endDay = later ? bilingual('the day after', 'परसों') : bilingual('tomorrow', 'कल');
  return {
    lead: later ? bilingual('tomorrow ', 'कल ') : bilingual('', ''),
    from: formatHour(span.start),
    to: crosses ? bilingual(`${to} ${endDay.en}`, `${endDay.hi} ${to}`) : bilingual(to, to),
    crosses,
  };
}

/** Time phrases for advice: "tomorrow between 14:00 and 16:00", "from 16:00 to 10:00 tomorrow". */
export function phrase(span: Span, now: string, kind: 'between' | 'fromTo' | 'around'): Text {
  const { lead, from, to, crosses } = parts(span, now);
  if (kind === 'between')
    return bilingual(`${lead.en}between ${from} and ${to.en}`, `${lead.hi}${from} से ${to.hi} के बीच`);
  if (kind === 'fromTo' || crosses) {
    const word = kind === 'fromTo' ? bilingual('from', 'तक') : bilingual('around', 'के आसपास');
    return bilingual(`${lead.en}${word.en} ${from} to ${to.en}`, `${lead.hi}${from} से ${to.hi} ${word.hi}`);
  }
  return bilingual(`${lead.en}around ${from}–${to.en}`, `${lead.hi}${from}–${to.hi} के आसपास`);
}

/** The compact label the UI shows for a window or smog trap: "14:00–16:00", "16:00–10:00 tomorrow". */
export function spanLabel(span: Span, now: string): Text {
  const { lead, from, to, crosses } = parts(span, now);
  return bilingual(
    `${lead.en}${from}–${to.en}`,
    crosses ? `${lead.hi}${from} से ${to.hi} तक` : `${lead.hi}${from}–${to.hi}`,
  );
}
