/** Time-critical alerts: the ozone peak and the winter smog trap. */
import { cautious } from '../concern.js';
import { activityRank } from '../epa.js';
import { fmt, weatherFigure } from '../figures.js';
import { INDOOR_OZONE_RATIO, pctCut } from '../impact.js';
import { phrase } from '../spans.js';
import type { Concern, Pollutant, TimeWindow } from '../types.js';
import { TRAP_MIXING_M, TRAP_WIND_KMH } from '../weather.js';
import { OZONE_SENSITIVE_UG, partOfDay } from '../windows.js';
import {
  ASTHMA,
  CANDLES,
  COILS,
  EXERCISE_INDOORS,
  ozoneDetail,
  ozoneExplanation,
  ozoneTitle,
  TRAP_SCOPE,
  trapDetail,
  trapExplanation,
  trapTitle,
  WALK_GENTLY,
} from './copy/alerts.js';
import { SCOPE } from './copy/shared.js';
import { forMembers, householdActivity } from './household.js';
import { exposureCut, type RecDraft, type RuleInput } from './rule.js';
import { OZONE_CONCERN_UG, shut } from './shared.js';

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
  const { profile, dominant, ozonePeak, now, concern } = input;
  if (!ozoneWorthWarning(ozonePeak, dominant, concern)) return null;
  // From the EPA "avoid" level on, the assistant answers "No" to going out, so no gentle walk is offered either.
  const indoorsOnly = activityRank(householdActivity(input)) >= activityRank('avoid');
  const gentle = indoorsOnly ? EXERCISE_INDOORS : WALK_GENTLY;
  const when = phrase(ozonePeak, now, 'fromTo');
  const cut = pctCut(1, INDOOR_OZONE_RATIO);
  const asthma = forMembers(profile, { respiratory: ASTHMA });
  return {
    id: 'ozone-effort',
    category: 'routine',
    priority: 1,
    title: ozoneTitle(when),
    detail: ozoneDetail(partOfDay(ozonePeak.start), gentle, asthma),
    explanation: ozoneExplanation(fmt(ozonePeak.avgO3), OZONE_SENSITIVE_UG, fmt(INDOOR_OZONE_RATIO * 100), cut),
    impact: exposureCut(cut, SCOPE.exercise, 'ozone'),
    traits: { epaActivity: true },
  };
}

export function smogTrapRec({ profile, trap, now, mosquitoes }: RuleInput): RecDraft | null {
  if (!trap) return null;
  const windows = shut(profile);
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
    impact: exposureCut(windows.cut, TRAP_SCOPE),
    traits: { shutsWindows: true, smogDefence: true },
  };
}
