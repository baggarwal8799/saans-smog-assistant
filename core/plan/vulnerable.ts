/**
 * Protecting the household's US EPA sensitive groups, as strict as the assistant's verdicts. From "Unhealthy" up the
 * advice covers the whole day, and no time is offered for going out.
 */
import { bilingual, joinText, NO_TEXT } from '../copy/text.js';
import { fmt } from '../figures.js';
import { aqiKey, t } from '../i18n.js';
import { indoorCut, shutRatio } from '../impact.js';
import { phrase } from '../spans.js';
import type { TimeWindow } from '../types.js';
import { partOfDay } from '../windows.js';
import { SCOPE } from './copy/shared.js';
import type { TipCopy } from './copy/types.js';
import {
  avoidAdvice,
  avoidAllAdvice,
  type Level,
  MEDS,
  type Peak,
  peakNote,
  reduceAdvice,
  SCHOOL_RUNS,
  SCOPE_INDOORS,
  vulnerableExplanation,
} from './copy/vulnerable.js';
import { forMembers, memberNames, membersActivity, membersOf } from './household.js';
import { exposureCut, type RecDraft, type RuleInput } from './rule.js';

/** Title and detail for one level. A peak is required only for "reduce", where the window is the advice. */
function advice(
  level: Level,
  profile: RuleInput['profile'],
  worst: TimeWindow | null,
  now: string,
): Pick<TipCopy, 'title' | 'detail'> {
  const who = memberNames(profile);
  const peak: Peak | null = worst ? { when: phrase(worst, now, 'fromTo'), part: partOfDay(worst.start) } : null;
  if (level === 'reduce' && peak) return reduceAdvice(who, peak, forMembers(profile, { children: SCHOOL_RUNS }));
  return level === 'avoidAll' ? avoidAllAdvice(who, peak) : avoidAdvice(who, peak);
}

export function vulnerableRec(input: RuleInput): RecDraft | null {
  const { profile, worst, now, band } = input;
  const level = membersActivity(input);
  if (membersOf(profile).length === 0 || level === 'fine' || (level === 'reduce' && !worst)) return null;
  const { title, detail } = advice(level, profile, worst, now);
  const meds = forMembers(profile, { respiratory: MEDS });
  const cut = indoorCut(profile, 1);
  const peak = worst ? peakNote(fmt(worst.avgPm25), phrase(worst, now, 'fromTo')) : NO_TEXT;
  const bandName = bilingual(t('en', aqiKey(band)), t('hi', aqiKey(band)));
  return {
    id: 'protect-vulnerable',
    category: 'routine',
    priority: 1,
    title,
    detail: joinText([detail, meds]),
    explanation: vulnerableExplanation({ band: bandName, level, ratio: fmt(shutRatio(profile) * 100), cut, peak }),
    impact: exposureCut(cut, level === 'reduce' ? SCOPE.vulnerable : SCOPE_INDOORS),
    traits: { smogDefence: true, epaActivity: true },
  };
}
