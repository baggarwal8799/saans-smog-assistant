/**
 * Protecting the household's US EPA sensitive groups. Strictness comes from the EPA activity guide (epa.ts), the
 * same table the assistant's verdicts use, so the two never disagree. From "Unhealthy" up the advice covers the
 * whole day: the worst window is then an extra, and no time is offered for going out.
 */
import { aqiKey, t } from '../i18n.js';
import { indoorCut, shutRatio } from '../impact.js';
import type { TimeWindow } from '../types.js';
import { partOfDay } from '../windows.js';
import {
  MEDS,
  SCHOOL_RUNS,
  SCOPE_INDOORS,
  avoidAdvice,
  avoidAllAdvice,
  peakNote,
  reduceAdvice,
  vulnerableExplanation,
  type Level,
} from './copy/vulnerable.js';
import { bilingual, joinText } from './text.js';
import { SCOPE } from './shared.js';
import { forMembers, memberNames, membersActivity, membersOf } from './household.js';
import { num } from './format.js';
import type { RecDraft, RuleInput } from './rule.js';
import { phrase } from './spans.js';

/** Title and detail for one level. `worst` is required only for "reduce", where the window is the advice. */
function advice(level: Level, p: RuleInput['profile'], worst: TimeWindow | null, now: string) {
  const who = memberNames(p);
  const when = worst ? phrase(worst, now, 'fromTo') : bilingual('', '');
  const part = worst ? partOfDay(worst.start) : bilingual('', '');
  if (level === 'reduce') return reduceAdvice(who, when, part, forMembers(p, { children: SCHOOL_RUNS }));
  if (level === 'avoid') return avoidAdvice(who, when, part, worst !== null);
  return avoidAllAdvice(who, when, part, worst !== null);
}

export function vulnerableRec(input: RuleInput): RecDraft | null {
  const { profile: p, worst, now, band } = input;
  const level = membersActivity(input);
  if (membersOf(p).length === 0 || level === 'fine' || (level === 'reduce' && !worst)) return null;
  const { title, detail } = advice(level, p, worst, now);
  const meds = forMembers(p, { respiratory: MEDS });
  const cut = indoorCut(p, 1);
  const peak = worst ? peakNote(num(worst.avgPm25), phrase(worst, now, 'fromTo')) : bilingual('', '');
  const bandName = bilingual(t('en', aqiKey(band)), t('hi', aqiKey(band)));
  return {
    id: 'protect-vulnerable',
    category: 'routine',
    priority: 1,
    title,
    detail: joinText(detail, meds),
    explanation: vulnerableExplanation({ band: bandName, level, ratio: num(shutRatio(p) * 100), cut, peak }),
    exposureCutPct: cut,
    scope: level === 'reduce' ? SCOPE.vulnerable : SCOPE_INDOORS,
    smogDefence: true,
    epaActivity: true,
  };
}
