/** Time-critical alerts: the ozone peak and the winter smog trap. Protecting vulnerable people: ./vulnerable.ts. */
import { cautious } from '../concern.js';
import { activityRank } from '../epa.js';
import { INDOOR_OZONE_RATIO, pctCut } from '../impact.js';
import type { Concern, Pollutant, TimeWindow } from '../types.js';
import { TRAP_MIXING_M, TRAP_WIND_KMH } from '../weather.js';
import { OZONE_SENSITIVE_UG, partOfDay } from '../windows.js';
import {
  ASTHMA,
  CANDLES,
  COILS,
  EXERCISE_INDOORS,
  TRAP_SCOPE,
  WALK_GENTLY,
  ozoneDetail,
  ozoneExplanation,
  ozoneTitle,
  trapDetail,
  trapExplanation,
  trapTitle,
} from './copy/alerts.js';
import { weatherFigure } from './figures.js';
import { OZONE_CONCERN_UG, SCOPE, shut } from './shared.js';
import { forMembers, householdActivity } from './household.js';
import { num } from './format.js';
import type { RecDraft, RuleInput } from './rule.js';
import { phrase } from './spans.js';

/**
 * Ozone advice is proportional: only when ozone drives the AQI and its peak reaches the concern level or the
 * concern is cautious. A "Good" day with ordinary ozone gets no alarm.
 */
export function ozoneWorthWarning(
  peak: TimeWindow | null,
  dominant: Pollutant | null,
  concern: Concern,
): peak is TimeWindow & { avgO3: number } {
  if (dominant !== 'o3' || peak?.avgO3 === undefined) return false;
  return peak.avgO3 >= OZONE_CONCERN_UG || cautious(concern);
}

export function ozoneRec(input: RuleInput): RecDraft | null {
  const { profile: p, dominant, ozonePeak, now, concern } = input;
  if (!ozoneWorthWarning(ozonePeak, dominant, concern)) return null;
  // From the EPA "avoid" level on, the assistant answers "No" to going out, so no gentle walk is offered either.
  const indoorsOnly = activityRank(householdActivity(input)) >= activityRank('avoid');
  const gentle = indoorsOnly ? EXERCISE_INDOORS : WALK_GENTLY;
  const when = phrase(ozonePeak, now, 'fromTo');
  const cut = pctCut(1, INDOOR_OZONE_RATIO);
  const asthma = forMembers(p, { respiratory: ASTHMA });
  return {
    id: 'ozone-effort',
    category: 'routine',
    priority: 1,
    title: ozoneTitle(when),
    detail: ozoneDetail(partOfDay(ozonePeak.start), gentle, asthma),
    explanation: ozoneExplanation(num(ozonePeak.avgO3), OZONE_SENSITIVE_UG, num(INDOOR_OZONE_RATIO * 100), cut),
    exposureCutPct: cut,
    scope: SCOPE.exercise,
    pollutant: 'ozone',
    epaActivity: true,
  };
}

export function smogTrapRec({ profile: p, trap, now, mosquitoes }: RuleInput): RecDraft | null {
  if (!trap) return null;
  const windows = shut(p);
  const wind = weatherFigure('wind', trap.avgWindKmh);
  const mixing = weatherFigure('mixing', trap.minMixingM);
  return {
    id: 'smog-trap',
    category: 'routine',
    priority: 1,
    title: trapTitle(phrase(trap, now, 'fromTo')),
    detail: trapDetail(mosquitoes ? COILS : CANDLES),
    explanation: trapExplanation({
      wind,
      mixing,
      windKmh: TRAP_WIND_KMH,
      mixingM: TRAP_MIXING_M,
      working: windows.working,
    }),
    exposureCutPct: windows.cut,
    scope: TRAP_SCOPE,
    shutsWindows: true,
    smogDefence: true,
  };
}
