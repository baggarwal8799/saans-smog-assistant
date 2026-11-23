/** Low-emission daily routine: when and where to exercise, and masks. */
import { cautious, fineToGoOut } from '../concern.js';
import { NO_TEXT } from '../copy/text.js';
import { fmt } from '../figures.js';
import { BREATHING_M3_PER_H, indoorCut, N95_REAL_WORLD_FILTRATION, pctCut, round, shutRatio } from '../impact.js';
import { phrase } from '../spans.js';
import type { TimeWindow } from '../types.js';
import { partOfDay } from '../windows.js';
import * as copy from './copy/routine.js';
import { SCOPE } from './copy/shared.js';
import { forMembers, memberNames, membersActivity, membersOf, selfActivity } from './household.js';
import { exposureCut, type RecDraft, type RuleInput } from './rule.js';

/** A workout is the "prolonged or heavy exertion" the EPA guide limits, so any limit on the person moves it indoors. */
function indoorsRec({ profile, avg }: RuleInput, how: copy.Indoors): RecDraft {
  const ratio = shutRatio(profile);
  const cut = indoorCut(profile, 1);
  return {
    id: 'exercise-indoors',
    category: 'routine',
    priority: 1,
    title: copy.indoorsTitle(how),
    detail: copy.indoorsDetail(how),
    explanation: copy.indoorsWorking({
      outdoor: fmt(avg),
      indoor: fmt(avg * ratio),
      ratioPct: fmt(ratio * 100),
      rate: BREATHING_M3_PER_H.heavy,
      cut,
    }),
    impact: exposureCut(cut, SCOPE.exercise),
    traits: { shutsWindows: true, smogDefence: true, epaActivity: true },
  };
}

function windowRec(input: RuleInput, best: TimeWindow): RecDraft {
  const { profile, avg, now } = input;
  const cut = pctCut(avg, best.avgPm25);
  // Sensitive members get the guide's own limit for this band, which here is at most "reduce".
  const limited = membersActivity(input) !== 'fine' && membersOf(profile).length > 0;
  const light = limited ? copy.keepLight(memberNames(profile)) : NO_TEXT;
  const fine = fineToGoOut(best.avgPm25);
  return {
    id: 'exercise-window',
    category: 'routine',
    priority: cut >= 15 ? 1 : 2,
    title: copy.windowTitle({ fine, when: phrase(best, now, 'between') }),
    detail: copy.windowDetail(copy.windowWhy({ fine, part: partOfDay(best.start) }), light),
    explanation: copy.windowWorking(fmt(best.avgPm25), fmt(avg), cut),
    impact: exposureCut(cut, SCOPE.exercise),
    traits: { smogDefence: true },
  };
}

export function exerciseRec(input: RuleInput): RecDraft | null {
  const { profile, concern, best } = input;
  if (profile.exerciseMinutes <= 0) return null;
  // With no clean window on a day that is not "Good", indoors is the safe default.
  const self = selfActivity(input);
  if (self !== 'fine' || (!best && concern !== 'low'))
    return indoorsRec(input, { reduceOnly: self === 'reduce' || self === 'fine' });
  return best ? windowRec(input, best) : null;
}

export function maskRec({ profile, concern, dominant }: RuleInput): RecDraft | null {
  if (!cautious(concern)) return null;
  const pct = round(N95_REAL_WORLD_FILTRATION * 100);
  const ozone = dominant === 'o3';
  return {
    id: 'n95',
    category: 'routine',
    // Masks only stop particles; when ozone drives the AQI, timing matters more than the mask.
    priority: ozone ? 2 : 1,
    title: copy.MASK_TITLE,
    detail: copy.maskDetail({ who: forMembers(profile, copy.MASK_MEMBER_NOTES), ozone }),
    explanation: copy.maskWorking(pct),
    impact: exposureCut(pct, SCOPE.outdoors),
    traits: { smogDefence: true },
  };
}
