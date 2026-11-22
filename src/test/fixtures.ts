import type { AirReport, HourPoint, Place, Profile } from '../lib/types';
import { DEFAULT_PROFILE } from '../lib/profile';

export const DELHI: Place = { name: 'New Delhi', lat: 28.61, lon: 77.21, region: 'Delhi', country: 'India' };

/** A smoggy winter day: dirty morning, cleaner afternoon, worst at night. PM2.5 by local hour. */
export const PM_BY_HOUR = [
  180, 185, 190, 195, 200, 205, 210, 215, 200, 170, 140, 120, 100, 90, 80, 85, 110, 150, 190, 220, 240, 245, 230, 210,
];

export function hourly(startHour = 0, hours = 48, day = '2026-11-17'): HourPoint[] {
  const points: HourPoint[] = [];
  for (let i = 0; i < hours; i++) {
    const h = (startHour + i) % 24;
    const d = startHour + i >= 24 ? '2026-11-18' : day;
    const pm25 = PM_BY_HOUR[h] ?? 100;
    points.push({ time: `${d}T${String(h).padStart(2, '0')}:00`, pm25, usAqi: Math.min(500, Math.round(pm25 * 1.3)) });
  }
  return points;
}

/** US EPA 2024 PM2.5 breakpoints: [AQI, µg/m³]. */
const PM_BREAKS = [[0, 0], [50, 9], [100, 35.4], [150, 55.4], [200, 125.4], [300, 225.4], [500, 325.4]] as const;
/** US EPA 8-hour ozone breakpoints: [AQI, ppb]; 1 ppb ≈ 1.96 µg/m³. */
const O3_BREAKS = [[0, 0], [50, 54], [100, 70], [150, 85], [200, 105], [300, 200], [500, 400]] as const;

function interpolate(table: readonly (readonly [number, number])[], x: number, from: 0 | 1): number {
  const to = from === 0 ? 1 : 0;
  for (let i = 1; i < table.length; i++) {
    const lo = table[i - 1];
    const hi = table[i];
    if (lo && hi && x <= hi[from]) return lo[to] + ((x - lo[from]) / (hi[from] - lo[from])) * (hi[to] - lo[to]);
  }
  return table[table.length - 1]?.[to] ?? 0;
}

export const pm25ForAqi = (aqi: number): number => interpolate(PM_BREAKS, aqi, 0);
export const aqiForPm25 = (pm: number): number => Math.round(interpolate(PM_BREAKS, pm, 1));
export const o3ForAqi = (aqi: number): number => interpolate(O3_BREAKS, aqi, 0) * 1.96;

/** A Delhi report; the current PM2.5 follows the AQI given, so the concern level matches the headline number. */
export function report(overrides: Partial<AirReport['current']> = {}, startHour = 6): AirReport {
  const usAqi = overrides.usAqi ?? 260;
  return {
    place: DELHI,
    timezone: 'Asia/Kolkata',
    current: { time: `2026-11-17T${String(startHour).padStart(2, '0')}:00`, usAqi, pm25: pm25ForAqi(usAqi), pm10: 320, no2: 60, o3: 20, dominant: 'pm25', ...overrides },
    hourly: hourly(startHour, 42),
  };
}

export function profile(overrides: Partial<Profile> = {}): Profile {
  return { ...DEFAULT_PROFILE, ...overrides };
}

/** Raw Open-Meteo payload shaped like the live API. */
export function openMeteoPayload(startHour = 0) {
  const points = hourly(0, 72);
  return {
    timezone: 'Asia/Kolkata',
    current: {
      time: `2026-11-17T${String(startHour).padStart(2, '0')}:00`,
      us_aqi: 262,
      pm2_5: 212.4,
      pm10: 318.2,
      nitrogen_dioxide: 58.1,
      ozone: 21.5,
    },
    hourly: {
      time: points.map((p) => p.time),
      pm2_5: points.map((p) => p.pm25),
      us_aqi: points.map((p) => p.usAqi),
    },
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Open-Meteo weather payload: a still, shallow night (smog trap 18:00–08:00) and a breezy, well-mixed day. */
export function weatherPayload() {
  const points = hourly(0, 72);
  const night = (t: string) => {
    const h = Number(t.slice(11, 13));
    return h >= 18 || h < 8;
  };
  return {
    hourly: {
      time: points.map((p) => p.time),
      wind_speed_10m: points.map((p) => (night(p.time) ? 3 : 12)),
      boundary_layer_height: points.map((p) => (night(p.time) ? 40 : 900)),
    },
  };
}
