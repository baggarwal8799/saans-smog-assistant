import type { AirReport, HourPoint, Place, Pollutant } from './types.js';
import { mergeWeather } from './weather.js';

export const AIR_API = 'https://air-quality-api.open-meteo.com/v1/air-quality';
export const WEATHER_API = 'https://api.open-meteo.com/v1/forecast';

const CACHE_TTL_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

export type AqiLevel = 'good' | 'moderate' | 'sensitive' | 'unhealthy' | 'veryUnhealthy' | 'hazardous';

/** US EPA AQI breakpoints (the scale Open-Meteo reports). */
export function aqiLevel(usAqi: number): AqiLevel {
  if (usAqi <= 50) return 'good';
  if (usAqi <= 100) return 'moderate';
  if (usAqi <= 150) return 'sensitive';
  if (usAqi <= 200) return 'unhealthy';
  if (usAqi <= 300) return 'veryUnhealthy';
  return 'hazardous';
}

/** Health band for a single hour's PM2.5 concentration (US EPA 2024 PM2.5 breakpoints, µg/m³). */
export function pm25Level(pm25: number): AqiLevel {
  if (pm25 <= 9) return 'good';
  if (pm25 <= 35.4) return 'moderate';
  if (pm25 <= 55.4) return 'sensitive';
  if (pm25 <= 125.4) return 'unhealthy';
  if (pm25 <= 225.4) return 'veryUnhealthy';
  return 'hazardous';
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;
}

const SUB_INDEX: Readonly<Record<Pollutant, string>> = {
  pm25: 'us_aqi_pm2_5',
  pm10: 'us_aqi_pm10',
  o3: 'us_aqi_ozone',
  no2: 'us_aqi_nitrogen_dioxide',
};

/** The pollutant whose US AQI sub-index is highest, which is the one the headline AQI reports. */
export function dominantPollutant(current: Record<string, unknown>): Pollutant | null {
  let best: Pollutant | null = null;
  let bestValue = -1;
  for (const [pollutant, field] of Object.entries(SUB_INDEX) as [Pollutant, string][]) {
    const v = num(current[field]);
    if (!Number.isNaN(v) && v > bestValue) {
      best = pollutant;
      bestValue = v;
    }
  }
  return best;
}

/** Validates and normalises the Open-Meteo response; throws on anything unusable. */
export function parseAirResponse(raw: unknown, place: Place): AirReport {
  if (typeof raw !== 'object' || raw === null) throw new Error('Invalid air-quality response');
  const data = raw as {
    timezone?: unknown;
    current?: Record<string, unknown>;
    hourly?: { time?: unknown; pm2_5?: unknown; us_aqi?: unknown; ozone?: unknown };
  };
  const c = data.current;
  if (!c || typeof c.time !== 'string') throw new Error('Missing current air quality');

  const current = {
    time: c.time,
    usAqi: num(c.us_aqi),
    pm25: num(c.pm2_5),
    pm10: num(c.pm10),
    no2: num(c.nitrogen_dioxide),
    o3: num(c.ozone),
    dominant: dominantPollutant(c),
  };
  if (Number.isNaN(current.usAqi) || Number.isNaN(current.pm25)) throw new Error('Air quality unavailable for this place');

  const times = Array.isArray(data.hourly?.time) ? (data.hourly.time as unknown[]) : [];
  const pm = Array.isArray(data.hourly?.pm2_5) ? (data.hourly.pm2_5 as unknown[]) : [];
  const aqi = Array.isArray(data.hourly?.us_aqi) ? (data.hourly.us_aqi as unknown[]) : [];
  const ozone = Array.isArray(data.hourly?.ozone) ? (data.hourly.ozone as unknown[]) : [];
  const currentHour = current.time.slice(0, 13);

  const hourly: HourPoint[] = [];
  times.forEach((t, i) => {
    const p = num(pm[i]);
    const a = num(aqi[i]);
    if (typeof t === 'string' && t.slice(0, 13) >= currentHour && !Number.isNaN(p) && !Number.isNaN(a)) {
      const o = num(ozone[i]);
      hourly.push(Number.isNaN(o) ? { time: t, pm25: p, usAqi: a } : { time: t, pm25: p, usAqi: a, o3: o });
    }
  });

  return {
    place,
    timezone: typeof data.timezone === 'string' ? data.timezone : 'auto',
    current,
    hourly,
  };
}

interface CacheEntry {
  at: number;
  report: AirReport;
}
const cache = new Map<string, CacheEntry>();
/** Enough for every city a busy day brings, small enough that random coordinates cannot exhaust memory. */
export const AIR_CACHE_MAX = 500;

function remember(key: string, report: AirReport, now: number): void {
  for (const [k, v] of cache) if (now - v.at >= CACHE_TTL_MS) cache.delete(k);
  cache.delete(key);
  cache.set(key, { at: now, report });
  while (cache.size > AIR_CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export const airCacheSize = (): number => cache.size;

export function clearAirCache(): void {
  cache.clear();
}

/**
 * The Open-Meteo request for a place, the one builder the browser and the server both use. Coordinates are rounded
 * once, to the ~1 km grid the cache keys on, so the same place always means the same URL, the same cache entry and
 * the same numbers on the page and in the assistant's answer.
 */
export function airRequest(place: Pick<Place, 'lat' | 'lon'>): { air: string; weather: string } {
  const at = { latitude: place.lat.toFixed(2), longitude: place.lon.toFixed(2), timezone: 'auto', forecast_days: '3' };
  const air = new URLSearchParams({
    ...at,
    current: 'us_aqi,us_aqi_pm2_5,us_aqi_pm10,us_aqi_ozone,us_aqi_nitrogen_dioxide,pm2_5,pm10,nitrogen_dioxide,ozone',
    hourly: 'pm2_5,ozone,us_aqi',
  });
  const weather = new URLSearchParams({ ...at, hourly: 'wind_speed_10m,boundary_layer_height' });
  return { air: `${AIR_API}?${air.toString()}`, weather: `${WEATHER_API}?${weather.toString()}` };
}

/** Fetches current + 48 h forecast; cached 15 min per request URL to stay well inside the free API's limits. */
export async function fetchAirReport(place: Place, fetchImpl: typeof fetch = fetch): Promise<AirReport> {
  const url = airRequest(place);
  const hit = cache.get(url.air);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { ...hit.report, place };

  // Weather only adds the smog-trap insight, so a weather failure must never block the air reading.
  const [res, weather] = await Promise.all([
    fetchImpl(url.air, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }),
    fetchImpl(url.weather, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ]);
  if (!res.ok) throw new Error(`Air-quality service error (${res.status})`);
  const parsed = parseAirResponse(await res.json(), place);
  const report = { ...parsed, hourly: mergeWeather(parsed.hourly, weather) };
  remember(url.air, report, Date.now());
  return report;
}
