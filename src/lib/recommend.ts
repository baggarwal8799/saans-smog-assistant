/** Rule engine: air data + household → ranked, explained tips. Pure, so it is testable and the LLM only explains it. */
import { concernLevel, planBand } from './concern.js';
import { cigarettesEquivalent, round } from './impact.js';
import { ozoneRec, ozoneWorthWarning, smogTrapRec } from './plan/alerts.js';
import { commuteExposureRec, commuteRec, suggestCommute } from './plan/commute.js';
import { communityRec } from './plan/community.js';
import { planDose } from './plan/dose.js';
import { cleaningRec, purifierRec, ventilateRec } from './plan/indoor.js';
import { demoteBeyondUrgent, protectsOnly, rankDrafts } from './plan/ranking.js';
import { exerciseRec, maskRec } from './plan/routine.js';
import { CO_CAVEAT } from './plan/shared.js';
import { MIN_EXPOSURE_CUT_PCT, localize, type RecDraft, type RuleInput } from './plan/rule.js';
import { householdActivity } from './plan/household.js';
import { isIndia, mosquitoZone } from './plan/place.js';
import { joinText } from './plan/text.js';
import { coilRec, cookingRec, heatingRec, wasteRec } from './plan/swaps.js';
import { vulnerableRec } from './plan/vulnerable.js';
import { findSmogTrap } from './weather.js';
import { averagePm25, findWindow } from './windows.js';
import type { AirReport, Concern, HourPoint, Lang, Plan, Profile, RecId, SmogTrap, TimeWindow } from './types.js';

export { homeRatio } from './plan/dose.js';
export { MAX_URGENT } from './plan/ranking.js';

/** Tips that exist because fuel burns indoors for heat: "shut the windows" advice must then keep some air coming. */
const FUEL_HEATING: ReadonlySet<RecId> = new Set<RecId>(['safe-heating', 'gas-heater-safety']);
/** Only a smoke source the household reported may back the headline "your biggest wins are indoor smoke sources". */
const reportedSource = (d: RecDraft): boolean =>
  (d.category === 'swap' || d.removesSource === true) && !d.unreported && !d.community;

type Span = Pick<TimeWindow, 'start' | 'end'>;
const inSpan = (time: string, span: Span | null): boolean => span !== null && time >= span.start && time < span.end;

/** Hours outside every warned span, so the plan never says "go out at 16:00" and "stay in from 16:00" together. */
export function hoursOutside(points: readonly HourPoint[], spans: readonly (Span | null)[]): HourPoint[] {
  // Cut to the 24 h horizon first: removing hours must not pull in hours beyond it, which were never checked.
  return points.slice(0, 24).filter((p) => !spans.some((s) => inSpan(p.time, s)));
}

/** A trap is only worth a warning when there is smoke to trap, i.e. on any day that is not clean. */
const trapWorthWarning = (trap: SmogTrap | null, concern: Concern): SmogTrap | null =>
  concern === 'low' ? null : trap;

/** Every tip must change something real. A 0% (or a 100%) "cut" is a claim, not an action, so it is dropped. */
export function hasRealImpact(d: Pick<RecDraft, 'co2KgPerMonth' | 'exposureCutPct' | 'removesSource'>): boolean {
  const pct = d.exposureCutPct;
  return (d.co2KgPerMonth ?? 0) > 0 || (pct !== undefined && pct >= 1 && pct < 100) || d.removesSource === true;
}

/**
 * A big percentage of a tiny amount is not worth asking for, and smog defence has nothing to do on a clean day.
 * Source removal and safety tips matter whatever the air.
 */
export function isMaterial(d: RecDraft, concern: Concern): boolean {
  if (!protectsOnly(d)) return true;
  if (concern === 'low' && d.smogDefence) return false;
  return (d.exposureCutPct ?? 0) >= MIN_EXPOSURE_CUT_PCT;
}

function withCoCaveat(d: RecDraft, fuelIndoors: boolean): RecDraft {
  if (!fuelIndoors || !d.shutsWindows) return d;
  return { ...d, detail: joinText(d.detail, CO_CAVEAT) };
}

/** Everything a rule may look at, worked out once from the air report and the household. */
export function ruleInput(report: AirReport, profile: Profile): RuleInput {
  const concern = concernLevel(report.current.usAqi, report.current.pm25);
  const band = planBand(report.current.usAqi, report.current.pm25);
  const dominant = report.current.dominant;
  const avg = averagePm25(report.hourly, report.current.pm25);
  // hourly[0] is the hour already under way, so windows start at the next full hour.
  const upcoming = report.hourly.slice(1);
  const trap = trapWorthWarning(findSmogTrap(upcoming), concern);
  // The "dirtiest stretch" is a PM2.5 fact, so it is picked on PM2.5 alone; ozone has its own peak and rule.
  const worst = findWindow(upcoming, 2, 'worst', (p) => p.pm25);
  const peak = dominant === 'o3' ? findWindow(upcoming, 2, 'worst', (p) => p.o3 ?? 0) : null;
  const ozonePeak = ozoneWorthWarning(peak, dominant, concern) ? peak : null;
  const india = isIndia(report.place.country);
  return {
    profile,
    concern,
    band,
    avg,
    best: findWindow(hoursOutside(upcoming, [trap, worst, ozonePeak]), 2, 'best'),
    worst,
    ozonePeak,
    trap,
    dominant,
    now: report.current.time,
    india,
    mosquitoes: india && mosquitoZone(report.place.lat),
  };
}

/** Every tip the rules give for this input, before ranking and the MAX_URGENT cut. */
export function draftsFor(input: RuleInput): RecDraft[] {
  return [
    ozoneRec(input),
    smogTrapRec(input),
    maskRec(input),
    vulnerableRec(input),
    exerciseRec(input),
    commuteRec(input),
    commuteExposureRec(input),
    purifierRec(input),
    ventilateRec(input),
    // Carbon monoxide from an indoor fire or gas heater can kill overnight, so it leads the safety items.
    heatingRec(input),
    cookingRec(input),
    wasteRec(input),
    coilRec(input),
    cleaningRec(),
    communityRec(input),
  ].filter((d): d is RecDraft => d !== null && hasRealImpact(d) && isMaterial(d, input.concern));
}

export function buildPlan(report: AirReport, profile: Profile, lang: Lang): Plan {
  const input = ruleInput(report, profile);
  const { concern, band, avg, worst, trap } = input;
  const drafts = draftsFor(input);
  const fuelIndoors = drafts.some((d) => FUEL_HEATING.has(d.id));

  // Safety items have their own group and take no "do first" slot (ranking.ts).
  const ranked = rankDrafts(drafts, concern).map((d) => localize(withCoCaveat(d, fuelIndoors), lang));
  const recommendations = demoteBeyondUrgent(ranked, concern);

  const ids = new Set(recommendations.map((r) => r.id));
  const alt = suggestCommute(profile.commuteMode, profile.commuteKm, band, profile.hasRespiratory);
  // Community figures belong to the society, not this household.
  const co2 = recommendations
    .filter((r) => !r.impact.community)
    .reduce((sum, r) => sum + (r.impact.co2KgPerMonth ?? 0), 0);

  return {
    concern,
    band,
    avoidAllOutdoors: householdActivity(input) === 'avoidAll',
    recommendations,
    bestWindow: input.best,
    worstWindow: worst,
    dose: planDose({ profile, avg, best: input.best, ids, alt }),
    co2KgPerMonthTotal: round(co2, 1),
    hasSourceFixes: drafts.some(reportedSource),
    cigarettesPerDay: round(cigarettesEquivalent(avg), 1),
    smogTrap: trap,
  };
}
