import { isRecord } from '../../core/parse.js';
import { toPlace } from '../../core/place.js';
import type { Lang, Place } from '../../core/types.js';

export const GEO_API = 'https://geocoding-api.open-meteo.com/v1/search';
/** Free, keyless, browser-side reverse geocoding (Open-Meteo has none). Receives ~1 km-rounded coordinates only. */
export const REVERSE_API = 'https://api.bigdatacloud.net/data/reverse-geocode-client';
export const MAX_QUERY = 80;
const SEARCH_TIMEOUT_MS = 8000;
const REVERSE_TIMEOUT_MS = 6000;

export function sanitizePlaceQuery(input: string): string {
  return input
    .replace(/[^\p{L}\p{M}\p{N}\s,.'-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY);
}

export async function searchPlaces(query: string, lang: Lang, fetchImpl: typeof fetch = fetch): Promise<Place[]> {
  const name = sanitizePlaceQuery(query);
  if (name.length < 2) return [];
  const params = new URLSearchParams({ name, count: '5', language: lang, format: 'json' });
  const res = await fetchImpl(`${GEO_API}?${params.toString()}`, { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Place search failed (${res.status})`);
  const data: unknown = await res.json();
  if (!isRecord(data)) throw new Error('Place search returned no object');
  if (!Array.isArray(data.results)) return [];
  return data.results.flatMap((o: unknown): Place[] => {
    if (!isRecord(o)) return [];
    const place = toPlace({ name: o.name, lat: o.latitude, lon: o.longitude, region: o.admin1, country: o.country });
    return place ? [place] : [];
  });
}

export function coordsLabel(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;
}

export async function reverseGeocode(
  lat: number,
  lon: number,
  lang: Lang,
  fetchImpl: typeof fetch = fetch,
): Promise<Place | null> {
  const params = new URLSearchParams({ latitude: lat.toFixed(2), longitude: lon.toFixed(2), localityLanguage: lang });
  const res = await fetchImpl(`${REVERSE_API}?${params.toString()}`, {
    signal: AbortSignal.timeout(REVERSE_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const d: unknown = await res.json();
  return isRecord(d) ? namedPlace(d, lat, lon) : null;
}

const filled = (v: unknown): boolean => typeof v === 'string' && v.trim() !== '';

/**
 * A region that only repeats the name is left out, so the label never reads "Delhi, Delhi". It is compared after
 * toPlace has trimmed both, so "Delhi " still counts as a repeat.
 */
function namedPlace(d: Record<string, unknown>, lat: number, lon: number): Place | null {
  const name = filled(d.city) ? d.city : d.locality;
  const place = toPlace({ name, lat, lon, region: d.principalSubdivision, country: d.countryName });
  const repeatsName = place?.region !== undefined && place.region === place.name;
  return repeatsName ? toPlace({ name, lat, lon, country: d.countryName }) : place;
}

/** The browser's geolocation, if any: Node has no `navigator`, and jsdom's has no `geolocation`. */
function browserGeolocation(): Geolocation | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.geolocation;
}

export function currentPosition(geolocation?: Geolocation): Promise<Place> {
  const geo = geolocation ?? browserGeolocation();
  return new Promise((resolve, reject) => {
    if (!geo) {
      reject(new Error('Geolocation is not supported'));
      return;
    }
    geo.getCurrentPosition(
      (pos) =>
        resolve({
          name: '',
          // ~1 km precision is enough for air quality and avoids keeping an exact address.
          lat: Math.round(pos.coords.latitude * 100) / 100,
          lon: Math.round(pos.coords.longitude * 100) / 100,
        }),
      (err) => reject(new Error(err.message || 'Location permission denied')),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  });
}
