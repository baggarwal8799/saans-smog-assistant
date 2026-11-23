/** Rule engine: air data and household to ranked, explained tips. Pure, so it is testable; the LLM only explains it. */
import { concernLevel, planBand } from './concern.js';
import { joinText } from './copy/text.js';
import { cigarettesEquivalent, round } from './impact.js';
import { isIndia, mosquitoZone } from './place.js';
import { ozoneRec, ozoneWorthWarning, smogTrapRec } from './plan/alerts.js';
import { communityRec } from './plan/community.js';
import { commuteExposureRec, commuteRec, suggestCommute } from './plan/commute.js';
import { CO_CAVEAT } from './plan/copy/shared.js';
import { planDose } from './plan/dose.js';
import { householdActivity } from './plan/household.js';
import { cleaningRec, purifierRec, ventilateRec } from './plan/indoor.js';
import { demoteBeyondUrgent, protectsOnly, rankDrafts } from './plan/ranking.js';
import { exerciseRec, maskRec } from './plan/routine.js';
import { type DraftImpact, localize, MIN_EXPOSURE_CUT_PCT, type RecDraft, type RuleInput } from './plan/rule.js';
import { coilRec, cookingRec, heatingRec, wasteRec } from './plan/swaps.js';
import { vulnerableRec } from './plan/vulnerable.js';
import type { AirReport, Concern, HourPoint, Lang, Plan, Profile, RecId, SmogTrap } from './types.js';
import { findSmogTrap } from './weather.js';
import { averagePm25, findWindow, type Span, within } from './windows.js';

/** Tips that exist because fuel burns indoors for heat: "shut the windows" advice must then keep some air coming. */
const FUEL_HEATING: ReadonlySet<RecId> = new Set<RecId>(['safe-heating', 'gas-heater-safety']);
/** Only a smoke source the household reported may back the headline "your biggest wins are indoor smoke sources". */
const reportedSource = ({ category, impact, traits }: RecDraft): boolean =>
  (category === 'swap' || impact.removesSource === true) && !traits?.unreported && !impact.community;

/** Hours outside every warned span, so the plan never says "go out at 16:00" and "stay in from 16:00" together. */
export function hoursOutside(points: readonly HourPoint[], spans: readonly (Span | null)[]): HourPoint[] {
  // Cut to the 24 h horizon first: removing hours must not pull in hours beyond it, which were never checked.
  return points.slice(0, 24).filter((p) => !spans.some((s) => s !== null && within(p.time, s)));
}

/** A trap is only worth a warning when there is smoke to trap, i.e. on any day that is not clean. */
const trapWorthWarning = (trap: SmogTrap | null, concern: Concern): SmogTrap | null =>
  concern === 'low' ? null : trap;

/** Every tip must change something real. A 0% (or a 100%) "cut" is a claim, not an action, so it is dropped. */
function hasRealImpact({ co2KgPerMonth, exposureCutPct: pct, removesSource }: DraftImpact): boolean {
  return (co2KgPerMonth ?? 0) > 0 || (pct !== undefined && pct >= 1 && pct < 100) || removesSource === true;
}

/** A big percentage of a tiny amount is not worth asking for; source removal and safety matter whatever the air. */
export function isMaterial(draft: RecDraft, concern: Concern): boolean {
  if (!protectsOnly(draft)) return true;
  if (concern === 'low' && draft.traits?.smogDefence) return false;
  return (draft.impact.exposureCutPct ?? 0) >= MIN_EXPOSURE_CUT_PCT;
}

function withCoCaveat(draft: RecDraft, { fuelIndoors }: { fuelIndoors: boolean }): RecDraft {
  if (!fuelIndoors || !draft.traits?.shutsWindows) return draft;
  return { ...draft, detail: joinText([draft.detail, CO_CAVEAT]) };
}

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
  ].filter((d): d is RecDraft => d !== null && hasRealImpact(d.impact) && isMaterial(d, input.concern));
}

export function buildPlan(report: AirReport, profile: Profile, lang: Lang): Plan {
  const input = ruleInput(report, profile);
  const { concern, band, avg, worst, trap } = input;
  const drafts = draftsFor(input);
  const fuelIndoors = drafts.some((d) => FUEL_HEATING.has(d.id));

  const ranked = rankDrafts(drafts, concern).map((d) => localize(withCoCaveat(d, { fuelIndoors }), lang));
  const recommendations = demoteBeyondUrgent(ranked, concern);

  const ids = new Set(recommendations.map((r) => r.id));
  const alt = suggestCommute(profile.commuteMode, profile.commuteKm, band, { sensitive: profile.hasRespiratory });
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
