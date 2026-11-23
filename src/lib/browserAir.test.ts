import { afterEach, describe, expect, it, vi } from 'vitest';

import { DELHI, jsonResponse, openMeteoPayload } from '../../test/fixtures.js';
import { fetchAirReport } from './browserAir.js';

afterEach(() => vi.unstubAllGlobals());

describe('the browser air client', () => {
  it('uses the fetch installed after import, and keeps one cache for the page', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(openMeteoPayload(10)));
    vi.stubGlobal('fetch', fetchMock);
    const first = await fetchAirReport(DELHI);
    const calls = fetchMock.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    expect(await fetchAirReport(DELHI)).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(calls);
  });
});
