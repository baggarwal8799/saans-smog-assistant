import { describe, expect, it } from 'vitest';

import { DELHI, hourly, openMeteoPayload, weatherPayload } from '../test/fixtures.js';
import { aqiLevel, parseAirResponse, pm25Level } from './aqi.js';
import { findSmogTrap, mergeWeather } from './weather.js';
import { averagePm25, findWindow, formatHour } from './windows.js';

describe('aqiLevel', () => {
  it.each([
    [0, 'good'],
    [50, 'good'],
    [51, 'moderate'],
    [100, 'moderate'],
    [150, 'sensitive'],
    [200, 'unhealthy'],
    [300, 'veryUnhealthy'],
    [301, 'hazardous'],
  ])('maps %i to %s on the US EPA scale', (aqi, level) => {
    expect(aqiLevel(aqi)).toBe(level);
  });
});

describe('parseAirResponse', () => {
  it('normalises the payload and drops hours before now', () => {
    const r = parseAirResponse(openMeteoPayload(10), DELHI);
    expect(r.current).toMatchObject({ usAqi: 262, pm25: 212.4, pm10: 318.2, no2: 58.1, o3: 21.5 });
    expect(r.hourly[0]?.time).toBe('2026-11-17T10:00');
    expect(r.timezone).toBe('Asia/Kolkata');
  });

  it('rejects malformed payloads', () => {
    expect(() => parseAirResponse(null, DELHI)).toThrow();
    expect(() => parseAirResponse({}, DELHI)).toThrow(/Missing current/);
    expect(() => parseAirResponse({ current: { time: '2026-11-17T10:00', us_aqi: null } }, DELHI)).toThrow(
      /unavailable/,
    );
  });

  it('tolerates missing hourly arrays and non-numeric values', () => {
    const payload = {
      current: { time: '2026-11-17T10:00', us_aqi: 90, pm2_5: 30, pm10: 'x' },
      hourly: { time: ['2026-11-17T10:00'], pm2_5: [null] },
    };
    const r = parseAirResponse(payload, DELHI);
    expect(r.hourly).toEqual([]);
    expect(Number.isNaN(r.current.pm10)).toBe(true);
    expect(r.timezone).toBe('auto');
  });
});

describe('windows', () => {
  it('finds the cleanest daytime 2-hour window', () => {
    const w = findWindow(hourly(6, 24), 2, 'best');
    expect(w).toEqual({ start: '2026-11-17T14:00', end: '2026-11-17T16:00', avgPm25: 82.5 });
  });

  it('finds the most polluted daytime window, capped at 21:00', () => {
    const w = findWindow(hourly(6, 24), 2, 'worst');
    expect(w?.start).toBe('2026-11-17T19:00');
    expect(w?.end).toBe('2026-11-17T21:00');
  });

  it('returns null when no daytime hours remain', () => {
    expect(findWindow(hourly(22, 6), 2)).toBeNull();
    expect(findWindow([], 2)).toBeNull();
  });

  it('averages the next 24 hours, or falls back', () => {
    expect(averagePm25([], 42)).toBe(42);
    expect(averagePm25(hourly(0, 24), 0)).toBeCloseTo(PMavg());
  });

  it('formats hours', () => {
    expect(formatHour('2026-11-17T07:00')).toBe('07:00');
  });
});

function PMavg(): number {
  const pts = hourly(0, 24);
  return pts.reduce((s, p) => s + p.pm25, 0) / pts.length;
}

describe('winter smog trap', () => {
  const withWeather = (startHour: number, hours: number) => mergeWeather(hourly(startHour, hours), weatherPayload());

  it('merges wind and mixing height by local time', () => {
    const pts = withWeather(12, 3);
    expect(pts[0]).toMatchObject({ time: '2026-11-17T12:00', windKmh: 12, mixingM: 900 });
    expect(mergeWeather(hourly(0, 2), null)).toEqual(hourly(0, 2));
    expect(mergeWeather(hourly(0, 2), { hourly: { time: 'x' } })).toEqual(hourly(0, 2));
  });

  it('finds the first still, shallow span of 3+ hours in the next day', () => {
    const trap = findSmogTrap(withWeather(12, 30));
    expect(trap).toEqual({ start: '2026-11-17T18:00', end: '2026-11-18T08:00', minMixingM: 40, avgWindKmh: 3 });
  });

  it('ignores short or windy spells, and hours with no weather', () => {
    expect(findSmogTrap(withWeather(10, 8))).toBeNull(); // daytime only: windy, well mixed
    expect(findSmogTrap(withWeather(6, 3))).toBeNull(); // only 2 trapped hours
    expect(findSmogTrap(hourly(18, 12))).toBeNull(); // no weather at all
  });

  it('closes a trap that runs to the end of the forecast window', () => {
    const trap = findSmogTrap(withWeather(20, 5));
    expect(trap?.start).toBe('2026-11-17T20:00');
    expect(trap?.end).toBe('2026-11-18T01:00');
  });

  it('bands hourly PM2.5 on the EPA scale', () => {
    expect([5, 20, 40, 100, 200, 300].map(pm25Level)).toEqual([
      'good',
      'moderate',
      'sensitive',
      'unhealthy',
      'veryUnhealthy',
      'hazardous',
    ]);
  });
});
