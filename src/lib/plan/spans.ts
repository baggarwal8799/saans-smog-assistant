/**
 * The one way a time span is written, in the plan and in the UI. Every day change is named: a span that starts
 * on a later day says "tomorrow", and one that runs past midnight says the end is on the next day, so "16:00 to
 * 10:00" can never be read as a single afternoon.
 */
import { formatHour } from '../windows.js';
import type { TimeWindow } from '../types.js';
import { bilingual, type Text } from './text.js';

type Span = Pick<TimeWindow, 'start' | 'end'>;
const day = (time: string): string => time.slice(0, 10);

interface Parts {
  /** "tomorrow " / "कल " when the span starts on a later day than `now`, else empty. */
  lead: Text;
  from: string;
  /** The end time, with its day named when it falls after the start's day: "10:00 tomorrow" / "कल 10:00". */
  to: Text;
  crosses: boolean;
}

function parts(w: Span, now: string): Parts {
  const later = day(w.start) > day(now);
  const crosses = day(w.end) > day(w.start);
  const to = formatHour(w.end);
  // "tomorrow" relative to a start that is itself tomorrow is "the day after".
  const endDay = later ? bilingual('the day after', 'परसों') : bilingual('tomorrow', 'कल');
  return {
    lead: later ? bilingual('tomorrow ', 'कल ') : bilingual('', ''),
    from: formatHour(w.start),
    to: crosses ? bilingual(`${to} ${endDay.en}`, `${endDay.hi} ${to}`) : bilingual(to, to),
    crosses,
  };
}

/** Time phrases for advice: "tomorrow between 14:00 and 16:00", "from 16:00 to 10:00 tomorrow". */
export function phrase(w: Span, now: string, kind: 'between' | 'fromTo' | 'around'): Text {
  const { lead, from, to, crosses } = parts(w, now);
  if (kind === 'between')
    return bilingual(`${lead.en}between ${from} and ${to.en}`, `${lead.hi}${from} से ${to.hi} के बीच`);
  if (kind === 'fromTo' || crosses) {
    const word = kind === 'fromTo' ? bilingual('from', 'तक') : bilingual('around', 'के आसपास');
    return bilingual(`${lead.en}${word.en} ${from} to ${to.en}`, `${lead.hi}${from} से ${to.hi} ${word.hi}`);
  }
  return bilingual(`${lead.en}around ${from}–${to.en}`, `${lead.hi}${from}–${to.hi} के आसपास`);
}

/** The compact label the UI shows for a window or smog trap: "14:00–16:00", "16:00–10:00 tomorrow". */
export function spanLabel(w: Span, now: string): Text {
  const { lead, from, to, crosses } = parts(w, now);
  return bilingual(
    `${lead.en}${from}–${to.en}`,
    crosses ? `${lead.hi}${from} से ${to.hi} तक` : `${lead.hi}${from}–${to.hi}`,
  );
}
