import { isoDateHour } from './isoTime.js';
import { asArray, isRecord, toNumber } from './parse.js';
import type { AirReport, AqiLevel, HourPoint, Place, Pollutant } from './types.js';

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

const SUB_INDEX = [
  ['pm25', 'us_aqi_pm2_5'],
  ['pm10', 'us_aqi_pm10'],
  ['o3', 'us_aqi_ozone'],
  ['no2', 'us_aqi_nitrogen_dioxide'],
] as const satisfies readonly (readonly [Pollutant, string])[];

/** The pollutant whose US AQI sub-index is highest, which is the one the headline AQI reports. */
export function dominantPollutant(current: Record<string, unknown>): Pollutant | null {
  let best: Pollutant | null = null;
  let bestValue = -1;
  for (const [pollutant, field] of SUB_INDEX) {
    const subIndex = toNumber(current[field]);
    if (!Number.isNaN(subIndex) && subIndex > bestValue) {
      best = pollutant;
      bestValue = subIndex;
    }
  }
  return best;
}

function numericSeries(hourly: Record<string, unknown>, key: string): number[] {
  return asArray(hourly[key]).map(toNumber);
}

const entry = (series: readonly number[], index: number): number => series[index] ?? Number.NaN;

function parseCurrent(raw: unknown): AirReport['current'] {
  if (!isRecord(raw) || typeof raw.time !== 'string') throw new Error('Missing current air quality');
  const current = {
    time: raw.time,
    usAqi: toNumber(raw.us_aqi),
    pm25: toNumber(raw.pm2_5),
    pm10: toNumber(raw.pm10),
    no2: toNumber(raw.nitrogen_dioxide),
    o3: toNumber(raw.ozone),
    dominant: dominantPollutant(raw),
  };
  if (Number.isNaN(current.usAqi) || Number.isNaN(current.pm25))
    throw new Error('Air quality unavailable for this place');
  return current;
}

/** Forecast hours from the current hour on, skipping any without PM2.5 or AQI; ozone is kept when known. */
function parseHourly(raw: unknown, currentHour: string): HourPoint[] {
  const rawHourly = isRecord(raw) ? raw : {};
  const pm25Series = numericSeries(rawHourly, 'pm2_5');
  const aqiSeries = numericSeries(rawHourly, 'us_aqi');
  const ozoneSeries = numericSeries(rawHourly, 'ozone');
  const hourly: HourPoint[] = [];
  asArray(rawHourly.time).forEach((time, index) => {
    const pm25 = entry(pm25Series, index);
    const usAqi = entry(aqiSeries, index);
    if (typeof time !== 'string' || isoDateHour(time) < currentHour || Number.isNaN(pm25) || Number.isNaN(usAqi))
      return;
    const o3 = entry(ozoneSeries, index);
    hourly.push(Number.isNaN(o3) ? { time, pm25, usAqi } : { time, pm25, usAqi, o3 });
  });
  return hourly;
}

/** Validates and normalises the Open-Meteo response; throws on anything unusable. */
export function parseAirResponse(raw: unknown, place: Place): AirReport {
  if (!isRecord(raw)) throw new Error('Invalid air-quality response');
  const current = parseCurrent(raw.current);
  return {
    place,
    timezone: typeof raw.timezone === 'string' ? raw.timezone : 'auto',
    current,
    hourly: parseHourly(raw.hourly, isoDateHour(current.time)),
  };
}
