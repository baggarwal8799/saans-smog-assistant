import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELHI, jsonResponse, openMeteoPayload, weatherPayload } from '../test/fixtures.js';
import { AIR_API, AIR_CACHE_MAX, type AirCache, airCache, createAirClient } from './airClient.js';
import { parseAirResponse } from './aqi.js';
import type { Place } from './types.js';

describe('fetchAirReport', () => {
  let cache: AirCache = airCache();
  const fetchAirReport = (place: Place, fetchImpl: typeof fetch) =>
    createAirClient({ fetch: fetchImpl, cache }).fetchAirReport(place);
  beforeEach(() => (cache = airCache()));

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
    expect(cache.size).toBe(AIR_CACHE_MAX);
  });

  it('throws on HTTP errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('nope', { status: 503 }));
    await expect(fetchAirReport(DELHI, fetchMock)).rejects.toThrow('503');
  });
});

describe('fetchAirReport when the weather call fails', () => {
  it.each([
    ['answers with an error status', () => Promise.resolve(new Response('down', { status: 503 }))],
    ['rejects outright', () => Promise.reject(new Error('offline'))],
  ])('still returns the air reading when the weather service %s', async (_case, weather) => {
    const fetchMock = vi.fn((url: string) =>
      url.includes('air-quality') ? Promise.resolve(jsonResponse(openMeteoPayload(10))) : weather(),
    );
    const client = createAirClient({ fetch: fetchMock as unknown as typeof fetch, cache: airCache() });
    const r = await client.fetchAirReport(DELHI);
    expect(r.current.usAqi).toBe(262);
    expect(r.hourly.length).toBeGreaterThan(0);
    expect(r.hourly.every((p) => p.windKmh === undefined)).toBe(true);
  });
});

describe('createAirClient', () => {
  const network = () =>
    vi.fn<typeof fetch>(async (input) =>
      jsonResponse(String(input).includes('air-quality') ? openMeteoPayload(10) : weatherPayload()),
    );

  it.each([
    [{}, 10_000],
    [{ timeoutMs: 1234 }, 1234],
  ])('times out each request (%o gives %i ms)', async (option, expected) => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    await createAirClient({ fetch: network(), cache: airCache(), ...option }).fetchAirReport(DELHI);
    expect(timeout.mock.calls).toEqual([[expected], [expected]]);
    timeout.mockRestore();
  });

  it('answers a cached place with the name it was asked under, without a request', async () => {
    const net = network();
    const client = createAirClient({ fetch: net, cache: airCache() });
    await client.fetchAirReport(DELHI);
    const again = await client.fetchAirReport({ ...DELHI, name: 'New Delhi' });
    expect(again.place.name).toBe('New Delhi');
    expect(net).toHaveBeenCalledTimes(2);
  });

  it('keeps a report for 15 minutes', () => {
    const cache = airCache();
    cache.set('k', parseAirResponse(openMeteoPayload(10), DELHI), 0);
    expect(cache.get('k', 15 * 60 * 1000 - 1)).toBeDefined();
    expect(cache.get('k', 15 * 60 * 1000)).toBeUndefined();
  });
});
