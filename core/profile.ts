import { clamp, MAX_COMMUTE_KM } from './impact.js';
import { isIndia } from './place.js';
import { COMMUTE_MODES, COOKING_FUELS, HEATING_TYPES, type Profile } from './types.js';

/** The sample household shown until people enter their own: the common set-up in India, and elsewhere. */
const SAMPLE_HOUSEHOLDS: Readonly<Record<'india' | 'elsewhere', Readonly<Profile>>> = {
  india: {
    householdSize: 4,
    hasChildren: true,
    hasElderly: false,
    hasRespiratory: false,
    commuteMode: 'car',
    commuteKm: 10,
    exerciseMinutes: 30,
    cooking: 'lpg',
    heating: 'none',
    hasPurifier: false,
    burnsWaste: false,
  },
  elsewhere: {
    householdSize: 4,
    hasChildren: true,
    hasElderly: false,
    hasRespiratory: false,
    commuteMode: 'car',
    commuteKm: 15,
    exerciseMinutes: 30,
    cooking: 'png',
    heating: 'electric',
    hasPurifier: false,
    burnsWaste: false,
  },
};

/** The household sizes the form offers and saved input is clamped to. */
export const HOUSEHOLD_SIZE_RANGE = { min: 1, max: 20 } as const;
/** The daily outdoor exercise minutes the form offers and saved input is clamped to. */
export const EXERCISE_MINUTES_RANGE = { min: 0, max: 240 } as const;

/** The fallback for any field the form or storage leaves invalid. */
export const DEFAULT_PROFILE: Readonly<Profile> = SAMPLE_HOUSEHOLDS.india;

export const sampleProfile = (country: string | undefined): Profile => ({
  ...SAMPLE_HOUSEHOLDS[isIndia(country) ? 'india' : 'elsewhere'],
});

function oneOf<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function int(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? clamp(Math.round(parsed), min, max) : fallback;
}

const bool = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);

/** Coerces untrusted input (storage, form) into a valid Profile. Unknown keys are dropped. */
export function sanitizeProfile(input: unknown): Profile {
  const fields = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const commuteMode = oneOf(COMMUTE_MODES, fields.commuteMode, DEFAULT_PROFILE.commuteMode);
  return {
    householdSize: int(
      fields.householdSize,
      HOUSEHOLD_SIZE_RANGE.min,
      HOUSEHOLD_SIZE_RANGE.max,
      DEFAULT_PROFILE.householdSize,
    ),
    hasChildren: bool(fields.hasChildren, DEFAULT_PROFILE.hasChildren),
    hasElderly: bool(fields.hasElderly, DEFAULT_PROFILE.hasElderly),
    hasRespiratory: bool(fields.hasRespiratory, DEFAULT_PROFILE.hasRespiratory),
    commuteMode,
    // Bounded per mode: a 100 km walk is not a commute, and the dose model would count it as one.
    commuteKm: int(
      fields.commuteKm,
      0,
      MAX_COMMUTE_KM[commuteMode],
      Math.min(DEFAULT_PROFILE.commuteKm, MAX_COMMUTE_KM[commuteMode]),
    ),
    exerciseMinutes: int(
      fields.exerciseMinutes,
      EXERCISE_MINUTES_RANGE.min,
      EXERCISE_MINUTES_RANGE.max,
      DEFAULT_PROFILE.exerciseMinutes,
    ),
    cooking: oneOf(COOKING_FUELS, fields.cooking, DEFAULT_PROFILE.cooking),
    heating: oneOf(HEATING_TYPES, fields.heating, DEFAULT_PROFILE.heating),
    hasPurifier: bool(fields.hasPurifier, DEFAULT_PROFILE.hasPurifier),
    burnsWaste: bool(fields.burnsWaste, DEFAULT_PROFILE.burnsWaste),
  };
}
