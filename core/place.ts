/**
 * Where the household is: reading a place from untrusted JSON, keying it by its coordinates, naming it, and whether
 * India-specific wording or coil advice applies there.
 */
import { LIMITS } from './contract.js';
import type { Text } from './copy/text.js';
import { isRecord } from './parse.js';
import type { Place } from './types.js';

const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');
// Written so NaN and Infinity fail too: a bad coordinate must not pass as a place.
const within = (value: unknown, limit: number): value is number =>
  typeof value === 'number' && Math.abs(value) <= limit;

/**
 * A place with a name and real coordinates, or null. Text is trimmed and capped at the API's own limits, so whatever
 * the browser stores or sends, the server accepts; empty parts are left out.
 */
export function toPlace(raw: unknown): Place | null {
  if (!isRecord(raw)) return null;
  const name = text(raw.name, LIMITS.shortText);
  if (!name || !within(raw.lat, 90) || !within(raw.lon, 180)) return null;
  const place: Place = { name, lat: raw.lat, lon: raw.lon };
  const region = text(raw.region, LIMITS.placePart);
  const country = text(raw.country, LIMITS.placePart);
  if (region) place.region = region;
  if (country) place.country = country;
  return place;
}

/** Decimal places of each coordinate key. */
export const COORD_DECIMALS = {
  /** ~1 km, Open-Meteo's grid: the air request URL (also its cache key) and the assistant's answer cache. */
  grid: 2,
  /** ~100 m: the page explains the plan on its own once per place picked. */
  summary: 3,
} as const;

type Coords = Pick<Place, 'lat' | 'lon'>;

/** Latitude and longitude as text, rounded to `decimals`, or exactly as given when it is left out. */
export const coords = ({ lat, lon }: Coords, decimals?: number): readonly [string, string] =>
  decimals === undefined ? [String(lat), String(lon)] : [lat.toFixed(decimals), lon.toFixed(decimals)];

/** "28.61,77.21": one key per position at that precision. */
export const placeKey = (place: Coords, decimals?: number): string => coords(place, decimals).join(',');

/** "Patna, Bihar, India", leaving out the parts the geocoder did not return. */
export function placeLabel(place: Place): string {
  return [place.name, place.region, place.country].filter(Boolean).join(', ');
}

/** Country names as the geocoders return them, in English and Hindi. */
const INDIA_NAMES: ReadonlySet<string> = new Set(['India', 'भारत']);
export const isIndia = (country: string | undefined): boolean => country !== undefined && INDIA_NAMES.has(country);

/** Picks the India-specific or the general wording of a line, for a household `india` or elsewhere. */
export const local = ({ india }: { india: boolean }, inIndia: Text, elsewhere: Text): Text =>
  india ? inIndia : elsewhere;

/** Mosquitoes, and so coils, are plausible up to roughly the subtropics: |latitude| ≤ 35°. */
export const MOSQUITO_MAX_ABS_LAT = 35;
export const mosquitoZone = (lat: number): boolean => Math.abs(lat) <= MOSQUITO_MAX_ABS_LAT;
