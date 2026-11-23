/** Open-Meteo over HTTP behind a bounded cache, kept apart so aqi.ts stays pure and testable without a network. */
import { parseAirResponse } from './aqi.js';
import { COORD_DECIMALS, coords } from './place.js';
import { type TtlCache, ttlCache } from './ttlCache.js';
import type { AirReport, Place } from './types.js';
import { mergeWeather } from './weather.js';

export const AIR_API = 'https://air-quality-api.open-meteo.com/v1/air-quality';
export const WEATHER_API = 'https://api.open-meteo.com/v1/forecast';

/** The one Open-Meteo request builder, so the page and the assistant get the same URL, cache entry and numbers. */
export function airRequest(place: Pick<Place, 'lat' | 'lon'>): { air: string; weather: string } {
  const [latitude, longitude] = coords(place, COORD_DECIMALS.grid);
  const locationParams = { latitude, longitude, timezone: 'auto', forecast_days: '3' };
  const air = new URLSearchParams({
    ...locationParams,
    current: 'us_aqi,us_aqi_pm2_5,us_aqi_pm10,us_aqi_ozone,us_aqi_nitrogen_dioxide,pm2_5,pm10,nitrogen_dioxide,ozone',
    hourly: 'pm2_5,ozone,us_aqi',
  });
  const weather = new URLSearchParams({ ...locationParams, hourly: 'wind_speed_10m,boundary_layer_height' });
  return { air: `${AIR_API}?${air.toString()}`, weather: `${WEATHER_API}?${weather.toString()}` };
}

/** 15 minutes keeps well inside the free API's limits; the forecast itself only moves hourly. */
const AIR_CACHE_TTL_MS = 15 * 60 * 1000;
const AIR_FETCH_TIMEOUT_MS = 10_000;
/** Enough for every city a busy day brings, small enough that random coordinates cannot exhaust memory. */
export const AIR_CACHE_MAX = 500;

export type AirCache = TtlCache<AirReport>;

/** Each edge (browser, server) owns one, with the same age limit and size cap. */
export const airCache = (): AirCache => ttlCache<AirReport>(AIR_CACHE_TTL_MS, AIR_CACHE_MAX);

interface AirClientDeps {
  fetch: typeof fetch;
  cache: AirCache;
  timeoutMs?: number;
}

export interface AirClient {
  /** Throws when the air reading is unusable; a missing weather forecast only drops the smog-trap fields. */
  fetchAirReport: (place: Place) => Promise<AirReport>;
}

export function createAirClient({
  fetch: fetchImpl,
  cache,
  timeoutMs = AIR_FETCH_TIMEOUT_MS,
}: AirClientDeps): AirClient {
  const get = (url: string): Promise<Response> => fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  const fetchAirReport = async (place: Place): Promise<AirReport> => {
    const url = airRequest(place);
    const hit = cache.get(url.air);
    if (hit) return { ...hit, place };
    // Weather only adds the smog-trap insight, so a weather failure must never block the air reading.
    const [res, weather] = await Promise.all([
      get(url.air),
      get(url.weather)
        .then((r): Promise<unknown> | null => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);
    if (!res.ok) throw new Error(`Air-quality service error (${res.status})`);
    const parsed = parseAirResponse(await res.json(), place);
    const report = { ...parsed, hourly: mergeWeather(parsed.hourly, weather) };
    cache.set(url.air, report);
    return report;
  };
  return { fetchAirReport };
}
