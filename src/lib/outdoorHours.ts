/**
 * The hours in the next 24 h that are fit for outdoor activity for this household, computed from the US EPA
 * verdict for each forecast hour. The model may suggest a time to go out only from this fact: the end of a smog
 * trap or of the most polluted window says nothing about whether the air after it is fit to be out in. Pure.
 */
import { epaVerdict, peopleAsked } from './verdict.js';
import { addHours, endTime, spanText, type Span } from './windows.js';
import type { AirReport, Profile } from './types.js';

/** True when the household, or anyone the question names, is in a US EPA sensitive group. */
export const judgedSensitive = (question: string, profile: Profile): boolean =>
  profile.hasChildren ||
  profile.hasElderly ||
  profile.hasRespiratory ||
  peopleAsked(question, profile).some((p) => p.sensitive);

/** The spans from now to exactly 24 h ahead in which every hour gets the EPA verdict "fine"; adjacent hours merge. */
export function fitSpans(report: AirReport, sensitive: boolean): Span[] {
  const now = report.current.time.slice(0, 16);
  const horizon = addHours(now, 24);
  const spans: Span[] = [];
  for (const p of report.hourly) {
    const end = endTime(p.time) < horizon ? endTime(p.time) : horizon;
    if (end <= now || p.time >= horizon || epaVerdict(p.usAqi, sensitive) !== 'fine') continue;
    const last = spans[spans.length - 1];
    const start = p.time < now ? now : p.time.slice(0, 16);
    if (last && last.end === start) last.end = end;
    else spans.push({ start, end });
  }
  return spans;
}

/** The CONTEXT line: "13:00–16:00 today, 12:00–15:00 tomorrow", or "none in the next 24 hours". */
export function outdoorHoursFact(report: AirReport, profile: Profile, question = ''): string {
  const sensitive = judgedSensitive(question, profile);
  const spans = fitSpans(report, sensitive);
  const who = sensitive ? 'judged for its US EPA sensitive groups' : 'US EPA guidance for everyone';
  const hours =
    spans.length > 0 ? spans.map((w) => spanText(w, report.current.time)).join(', ') : 'none in the next 24 hours';
  return `Hours fit for outdoor activity for this household (${who}): ${hours}`;
}
