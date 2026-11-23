/**
 * The hours in the next 24 h fit for outdoor activity, from the US EPA verdict for each hour. The model may suggest
 * a time to go out only from this: the end of a smog trap says nothing about whether the air after it is fit.
 */
import { epaVerdict, type Person } from './epa.js';
import { isoMinute } from './isoTime.js';
import type { AirReport, HourPoint, Profile } from './types.js';
import { peopleAsked } from './verdict.js';
import { addHours, endTime, type Span } from './windows.js';

const judgedSensitive = (question: string, profile: Profile): boolean =>
  profile.hasChildren ||
  profile.hasElderly ||
  profile.hasRespiratory ||
  peopleAsked(question, profile).some((p) => p.sensitive);

/** The part of the hour between `now` and `horizon`, when its EPA verdict is "fine". */
function fitHour(point: HourPoint, [now, horizon]: readonly [string, string], who: Person): Span | null {
  const end = endTime(point.time) < horizon ? endTime(point.time) : horizon;
  if (end <= now || point.time >= horizon || epaVerdict(point.usAqi, who) !== 'fine') return null;
  return { start: point.time < now ? now : isoMinute(point.time), end };
}

/** Exactly 24 h ahead, adjacent fit hours merged. */
export function fitSpans(report: AirReport, who: Person): Span[] {
  const now = isoMinute(report.current.time);
  const range = [now, addHours(now, 24)] as const;
  const spans: Span[] = [];
  for (const point of report.hourly) {
    const hour = fitHour(point, range, who);
    const last = spans.at(-1);
    if (hour && last?.end === hour.start) last.end = hour.end;
    else if (hour) spans.push(hour);
  }
  return spans;
}

interface OutdoorHours {
  /** Judged for US EPA sensitive groups. */
  sensitive: boolean;
  spans: Span[];
}

export function outdoorHours(report: AirReport, profile: Profile, question = ''): OutdoorHours {
  const sensitive = judgedSensitive(question, profile);
  return { sensitive, spans: fitSpans(report, { sensitive }) };
}
