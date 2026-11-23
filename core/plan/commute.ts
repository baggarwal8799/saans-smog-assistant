/** Commute tips: an emissions-driven switch to a cleaner mode, or an exposure-driven one for walkers and cyclists. */
import { activeTravelOk, cautious } from '../concern.js';
import { joinText, type Text } from '../copy/text.js';
import type { Person } from '../epa.js';
import { fmt } from '../figures.js';
import {
  ACCESS_WALK_MIN_EACH_WAY,
  commuteCo2SavingKg,
  commuteDoseFactor,
  commuteHoursPerDay,
  EMISSION_KG_PER_KM,
  pctCut,
  round,
  TRANSIT_BREATHING,
  TRANSIT_EXPOSURE_RATIO,
  WORKDAYS_PER_MONTH,
} from '../impact.js';
import type { AqiLevel, Commute } from '../types.js';
import {
  accessWalk,
  carpool,
  COMMUTE_SCOPE,
  exposureDetail,
  exposureTitle,
  exposureWorking,
  howActive,
  type Leg,
  maskWalk,
  stayHomeNote,
  SWITCH_DETAIL,
  switchTitle,
  switchWorking,
  takeTransit,
} from './copy/commute.js';
import { selfActivity } from './household.js';
import { exposureCut, type RecDraft, type RuleInput } from './rule.js';

export const monthlyCommuteKm = (kmOneWay: number): number => kmOneWay * 2 * WORKDAYS_PER_MONTH;

/** A switch must cut the trip's emissions by at least this share to be worth suggesting. */
const MEANINGFUL_CUT = 0.25;
const ACTIVE: ReadonlySet<Commute> = new Set(['walk', 'bicycle']);

/**
 * A cleaner mode for the trip, or null: the bus first, the metro only where the bus is not clearly cleaner (an auto
 * emits less per km than a bus), walking and cycling only where the EPA guide puts no limit on exertion.
 */
export function suggestCommute(
  current: Commute,
  kmOneWay: number,
  band: AqiLevel,
  who: Person = { sensitive: false },
): Commute | null {
  if (current === 'wfh' || kmOneWay <= 0 || EMISSION_KG_PER_KM[current] === 0) return null;
  const options: Commute[] = ['bus', 'metro'];
  return (
    activeMode(kmOneWay, band, who) ??
    options.find((m) => EMISSION_KG_PER_KM[m] <= EMISSION_KG_PER_KM[current] * (1 - MEANINGFUL_CUT)) ??
    null
  );
}

/** Walking up to 3 km and cycling up to 8 km, where the EPA guide puts no limit on this person's exertion. */
function activeMode(kmOneWay: number, band: AqiLevel, who: Person): Commute | null {
  if (!activeTravelOk(band, who)) return null;
  if (kmOneWay <= 3) return 'walk';
  return kmOneWay <= 8 ? 'bicycle' : null;
}

/** Where the EPA guide says to avoid all physical activity outdoors, a trip not made is the first advice. */
const stayHome = (input: RuleInput): Text => stayHomeNote({ avoidAll: selfActivity(input) === 'avoidAll' });

export function commuteRec(input: RuleInput): RecDraft | null {
  const { profile, concern, band } = input;
  const alt = suggestCommute(profile.commuteMode, profile.commuteKm, band, { sensitive: profile.hasRespiratory });
  if (!alt) return null;
  // The chip and the working show the same rounded figure.
  const savedKg = round(commuteCo2SavingKg(profile.commuteMode, alt, profile.commuteKm), 1);
  if (savedKg <= 0) return null;
  // Carpooling is the drivers' fallback, so it lives inside this tip instead of competing as a bigger number.
  const fallback = carpool({ driver: profile.commuteMode === 'car' });
  const transit = alt === 'bus' || alt === 'metro';
  const detail = SWITCH_DETAIL[transit ? alt : 'active'];
  const mask = maskWalk({ maskDay: transit && cautious(concern) });
  const home = stayHome(input);
  const maths = {
    monthKm: fmt(monthlyCommuteKm(profile.commuteKm)),
    fromEf: EMISSION_KG_PER_KM[profile.commuteMode],
    toEf: EMISSION_KG_PER_KM[alt],
    savedKg,
    metroEf: alt === 'bus' ? EMISSION_KG_PER_KM.metro : null,
  };
  return {
    id: 'commute-switch',
    category: 'routine',
    priority: 1,
    title: switchTitle(profile.commuteMode, alt),
    detail: joinText([detail, mask, fallback, home]),
    explanation: switchWorking(maths),
    impact: { co2KgPerMonth: savedKg },
  };
}

export const safestTransit = (tripKm: number): Commute =>
  commuteDoseFactor('metro', tripKm) <= commuteDoseFactor('bus', tripKm) ? 'metro' : 'bus';

/** Exposure-driven: walkers and cyclists emit nothing, but their deep roadside breathing is the problem. */
export function commuteExposureRec(input: RuleInput): RecDraft | null {
  const { profile, band } = input;
  const mode = profile.commuteMode;
  if (!ACTIVE.has(mode) || profile.commuteKm <= 0 || activeTravelOk(band, { sensitive: profile.hasRespiratory }))
    return null;
  const home = stayHome(input);
  const alt = safestTransit(profile.commuteKm);
  const before = commuteDoseFactor(mode, profile.commuteKm);
  const after = commuteDoseFactor(alt, profile.commuteKm);
  const cut = pctCut(before, after);
  const how = howActive({ walk: mode === 'walk' });
  const take = takeTransit({ metro: alt === 'metro' });
  const leg = (legMode: Commute): Leg => ({
    ratio: TRANSIT_EXPOSURE_RATIO[legMode],
    rate: TRANSIT_BREATHING[legMode],
    hours: fmt(commuteHoursPerDay(legMode, profile.commuteKm), 1),
  });
  const currentLeg = leg(mode);
  const transitLeg = leg(alt);
  const walkLeg = leg('walk');
  const walk = accessWalk(ACCESS_WALK_MIN_EACH_WAY, walkLeg);
  return {
    id: 'commute-exposure',
    category: 'routine',
    priority: 1,
    title: exposureTitle(alt, how),
    detail: exposureDetail(how, take, home),
    explanation: exposureWorking({ alt, currentLeg, altLeg: transitLeg, walk, cut }),
    impact: exposureCut(cut, COMMUTE_SCOPE),
    traits: { smogDefence: true },
  };
}
