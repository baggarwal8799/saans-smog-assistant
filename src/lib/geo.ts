import type { Place } from './types.js';

export const GEO_API = 'https://geocoding-api.open-meteo.com/v1/search';
/** Free, keyless, browser-side reverse geocoding (Open-Meteo has none). Receives ~1 km-rounded coordinates only. */
export const REVERSE_API = 'https://api.bigdatacloud.net/data/reverse-geocode-client';
const MAX_QUERY = 80;

/** Trims, collapses whitespace and strips characters that never appear in place names. */
export function sanitizePlaceQuery(input: string): string {
  return input
    .replace(/[^\p{L}\p{M}\p{N}\s,.'-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY);
}

export async function searchPlaces(query: string, lang: string, fetchImpl: typeof fetch = fetch): Promise<Place[]> {
  const name = sanitizePlaceQuery(query);
  if (name.length < 2) return [];
  const params = new URLSearchParams({ name, count: '5', language: lang, format: 'json' });
  const res = await fetchImpl(`${GEO_API}?${params.toString()}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Place search failed (${res.status})`);
  const data = (await res.json()) as { results?: unknown };
  if (!Array.isArray(data.results)) return [];
  return data.results.flatMap((r: unknown): Place[] => {
    if (typeof r !== 'object' || r === null) return [];
    const o = r as Record<string, unknown>;
    if (typeof o.name !== 'string' || typeof o.latitude !== 'number' || typeof o.longitude !== 'number') return [];
    const place: Place = { name: o.name, lat: o.latitude, lon: o.longitude };
    if (typeof o.admin1 === 'string') place.region = o.admin1;
    if (typeof o.country === 'string') place.country = o.country;
    return [place];
  });
}

export function placeLabel(place: Place): string {
  return [place.name, place.region, place.country].filter(Boolean).join(', ');
}

/** "28.61° N, 77.21° E": shown when a position has no place name. */
export function coordsLabel(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;
}

/** Turns coordinates into "Lucknow, Uttar Pradesh, India"; null when the service has no answer. */
export async function reverseGeocode(lat: number, lon: number, lang: string, fetchImpl: typeof fetch = fetch): Promise<Place | null> {
  const params = new URLSearchParams({ latitude: lat.toFixed(2), longitude: lon.toFixed(2), localityLanguage: lang });
  const res = await fetchImpl(`${REVERSE_API}?${params.toString()}`, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) return null;
  const d = (await res.json()) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : undefined);
  const name = text(d.city) ?? text(d.locality);
  if (!name) return null;
  const place: Place = { name, lat, lon };
  const region = text(d.principalSubdivision);
  const country = text(d.countryName);
  if (region && region !== name) place.region = region;
  if (country) place.country = country;
  return place;
}

export function currentPosition(label: string, geo: Geolocation | undefined = globalThis.navigator?.geolocation): Promise<Place> {
  return new Promise((resolve, reject) => {
    if (!geo) {
      reject(new Error('Geolocation is not supported'));
      return;
    }
    geo.getCurrentPosition(
      (pos) =>
        resolve({
          name: label,
          // ~1 km precision is enough for air quality and avoids keeping an exact address.
          lat: Math.round(pos.coords.latitude * 100) / 100,
          lon: Math.round(pos.coords.longitude * 100) / 100,
        }),
      (err) => reject(new Error(err.message || 'Location permission denied')),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  });
}
