import { MAX_COMMUTE_KM, clamp } from './impact.js';
import { isIndia } from './plan/place.js';
import { COMMUTE_MODES, COOKING_FUELS, HEATING_TYPES, type Lang, type Place, type Profile } from './types.js';

export const PROFILE_KEY = 'saans.profile.v1';
export const PLACE_KEY = 'saans.place.v1';
export const LANG_KEY = 'saans.lang';

/**
 * The sample household shown until people enter their own, one row per kind of place. India: an LPG cylinder and a
 * 10 km drive. Elsewhere: piped gas and electric heat, the common set-up in North American and European cities.
 */
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

/** The fallback for any field the form or storage leaves invalid. */
export const DEFAULT_PROFILE: Readonly<Profile> = SAMPLE_HOUSEHOLDS.india;

/** The sample household for a place's country (as the geocoder names it). */
export const sampleProfile = (country: string | undefined): Profile => ({
  ...SAMPLE_HOUSEHOLDS[isIndia(country) ? 'india' : 'elsewhere'],
});

function oneOf<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function int(value: unknown, min: number, max: number, fallback: number): number {
  const v = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(v) ? clamp(Math.round(v), min, max) : fallback;
}

const bool = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);

/** Coerces untrusted input (storage, form) into a valid Profile. Unknown keys are dropped. */
export function sanitizeProfile(input: unknown): Profile {
  const o = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const d = DEFAULT_PROFILE;
  const commuteMode = oneOf(COMMUTE_MODES, o.commuteMode, d.commuteMode);
  return {
    householdSize: int(o.householdSize, 1, 20, d.householdSize),
    hasChildren: bool(o.hasChildren, d.hasChildren),
    hasElderly: bool(o.hasElderly, d.hasElderly),
    hasRespiratory: bool(o.hasRespiratory, d.hasRespiratory),
    commuteMode,
    // Bounded per mode: a 100 km walk is not a commute, and the dose model would count it as one.
    commuteKm: int(o.commuteKm, 0, MAX_COMMUTE_KM[commuteMode], Math.min(d.commuteKm, MAX_COMMUTE_KM[commuteMode])),
    exerciseMinutes: int(o.exerciseMinutes, 0, 240, d.exerciseMinutes),
    cooking: oneOf(COOKING_FUELS, o.cooking, d.cooking),
    heating: oneOf(HEATING_TYPES, o.heating, d.heating),
    hasPurifier: bool(o.hasPurifier, d.hasPurifier),
    burnsWaste: bool(o.burnsWaste, d.burnsWaste),
  };
}

/**
 * The storage to use, read inside each caller's try: `localStorage` can be missing (Node) or throw on access
 * (blocked cookies), and either way the caller's catch falls back.
 */
const store = (storage: Storage | undefined): Storage => storage ?? globalThis.localStorage;

/** The browser's language when there is one: Node 20 has no `navigator`, and some browsers no `language`. */
function browserLang(): Lang {
  try {
    return navigator.language.startsWith('hi') ? 'hi' : 'en';
  } catch {
    return 'en';
  }
}

/** Storage can be missing or throw (private mode, blocked cookies); the app must work regardless. */
export function loadProfile(storage?: Storage): Profile {
  try {
    const raw = store(storage).getItem(PROFILE_KEY);
    return raw ? sanitizeProfile(JSON.parse(raw)) : { ...DEFAULT_PROFILE };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

/** True once the person has saved their own household; until then the plan is built on the sample one. */
export function hasSavedProfile(storage?: Storage): boolean {
  try {
    return store(storage).getItem(PROFILE_KEY) !== null;
  } catch {
    return false;
  }
}

export function saveProfile(profile: Profile, storage?: Storage): void {
  try {
    store(storage).setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    /* non-essential convenience */
  }
}

// Written so NaN fails the check: Number() of a bad stored value must not pass as a coordinate.
const withinAbs = (v: number, limit: number): boolean => Math.abs(v) <= limit;

export function loadPlace(storage?: Storage): Place | null {
  try {
    const raw = store(storage).getItem(PLACE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Record<string, unknown>;
    const lat = Number(o.lat);
    const lon = Number(o.lon);
    if (typeof o.name !== 'string' || !withinAbs(lat, 90) || !withinAbs(lon, 180)) return null;
    const place: Place = { name: o.name.slice(0, 80), lat, lon };
    if (typeof o.region === 'string') place.region = o.region.slice(0, 80);
    if (typeof o.country === 'string') place.country = o.country.slice(0, 80);
    return place;
  } catch {
    return null;
  }
}

export function savePlace(place: Place, storage?: Storage): void {
  try {
    store(storage).setItem(PLACE_KEY, JSON.stringify(place));
  } catch {
    /* non-essential convenience */
  }
}

export function loadLang(storage?: Storage): Lang {
  try {
    const v = store(storage).getItem(LANG_KEY);
    if (v === 'hi' || v === 'en') return v;
  } catch {
    /* fall through */
  }
  return browserLang();
}

export function saveLang(lang: Lang, storage?: Storage): void {
  try {
    store(storage).setItem(LANG_KEY, lang);
  } catch {
    /* non-essential convenience */
  }
}
