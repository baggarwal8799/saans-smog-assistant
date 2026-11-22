/**
 * Deterministic impact engine. Every number the app shows comes from here, never from the LLM,
 * so it is reproducible, unit-tested, and cannot be altered by prompt injection.
 * Factors are deliberately rounded, conservative approximations; sources are listed in README.md.
 */
import type { Commute, Profile } from './types.js';

/** kg CO2e per passenger-km (approx. UK DEFRA GHG conversion factors; auto-rickshaw is a CNG estimate). */
export const EMISSION_KG_PER_KM: Readonly<Record<Commute, number>> = {
  car: 0.17,
  motorbike: 0.11,
  auto: 0.07,
  bus: 0.1,
  metro: 0.03,
  bicycle: 0,
  walk: 0,
  wfh: 0,
};

/** Typical urban door-to-door speed, km/h, used to turn distance into time spent breathing street air. */
export const SPEED_KMH: Readonly<Record<Commute, number>> = {
  car: 25,
  motorbike: 30,
  auto: 20,
  bus: 18,
  metro: 30,
  bicycle: 12,
  walk: 5,
  wfh: 1,
};

/**
 * The longest plausible one-way commute per mode, km: beyond it the trip would take most of the day at SPEED_KMH,
 * so the dose model would be counting a commute nobody makes. Working from home has no trip to bound.
 */
export const MAX_COMMUTE_KM: Readonly<Record<Commute, number>> = {
  car: 100, motorbike: 100, auto: 50, bus: 100, metro: 100, bicycle: 30, walk: 10, wfh: 100,
};

/** Breathing rate, m³/h (approx. US EPA Exposure Factors Handbook, adults). */
export const BREATHING_M3_PER_H = { rest: 0.5, light: 1.0, moderate: 1.6, heavy: 3.0 } as const;

/** In-transit PM2.5 relative to ambient: closed cabins filter some, roadside modes add traffic exhaust. */
export const TRANSIT_EXPOSURE_RATIO: Readonly<Record<Commute, number>> = {
  car: 0.7,
  motorbike: 1.2,
  auto: 1.2,
  bus: 1.0,
  metro: 0.6,
  bicycle: 1.2,
  walk: 1.1,
  wfh: 0,
};

/** Breathing rate while travelling, m³/h: walking and cycling breathe harder than sitting in a vehicle. */
export const TRANSIT_BREATHING: Readonly<Record<Commute, number>> = {
  car: BREATHING_M3_PER_H.rest,
  motorbike: BREATHING_M3_PER_H.rest,
  auto: BREATHING_M3_PER_H.rest,
  bus: BREATHING_M3_PER_H.rest,
  metro: BREATHING_M3_PER_H.light,
  bicycle: BREATHING_M3_PER_H.moderate,
  walk: BREATHING_M3_PER_H.light,
  wfh: 0,
};

/** Assumed walk to and from the stop or station for public transport: 10 minutes each way, in street air. */
export const ACCESS_WALK_MIN_EACH_WAY = 10;
const TRANSIT: ReadonlySet<Commute> = new Set(['bus', 'metro']);
/** Hours a day spent walking to and from public transport (zero for every other mode). */
export const accessWalkHours = (mode: Commute, kmOneWay: number): number =>
  TRANSIT.has(mode) && kmOneWay > 0 ? (2 * ACCESS_WALK_MIN_EACH_WAY) / 60 : 0;

/**
 * The one indoor/outdoor PM2.5 model, used by the dose and by every tip: windows open as usual (indoor air tracks
 * outdoor), windows shut, shut with a right-sized HEPA purifier, and shut with a DIY box-fan filter. The dose
 * baseline is the household's own habit (`habitRatio`), so no tip is credited for something it already does.
 */
export const INDOOR_RATIO = { open: 0.9, closed: 0.6, purifier: 0.3, diyFilter: 0.35 } as const;
/** The indoor ratio a household already lives with: its purifier running if it has one, else windows open as usual. */
export const habitRatio = (p: Pick<Profile, 'hasPurifier'>): number => (p.hasPurifier ? INDOOR_RATIO.purifier : INDOOR_RATIO.open);
/** Indoor PM2.5 relative to outdoor with windows shut in this home: its own purifier when it runs one does better. */
export const shutRatio = (p: Pick<Profile, 'hasPurifier'>): number => Math.min(habitRatio(p), INDOOR_RATIO.closed);
/**
 * The one cut an indoor tip may claim: from `from` (the household's own habit, or 1 for someone outdoors) to its
 * shut home. Zero when the household's habit already does as well, so no tip is credited for what it already does.
 */
export const indoorCut = (p: Pick<Profile, 'hasPurifier'>, from = habitRatio(p)): number => pctCut(from, shutRatio(p));
/** Assumption: two people share a bedroom, and one purifier or box-fan filter cleans one closed room. */
export const PEOPLE_PER_ROOM = 2;

/** Indoor/outdoor ozone ratio: ozone reacts with indoor surfaces, so indoors is typically about half (Weschler 2000). */
export const INDOOR_OZONE_RATIO = 0.5;
/** Vented range hood while cooking: about 30–50% less kitchen PM2.5; the low end is used (LBNL studies). */
export const RANGE_HOOD_CUT = 0.3;
/** Damp cleaning instead of dry sweeping: an assumed 10% less indoor PM2.5, kept low because sweeping re-suspends mostly coarser dust. */
export const WET_CLEAN_CUT = 0.1;
/** Kitchen PM2.5 with LPG vs solid fuel while cooking: typically under 100 vs over 500 µg/m³, so about 80% less (WHO). */
export const CLEAN_FUEL_KITCHEN_CUT = 0.8;

/** Real-world filtration of a well-fitted N95/FFP2 (lab rating is ≥95%; fit leaks lower it). */
export const N95_REAL_WORLD_FILTRATION = 0.8;

/** Berkeley Earth: breathing 22 µg/m³ of PM2.5 for a day ≈ smoking one cigarette. */
export const PM25_PER_CIGARETTE = 22;

export const WORKDAYS_PER_MONTH = 22;

/** Wiedinmyer et al. 2014: open burning of household waste ≈ 10 g PM2.5 per kg burned. */
export const WASTE_BURNING_PM25_G_PER_KG = 10;
/**
 * Assumed waste burned per person per week where a home burns it: 0.5 kg, about a sixth of the ≈ 0.45 kg/day an
 * urban Indian resident generates (CPCB annual reports), since most still goes to collection or a dump.
 */
export const WASTE_BURNED_KG_PER_PERSON_WEEK = 0.5;
export const WEEKS_PER_MONTH = 4.3;

/** Liu et al. 2003 (Environ. Health Perspect.): one mosquito coil ≈ PM2.5 of 75–137 cigarettes. */
export const MOSQUITO_COIL_CIGARETTES = { low: 75, high: 137 } as const;

export function round(value: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function monthlyCommuteCo2Kg(mode: Commute, kmOneWay: number): number {
  return EMISSION_KG_PER_KM[mode] * kmOneWay * 2 * WORKDAYS_PER_MONTH;
}

export function commuteCo2SavingKg(from: Commute, to: Commute, kmOneWay: number): number {
  return Math.max(0, monthlyCommuteCo2Kg(from, kmOneWay) - monthlyCommuteCo2Kg(to, kmOneWay));
}

export function cigarettesEquivalent(avgPm25: number): number {
  return Math.max(0, avgPm25) / PM25_PER_CIGARETTE;
}

export function pctCut(before: number, after: number): number {
  if (before <= 0) return 0;
  return clamp(round(((before - after) / before) * 100), 0, 100);
}

export function commuteHoursPerDay(mode: Commute, kmOneWay: number): number {
  if (mode === 'wfh' || kmOneWay <= 0) return 0;
  return (kmOneWay * 2) / SPEED_KMH[mode];
}

/** PM2.5 inhaled on a day's round trip per µg/m³ of street air, the walk to any stop or station included. */
export function commuteDoseFactor(mode: Commute, kmOneWay: number, rideH = commuteHoursPerDay(mode, kmOneWay)): number {
  const walk = TRANSIT_EXPOSURE_RATIO.walk * TRANSIT_BREATHING.walk * accessWalkHours(mode, kmOneWay);
  return TRANSIT_EXPOSURE_RATIO[mode] * TRANSIT_BREATHING[mode] * rideH + walk;
}

export interface DoseOptions {
  /** Outdoor PM2.5 during exercise (e.g. the cleanest window). Defaults to the daily average. */
  exercisePm25?: number;
  exerciseIndoors?: boolean;
  maskOutdoors?: boolean;
  indoorRatio?: number;
  commuteMode?: Commute;
}

/**
 * µg of PM2.5 one person inhales in a day: commute + exercise + the rest of the day indoors.
 * dose = concentration (µg/m³) × breathing rate (m³/h) × hours. With no options it is the baseline: the household's
 * own indoor habit (`habitRatio`) and no mask.
 */
export function dailyDoseUg(profile: Profile, avgPm25: number, opts: DoseOptions = {}): number {
  const mode = opts.commuteMode ?? profile.commuteMode;
  const indoorRatio = opts.indoorRatio ?? habitRatio(profile);
  const mask = opts.maskOutdoors ? 1 - N95_REAL_WORLD_FILTRATION : 1;
  const indoorPm = avgPm25 * indoorRatio;

  const exerciseH = profile.exerciseMinutes / 60;
  // Even an implausible distance can never take more of the day than is left after exercise.
  const walkH = accessWalkHours(mode, profile.commuteKm);
  const commuteH = Math.min(commuteHoursPerDay(mode, profile.commuteKm), Math.max(0, 24 - exerciseH - walkH));
  const commuteDose = avgPm25 * commuteDoseFactor(mode, profile.commuteKm, commuteH) * mask;

  const exercisePm = opts.exerciseIndoors ? indoorPm : (opts.exercisePm25 ?? avgPm25);
  const exerciseDose = exercisePm * BREATHING_M3_PER_H.heavy * exerciseH;

  const restH = Math.max(0, 24 - commuteH - walkH - exerciseH);
  const restDose = indoorPm * BREATHING_M3_PER_H.rest * restH;

  return commuteDose + exerciseDose + restDose;
}
