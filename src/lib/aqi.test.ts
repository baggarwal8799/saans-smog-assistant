import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DELHI, hourly, jsonResponse, openMeteoPayload, weatherPayload } from '../test/fixtures';
import { AIR_API, AIR_CACHE_MAX, airCacheSize, pm25Level, aqiLevel, clearAirCache, fetchAirReport, parseAirResponse } from './aqi';
import { findSmogTrap, mergeWeather } from './weather';
import { averagePm25, findWindow, formatHour } from './windows';

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
    expect(() => parseAirResponse({ current: { time: '2026-11-17T10:00', us_aqi: null } }, DELHI)).toThrow(/unavailable/);
  });

  it('tolerates missing hourly arrays and non-numeric values', () => {
    const payload = { current: { time: '2026-11-17T10:00', us_aqi: 90, pm2_5: 30, pm10: 'x' }, hourly: { time: ['2026-11-17T10:00'], pm2_5: [null] } };
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

describe('fetchAirReport', () => {
  beforeEach(() => clearAirCache());

  it('calls Open-Meteo with the right parameters and caches the result', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) =>
      String(input).includes('air-quality-api') ? jsonResponse(openMeteoPayload(8)) : jsonResponse(weatherPayload()),
    );
    const a = await fetchAirReport(DELHI, fetchMock);
    const b = await fetchAirReport(DELHI, fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(2); // air + weather once, then cached
    expect(a.hourly[0]).toMatchObject({ windKmh: 12, mixingM: 900 });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe(AIR_API);
    expect(url.searchParams.get('current')).toContain('pm2_5');
    expect(url.searchParams.get('timezone')).toBe('auto');
    expect(b.current).toEqual(a.current);
  });

  it('keeps working without weather data', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) =>
      String(input).includes('air-quality-api') ? jsonResponse(openMeteoPayload(8)) : new Response('', { status: 500 }),
    );
    const r = await fetchAirReport(DELHI, fetchMock);
    expect(r.hourly[0]?.windKmh).toBeUndefined();
    expect(r.current.usAqi).toBe(262);
  });

  it('keeps the cache bounded, however many places are requested', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) =>
      String(input).includes('air-quality-api') ? jsonResponse(openMeteoPayload(8)) : new Response('', { status: 500 }),
    );
    for (let i = 0; i < AIR_CACHE_MAX + 40; i++) {
      await fetchAirReport({ name: `p${i}`, lat: 10 + i / 100, lon: 70 }, fetchMock);
    }
    expect(airCacheSize()).toBe(AIR_CACHE_MAX);
  });

  it('throws on HTTP errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('nope', { status: 503 }));
    await expect(fetchAirReport(DELHI, fetchMock)).rejects.toThrow('503');
  });
});

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
    expect([5, 20, 40, 100, 200, 300].map(pm25Level)).toEqual(['good', 'moderate', 'sensitive', 'unhealthy', 'veryUnhealthy', 'hazardous']);
  });
});
