/**
 * The server's air client: one cache per process, and one client per fetch, reused across requests. Production
 * always passes the global fetch, so it builds a single client; tests that inject their own fetch get their own.
 */
import { airCache, type AirClient, createAirClient } from '../core/airClient.js';
import type { AirReport, Place } from '../core/types.js';

const cache = airCache();
const clients = new WeakMap<typeof fetch, AirClient>();

function clientFor(fetchImpl: typeof fetch): AirClient {
  const known = clients.get(fetchImpl);
  if (known) return known;
  const client = createAirClient({ fetch: fetchImpl, cache });
  clients.set(fetchImpl, client);
  return client;
}

export const fetchAirReport = (place: Place, fetchImpl: typeof fetch): Promise<AirReport> =>
  clientFor(fetchImpl).fetchAirReport(place);

export function clearAirCache(): void {
  cache.clear();
}
