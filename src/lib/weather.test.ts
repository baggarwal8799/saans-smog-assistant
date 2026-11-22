import { describe, expect, it } from 'vitest';
import type { HourPoint } from './types';
import { findSmogTrap, mergeWeather } from './weather';

const air = (times: string[]): HourPoint[] => times.map((time) => ({ time, pm25: 100, usAqi: 170 }));
const T = ['2026-11-17T00:00', '2026-11-17T01:00', '2026-11-17T02:00'];

describe('mergeWeather on partial or malformed forecasts', () => {
  it('leaves the air hours untouched when the weather payload has no hourly times', () => {
    const points = air(T);
    expect(mergeWeather(points, null)).toBe(points);
    expect(mergeWeather(points, { hourly: { time: 'not a list' } })).toBe(points);
  });

  it('adds nothing when the wind or mixing series is missing, so no hour can look trapped', () => {
    const noWind = mergeWeather(air(T), { hourly: { time: T, boundary_layer_height: [40, 40, 40] } });
    const noMixing = mergeWeather(air(T), { hourly: { time: T, wind_speed_10m: [3, 3, 3] } });
    expect(noWind.every((p) => p.windKmh === undefined && p.mixingM === undefined)).toBe(true);
    expect(noMixing.every((p) => p.windKmh === undefined && p.mixingM === undefined)).toBe(true);
    expect(findSmogTrap(noWind)).toBeNull();
  });

  it('skips only the hours with a non-numeric value or time, and the hours the weather does not cover', () => {
    const merged = mergeWeather(air([...T, '2026-11-17T03:00']), {
      hourly: { time: [T[0], 7, T[2]], wind_speed_10m: [3, 3, 'calm'], boundary_layer_height: [40, 40, 40] },
    });
    expect(merged.map((p) => p.windKmh)).toEqual([3, undefined, undefined, undefined]);
    expect(merged[0]).toMatchObject({ windKmh: 3, mixingM: 40 });
  });

  it('treats an infinite reading as missing', () => {
    const [p] = mergeWeather(air([T[0] ?? '']), {
      hourly: { time: [T[0]], wind_speed_10m: [Infinity], boundary_layer_height: [40] },
    });
    expect(p?.windKmh).toBeUndefined();
  });
});

describe('findSmogTrap figures', () => {
  it('reports the lowest mixing height and the mean wind over the trapped hours', () => {
    const weather = [
      [2, 150],
      [4, 60],
      [6, 120],
    ] as const;
    const points = air(T).map((p, i) => ({ ...p, windKmh: weather[i]?.[0] ?? 99, mixingM: weather[i]?.[1] ?? 999 }));
    expect(findSmogTrap(points)).toEqual({
      start: '2026-11-17T00:00',
      end: '2026-11-17T03:00',
      minMixingM: 60,
      avgWindKmh: 4,
    });
  });
});
