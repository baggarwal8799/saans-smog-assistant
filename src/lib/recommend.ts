/**
 * Rule engine: live air data + household profile → prioritised, explained recommendations.
 * Pure and deterministic, so the plan is testable and the LLM only explains it. The rules live in ./plan/.
 */
import { cautious, concernLevel, planBand } from './concern.js';
import { INDOOR_RATIO, cigarettesEquivalent, habitRatio, dailyDoseUg, pctCut, round, type DoseOptions } from './impact.js';
import { ozoneRec, ozoneWorthWarning, smogTrapRec } from './plan/alerts.js';
import { commuteExposureRec, commuteRec, safestTransit, suggestCommute } from './plan/commute.js';
import { communityRec } from './plan/community.js';
import { cleaningRec, purifierRec, ventilateRec } from './plan/indoor.js';
import { exerciseRec, maskRec } from './plan/routine.js';
import { CO_CAVEAT, L, MIN_EXPOSURE_CUT_PCT, householdActivity, isIndia, localize, mosquitoZone, type RecDraft, type RuleInput } from './plan/shared.js';
import { coilRec, cookingRec, heatingRec, wasteRec } from './plan/swaps.js';
import { vulnerableRec } from './plan/vulnerable.js';
import { findSmogTrap } from './weather.js';
import { averagePm25, findWindow } from './windows.js';
import type { AirReport, Commute, Concern, DoseEstimate, HourPoint, Lang, Plan, Profile, SmogTrap, TimeWindow } from './types.js';

/** At most this many non-safety items are "Do these first": a list where everything is urgent tells people nothing. */
export const MAX_URGENT = 3;

/** Tips that exist because fuel burns indoors for heat: "shut the windows" advice must then keep some air coming. */
const FUEL_HEATING: ReadonlySet<string> = new Set(['safe-heating', 'gas-heater-safety']);
/**
 * A smoke source the household itself reported (fuel, heating, burning). A tip about a habit the form never asks
 * about, or a community figure, cannot make the headline say "your biggest wins are indoor smoke sources".
 */
const reportedSource = (d: RecDraft): boolean => (d.category === 'swap' || d.removesSource === true) && !d.unreported && !d.community;
/** Life-safety items (carbon monoxide, heavy indoor smoke) always outrank comfort and emissions advice. */
const rank = (d: RecDraft): number => d.priority * 2 - (d.safety ? 1 : 0);
/** A tip that only protects the people breathing (a mask, staying in, timing): no CO₂, no source removed. */
const protectsOnly = (d: { co2KgPerMonth?: number | undefined; removesSource?: boolean | undefined; safety?: boolean | undefined }): boolean => !(d.co2KgPerMonth ?? 0) && !d.removesSource && !d.safety;
/**
 * Order within a priority. US EPA's core actions change who goes out or how hard (`epaActivity`) and come first;
 * EPA treats masks as a supplement. From "sensitive groups" up, other protection (smog-trap timing, the N95) comes
 * next and emissions advice last. There are at most three activity actions, so the MAX_URGENT cut can never drop
 * "move the workout indoors" or "keep them indoors": it drops a CO₂ switch, then a mask, first.
 */
const kindRank = (d: RecDraft, concern: Concern): number => (d.epaActivity ? 0 : cautious(concern) && !protectsOnly(d) ? 2 : 1);

type Span = Pick<TimeWindow, 'start' | 'end'>;
const inSpan = (time: string, span: Span | null): boolean => span !== null && time >= span.start && time < span.end;

/**
 * Hours that are safe to suggest for going out or airing the house: never inside a smog trap, the PM2.5 peak or
 * an ozone peak being warned about, so the plan cannot say "go out at 16:00" and "stay in from 16:00" together.
 */
export function hoursOutside(points: readonly HourPoint[], spans: readonly (Span | null)[]): HourPoint[] {
  // Cut to the 24 h horizon first: removing hours must not pull in hours beyond it, which were never checked.
  return points.slice(0, 24).filter((p) => !spans.some((s) => inSpan(p.time, s)));
}

/** A trap is only worth a warning when there is smoke to trap, i.e. on any day that is not clean. */
const trapWorthWarning = (trap: SmogTrap | null, concern: Concern): SmogTrap | null => (concern === 'low' ? null : trap);

/** Every tip must change something real. A 0% (or a 100%) "cut" is a claim, not an action, so it is dropped. */
export function hasRealImpact(d: Pick<RecDraft, 'co2KgPerMonth' | 'exposureCutPct' | 'removesSource'>): boolean {
  const pct = d.exposureCutPct;
  return (d.co2KgPerMonth ?? 0) > 0 || (pct !== undefined && pct >= 1 && pct < 100) || d.removesSource === true;
}

/**
 * A big percentage of a tiny amount is not worth asking for. A tip that only cuts exposure must cut at least
 * MIN_EXPOSURE_CUT_PCT, and on a clean-air day one whose only job is keeping outdoor smog out has nothing to do.
 * Source removal and safety tips matter whatever the air.
 */
export function isMaterial(d: RecDraft, concern: Concern): boolean {
  if (!protectsOnly(d)) return true;
  if (concern === 'low' && d.smogDefence) return false;
  return (d.exposureCutPct ?? 0) >= MIN_EXPOSURE_CUT_PCT;
}

function withCoCaveat(d: RecDraft, fuelIndoors: boolean): RecDraft {
  if (!fuelIndoors || !d.shutsWindows) return d;
  return { ...d, detail: L(d.detail.en + CO_CAVEAT.en, d.detail.hi + CO_CAVEAT.hi) };
}

/** The indoor ratio the plan's own tips reach: a DIY filter, else shut windows, else the open-window baseline. */
export function homeRatio(ids: ReadonlySet<string>): number {
  if (ids.has('diy-purifier')) return INDOOR_RATIO.diyFilter;
  return ids.has('smog-trap') || ids.has('ventilate-smart') ? INDOOR_RATIO.closed : INDOOR_RATIO.open;
}

/**
 * The dose "with the plan" applies exactly the tips the plan contains, so the bars can never credit advice that
 * was not given. A switch made for CO₂ (walking instead of driving) can mean breathing more on the way; it is
 * counted only when it also lowers the dose, so the plan never shows itself raising what you breathe.
 */
function planDose(profile: Profile, avg: number, best: TimeWindow | null, ids: ReadonlySet<string>, alt: Commute | null): DoseEstimate {
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
  const mode = ids.has('commute-exposure') ? safestTransit(profile.commuteKm) : ids.has('commute-switch') ? alt : null;
  if (mode) withPlanUg = Math.min(withPlanUg, dailyDoseUg(profile, avg, { ...opts, commuteMode: mode }));
  return { baselineUg: round(baselineUg), withPlanUg: round(withPlanUg), cutPct: pctCut(baselineUg, withPlanUg), people: profile.householdSize };
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

  // Stable sort keeps the authored order within a priority. Safety items have their own group and take no slot;
  // on a clean-air day nothing else is urgent.
  const slots = concern === 'low' ? 0 : MAX_URGENT;
  let urgent = 0;
  const recommendations = [...drafts]
    .sort((a, b) => rank(a) - rank(b) || kindRank(a, concern) - kindRank(b, concern))
    .map((d) => localize(withCoCaveat(d, fuelIndoors), lang))
    .map((r) => (!r.safety && r.priority === 1 && ++urgent > slots ? { ...r, priority: 2 as const } : r));

  const ids = new Set(recommendations.map((r) => r.id));
  const alt = suggestCommute(profile.commuteMode, profile.commuteKm, band, profile.hasRespiratory);
  // Community figures belong to the society, not this household.
  const co2 = recommendations.filter((r) => !r.impact.community).reduce((sum, r) => sum + (r.impact.co2KgPerMonth ?? 0), 0);

  return {
    concern,
    band,
    avoidAllOutdoors: householdActivity(input) === 'avoidAll',
    recommendations,
    bestWindow: input.best,
    worstWindow: worst,
    dose: planDose(profile, avg, input.best, ids, alt),
    co2KgPerMonthTotal: round(co2, 1),
    hasSourceFixes: drafts.some(reportedSource),
    cigarettesPerDay: round(cigarettesEquivalent(avg), 1),
    smogTrap: trap,
  };
}
