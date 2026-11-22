// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIR_API, WEATHER_API, airRequest, clearAirCache, fetchAirReport } from '../../src/lib/aqi';
import { jsonResponse, openMeteoPayload, weatherPayload } from '../../src/test/fixtures';
import { handleAssistant, resetAssistantState } from './assistant';
import { body, gemini, post, quietLog } from '../../src/test/apiHelpers';
import { parseAssistantRequest } from './validate';

/** A GPS fix as the browser has it, with more decimals than the air grid uses. */
const gps = { name: 'Connaught Place', lat: 28.631_94, lon: 77.216_71, region: 'Delhi', country: 'India' };

/** Records every Open-Meteo URL requested, and answers Gemini with `inner`. */
function recording(inner: typeof fetch) {
  const urls: string[] = [];
  const f = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (!url.startsWith(AIR_API) && !url.startsWith(WEATHER_API)) return inner(input, init);
    urls.push(url);
    return jsonResponse(url.startsWith(AIR_API) ? openMeteoPayload(6) : weatherPayload());
  });
  return { f, urls };
}

beforeEach(() => {
  resetAssistantState();
  clearAirCache();
});

describe('one Open-Meteo request for the browser and the server', () => {
  it('builds the same URLs from the browser place and from the place the server validates', () => {
    const server = parseAssistantRequest(body({ place: gps })).place;
    expect(airRequest(server)).toEqual(airRequest(gps));
    const url = new URL(airRequest(gps).air);
    expect([url.searchParams.get('latitude'), url.searchParams.get('longitude')]).toEqual(['28.63', '77.22']);
  });

  it('has the browser fetch and the server fetch request exactly the same URLs for the same place', async () => {
    const browser = recording(vi.fn<typeof fetch>());
    await fetchAirReport(gps, browser.f);
    clearAirCache(); // the server runs in another process, with its own cache
    const server = recording(gemini('Keep the windows shut.'));
    await handleAssistant(post(body({ place: gps })), { GEMINI_API_KEY: 'k' }, server.f, quietLog);
    expect(server.urls).toEqual(browser.urls);
    expect(browser.urls).toEqual([airRequest(gps).air, airRequest(gps).weather]);
  });

  it('serves two fixes in the same grid cell from one cache entry, since they are one request', async () => {
    const net = recording(vi.fn<typeof fetch>());
    await fetchAirReport(gps, net.f);
    await fetchAirReport({ ...gps, lat: 28.6302, lon: 77.2168 }, net.f);
    expect(net.urls).toHaveLength(2);
  });
});
