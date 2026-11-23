/** Weather that traps smog: merging the wind and mixing-height forecast, and finding the trap. */
import { asArray, isRecord, toNumber } from './parse.js';
import type { HourPoint, SmogTrap } from './types.js';
import { endTime } from './windows.js';

/**
 * Smog trap: wind under 8 km/h and a mixing layer under 200 m. Smoke from traffic, cooking and burning then has
 * nowhere to go and builds up at breathing height, which is what makes North Indian winter nights so bad.
 */
export const TRAP_WIND_KMH = 8;
export const TRAP_MIXING_M = 200;
const TRAP_MIN_HOURS = 3;

type TrappedHour = HourPoint & { windKmh: number; mixingM: number };
const isTrapped = (point: HourPoint): point is TrappedHour =>
  point.windKmh !== undefined &&
  point.mixingM !== undefined &&
  point.windKmh <= TRAP_WIND_KMH &&
  point.mixingM <= TRAP_MIXING_M;

/** Matched by local time. Missing data leaves the points as they are: weather only adds the smog-trap insight. */
export function mergeWeather(points: HourPoint[], raw: unknown): HourPoint[] {
  const hourly = isRecord(raw) ? raw.hourly : null;
  if (!isRecord(hourly) || !Array.isArray(hourly.time)) return points;
  const wind = asArray(hourly.wind_speed_10m);
  const mixing = asArray(hourly.boundary_layer_height);
  const byTime = new Map<string, { windKmh: number; mixingM: number }>();
  asArray(hourly.time).forEach((time, index) => {
    const windKmh = toNumber(wind[index]);
    const mixingM = toNumber(mixing[index]);
    if (typeof time === 'string' && !Number.isNaN(windKmh) && !Number.isNaN(mixingM))
      byTime.set(time, { windKmh, mixingM });
  });
  return points.map((point) => {
    const extra = byTime.get(point.time);
    return extra ? { ...point, ...extra } : point;
  });
}

/** The first span in the next 24 h of at least 3 hours when still, shallow air traps smoke near the ground. */
export function findSmogTrap(points: readonly HourPoint[]): SmogTrap | null {
  const day = points.slice(0, 24);
  let run: TrappedHour[] = [];
  const close = (hours: TrappedHour[]): SmogTrap | null => {
    const first = hours[0];
    const last = hours[hours.length - 1];
    if (hours.length < TRAP_MIN_HOURS || !first || !last) return null;
    return {
      start: first.time,
      end: endTime(last.time),
      minMixingM: Math.min(...hours.map((p) => p.mixingM)),
      avgWindKmh: hours.reduce((s, p) => s + p.windKmh, 0) / hours.length,
    };
  };
  for (const point of day) {
    if (isTrapped(point)) run.push(point);
    else {
      const found = close(run);
      if (found) return found;
      run = [];
    }
  }
  return close(run);
}
