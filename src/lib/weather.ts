/** Weather that traps smog: merging the wind and mixing-height forecast, and finding the trap. */
import type { HourPoint, SmogTrap } from './types.js';
import { endTime } from './windows.js';

/**
 * Smog trap: wind under 8 km/h and a mixing layer under 200 m. Smoke from traffic, cooking and burning then has
 * nowhere to go and builds up at breathing height, which is what makes North Indian winter nights so bad.
 */
export const TRAP_WIND_KMH = 8;
export const TRAP_MIXING_M = 200;
const TRAP_MIN_HOURS = 3;

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;
}

/** Adds wind and mixing height to the hourly air points (matched by local time). Missing data is fine. */
export function mergeWeather(points: HourPoint[], raw: unknown): HourPoint[] {
  const h = (raw as { hourly?: { time?: unknown; wind_speed_10m?: unknown; boundary_layer_height?: unknown } } | null)?.hourly;
  if (!h || !Array.isArray(h.time)) return points;
  const wind = Array.isArray(h.wind_speed_10m) ? (h.wind_speed_10m as unknown[]) : [];
  const mixing = Array.isArray(h.boundary_layer_height) ? (h.boundary_layer_height as unknown[]) : [];
  const byTime = new Map<string, { windKmh: number; mixingM: number }>();
  (h.time as unknown[]).forEach((t, i) => {
    const w = num(wind[i]);
    const m = num(mixing[i]);
    if (typeof t === 'string' && !Number.isNaN(w) && !Number.isNaN(m)) byTime.set(t, { windKmh: w, mixingM: m });
  });
  return points.map((p) => {
    const extra = byTime.get(p.time);
    return extra ? { ...p, ...extra } : p;
  });
}

/** The first span in the next 24 h of at least 3 hours when still, shallow air traps smoke near the ground. */
export function findSmogTrap(points: readonly HourPoint[]): SmogTrap | null {
  const day = points.slice(0, 24);
  let run: HourPoint[] = [];
  const close = (r: HourPoint[]): SmogTrap | null => {
    const first = r[0];
    const last = r[r.length - 1];
    if (r.length < TRAP_MIN_HOURS || !first || !last) return null;
    return {
      start: first.time,
      end: endTime(last.time),
      minMixingM: Math.min(...r.map((p) => p.mixingM ?? Infinity)),
      avgWindKmh: r.reduce((s, p) => s + (p.windKmh ?? 0), 0) / r.length,
    };
  };
  for (const p of day) {
    const trapped = p.windKmh !== undefined && p.mixingM !== undefined && p.windKmh <= TRAP_WIND_KMH && p.mixingM <= TRAP_MIXING_M;
    if (trapped) run.push(p);
    else {
      const found = close(run);
      if (found) return found;
      run = [];
    }
  }
  return close(run);
}
