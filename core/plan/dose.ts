/** The plan's dose estimate: what the household breathes with exactly the plan's tips applied. */
import { dailyDoseUg, type DoseOptions, habitRatio, INDOOR_RATIO, pctCut, round } from '../impact.js';
import type { Commute, DoseEstimate, Profile, RecId, TimeWindow } from '../types.js';
import { safestTransit } from './commute.js';

/** The indoor ratio the plan's own tips reach: a DIY filter, else shut windows, else the open-window baseline. */
export function homeRatio(ids: ReadonlySet<RecId>): number {
  if (ids.has('diy-purifier')) return INDOOR_RATIO.diyFilter;
  return ids.has('smog-trap') || ids.has('ventilate-smart') ? INDOOR_RATIO.closed : INDOOR_RATIO.open;
}

function planCommute(profile: Profile, ids: ReadonlySet<RecId>, alt: Commute | null): Commute | null {
  if (ids.has('commute-exposure')) return safestTransit(profile.commuteKm);
  return ids.has('commute-switch') ? alt : null;
}

interface DoseInput {
  profile: Profile;
  avg: number;
  best: TimeWindow | null;
  ids: ReadonlySet<RecId>;
  alt: Commute | null;
}

/**
 * The dose "with the plan" applies exactly the plan's tips, so it never credits advice not given. A CO₂ switch
 * counts only when it also lowers the dose, so the plan never shows itself raising what you breathe.
 */
export function planDose({ profile, avg, best, ids, alt }: DoseInput): DoseEstimate {
  // The baseline is the household's own habit (its purifier, if it has one), so no tip is credited for what it
  // already does, and the plan never sends the indoor air above that habit.
  const baselineUg = dailyDoseUg(profile, avg);
  const opts: DoseOptions = {
    maskOutdoors: ids.has('n95'),
    exerciseIndoors: ids.has('exercise-indoors'),
    indoorRatio: Math.min(habitRatio(profile), homeRatio(ids)),
    ...(best && ids.has('exercise-window') ? { exercisePm25: best.avgPm25 } : {}),
  };
  let withPlanUg = dailyDoseUg(profile, avg, opts);
  const mode = planCommute(profile, ids, alt);
  if (mode) withPlanUg = Math.min(withPlanUg, dailyDoseUg(profile, avg, { ...opts, commuteMode: mode }));
  return {
    baselineUg: round(baselineUg),
    withPlanUg: round(withPlanUg),
    cutPct: pctCut(baselineUg, withPlanUg),
    people: profile.householdSize,
  };
}
