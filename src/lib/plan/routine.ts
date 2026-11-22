/** Low-emission daily routine: when and where to exercise, and masks. Commute tips live in ./commute.ts. */
import { cautious, fineToGoOut } from '../concern.js';
import { BREATHING_M3_PER_H, N95_REAL_WORLD_FILTRATION, indoorCut, pctCut, round, shutRatio } from '../impact.js';
import { partOfDay } from '../windows.js';
import * as copy from './copy/routine.js';
import { bilingual } from './text.js';
import { SCOPE } from './shared.js';
import { forMembers, memberNames, membersActivity, membersOf, selfActivity } from './household.js';
import { num } from './format.js';
import type { RecDraft, RuleInput } from './rule.js';
import { phrase } from './spans.js';

/** A workout is the "prolonged or heavy exertion" the EPA guide limits, so any limit on the person moves it indoors. */
function indoorsRec({ profile: p, avg }: RuleInput, reduceOnly: boolean): RecDraft {
  const ratio = shutRatio(p);
  const cut = indoorCut(p, 1);
  return {
    id: 'exercise-indoors',
    category: 'routine',
    priority: 1,
    title: copy.indoorsTitle(reduceOnly),
    detail: copy.indoorsDetail(reduceOnly),
    explanation: copy.indoorsWorking({
      outdoor: num(avg),
      indoor: num(avg * ratio),
      ratioPct: num(ratio * 100),
      rate: BREATHING_M3_PER_H.heavy,
      cut,
    }),
    exposureCutPct: cut,
    scope: SCOPE.exercise,
    shutsWindows: true,
    smogDefence: true,
    epaActivity: true,
  };
}

export function exerciseRec(input: RuleInput): RecDraft | null {
  const { profile: p, concern, avg, best, now } = input;
  if (p.exerciseMinutes <= 0) return null;
  // With no clean window on a day that is not "Good", indoors is the safe default.
  const self = selfActivity(input);
  if (self !== 'fine' || (!best && concern !== 'low')) return indoorsRec(input, self === 'reduce' || self === 'fine');
  if (!best) return null;
  const cut = pctCut(avg, best.avgPm25);
  // Sensitive members get the guide's own limit for this band, which here is at most "reduce".
  const limited = membersActivity(input) !== 'fine' && membersOf(p).length > 0;
  const light = limited ? copy.keepLight(memberNames(p)) : bilingual('', '');
  const fine = fineToGoOut(best.avgPm25);
  return {
    id: 'exercise-window',
    category: 'routine',
    priority: cut >= 15 ? 1 : 2,
    title: copy.windowTitle(fine, phrase(best, now, 'between')),
    detail: copy.windowDetail(copy.windowWhy(fine, partOfDay(best.start)), light),
    explanation: copy.windowWorking(num(best.avgPm25), num(avg), cut),
    exposureCutPct: cut,
    scope: SCOPE.exercise,
    smogDefence: true,
  };
}

export function maskRec({ profile: p, concern, dominant }: RuleInput): RecDraft | null {
  if (!cautious(concern)) return null;
  const pct = round(N95_REAL_WORLD_FILTRATION * 100);
  const ozone = dominant === 'o3';
  return {
    id: 'n95',
    category: 'routine',
    // Masks only stop particles; when ozone drives the AQI, timing matters more than the mask.
    priority: ozone ? 2 : 1,
    title: copy.MASK_TITLE,
    detail: copy.maskDetail(forMembers(p, copy.MASK_MEMBER_NOTES), ozone),
    explanation: copy.maskWorking(pct),
    exposureCutPct: pct,
    scope: SCOPE.outdoors,
    smogDefence: true,
  };
}
