/** Where the household is: India-specific wording, and whether mosquito coils are a plausible habit. */
import type { Text } from './text.js';

/** Picks the India-specific or the general wording of a line. */
export const local = (india: boolean, inIndia: Text, elsewhere: Text): Text => (india ? inIndia : elsewhere);

/** Mosquitoes, and so coils, are plausible up to roughly the subtropics: |latitude| ≤ 35°. */
export const MOSQUITO_MAX_ABS_LAT = 35;
export const mosquitoZone = (lat: number): boolean => Math.abs(lat) <= MOSQUITO_MAX_ABS_LAT;

/** Country names as the geocoders return them, in English and Hindi. */
const INDIA_NAMES: ReadonlySet<string> = new Set(['India', 'भारत']);
export const isIndia = (country: string | undefined): boolean => country !== undefined && INDIA_NAMES.has(country);
