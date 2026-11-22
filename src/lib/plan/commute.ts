/** Commute tips: an emissions-driven switch to a cleaner mode, or an exposure-driven one for walkers and cyclists. */
import {
  ACCESS_WALK_MIN_EACH_WAY,
  EMISSION_KG_PER_KM,
  TRANSIT_BREATHING,
  TRANSIT_EXPOSURE_RATIO,
  WORKDAYS_PER_MONTH,
  commuteCo2SavingKg,
  commuteDoseFactor,
  commuteHoursPerDay,
  pctCut,
  round,
} from '../impact.js';
import type { AqiLevel } from '../aqi.js';
import { activeTravelOk, cautious } from '../concern.js';
import type { Commute } from '../types.js';
import { joinText, type Text } from './text.js';
import { num } from './format.js';
import { selfActivity } from './household.js';
import type { RecDraft, RuleInput } from './rule.js';
import {
  COMMUTE_SCOPE,
  SWITCH_DETAIL,
  accessWalk,
  carpool,
  exposureDetail,
  exposureTitle,
  exposureWorking,
  howActive,
  maskWalk,
  stayHomeNote,
  switchTitle,
  switchWorking,
  takeTransit,
  type Leg,
} from './copy/commute.js';

/** A switch must cut the trip's emissions by at least this share to be worth suggesting. */
/** Kilometres a month for a one-way route driven there and back on every workday. */
export const monthlyCommuteKm = (kmOneWay: number): number => kmOneWay * 2 * WORKDAYS_PER_MONTH;

const MEANINGFUL_CUT = 0.25;
const ACTIVE: ReadonlySet<Commute> = new Set(['walk', 'bicycle']);

/**
 * Which cleaner mode to suggest for a trip, or null when nothing is clearly cleaner. Never suggests a mode that
 * emits more. The bus, which runs almost everywhere, comes first; the metro only where the bus is not clearly cleaner
 * (an auto-rickshaw emits less per km than a bus). Walking and cycling only where the EPA guide (for this band and
 * person) puts no limit on exertion.
 */
export function suggestCommute(current: Commute, kmOneWay: number, band: AqiLevel, sensitive = false): Commute | null {
  const ef = EMISSION_KG_PER_KM;
  if (current === 'wfh' || kmOneWay <= 0 || ef[current] === 0) return null;
  const activeOk = activeTravelOk(band, sensitive);
  if (kmOneWay <= 3 && activeOk) return 'walk';
  if (kmOneWay <= 8 && activeOk) return 'bicycle';
  const options: Commute[] = ['bus', 'metro'];
  return options.find((m) => ef[m] <= ef[current] * (1 - MEANINGFUL_CUT)) ?? null;
}

/** Where the EPA guide says to avoid all physical activity outdoors, a trip not made is the first advice. */
const stayHome = (input: RuleInput): Text => stayHomeNote(selfActivity(input) === 'avoidAll');

/** Emissions-driven: a cleaner mode for a vehicle commute. */
export function commuteRec(input: RuleInput): RecDraft | null {
  const { profile: p, concern, band } = input;
  const alt = suggestCommute(p.commuteMode, p.commuteKm, band, p.hasRespiratory);
  if (!alt) return null;
  // The chip and the working show the same rounded figure.
  const kg = round(commuteCo2SavingKg(p.commuteMode, alt, p.commuteKm), 1);
  if (kg <= 0) return null;
  const ef = EMISSION_KG_PER_KM;
  // Carpooling is the drivers' fallback, so it lives inside this tip instead of competing as a bigger number.
  const fallback = carpool(p.commuteMode === 'car');
  const transit = alt === 'bus' || alt === 'metro';
  const detail = SWITCH_DETAIL[transit ? alt : 'active'];
  const mask = maskWalk(transit && cautious(concern));
  const home = stayHome(input);
  const maths = {
    km: num(monthlyCommuteKm(p.commuteKm)),
    fromEf: ef[p.commuteMode],
    toEf: ef[alt],
    kg,
    metroEf: alt === 'bus' ? ef.metro : null,
  };
  return {
    id: 'commute-switch',
    category: 'routine',
    priority: 1,
    title: switchTitle(p.commuteMode, alt),
    detail: joinText(detail, mask, fallback, home),
    explanation: switchWorking(maths),
    co2KgPerMonth: kg,
  };
}

/** The public-transport mode that puts the least street PM2.5 in your lungs over this trip. */
export const safestTransit = (km: number): Commute =>
  commuteDoseFactor('metro', km) <= commuteDoseFactor('bus', km) ? 'metro' : 'bus';

/**
 * Exposure-driven: walkers and cyclists already emit nothing, but above the active-travel limit their deep
 * breathing at the roadside is the problem, so the metro (or bus) on bad days protects their lungs.
 */
export function commuteExposureRec(input: RuleInput): RecDraft | null {
  const { profile: p, band } = input;
  const mode = p.commuteMode;
  if (!ACTIVE.has(mode) || p.commuteKm <= 0 || activeTravelOk(band, p.hasRespiratory)) return null;
  const home = stayHome(input);
  const alt = safestTransit(p.commuteKm);
  const before = commuteDoseFactor(mode, p.commuteKm);
  const after = commuteDoseFactor(alt, p.commuteKm);
  const cut = pctCut(before, after);
  const how = howActive(mode === 'walk');
  const take = takeTransit(alt === 'metro');
  const leg = (m: Commute): Leg => ({
    ratio: TRANSIT_EXPOSURE_RATIO[m],
    rate: TRANSIT_BREATHING[m],
    hours: num(commuteHoursPerDay(m, p.commuteKm), 1),
  });
  const a = leg(mode);
  const b = leg(alt);
  const w = leg('walk');
  const walk = accessWalk(ACCESS_WALK_MIN_EACH_WAY, w);
  return {
    id: 'commute-exposure',
    category: 'routine',
    priority: 1,
    title: exposureTitle(alt, how),
    detail: exposureDetail(how, take, home),
    explanation: exposureWorking({ alt, a, b, walk, cut }),
    exposureCutPct: cut,
    scope: COMMUTE_SCOPE,
    smogDefence: true,
  };
}
