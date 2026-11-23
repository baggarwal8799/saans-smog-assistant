/**
 * A fresh browser air client for each App test, in place of src/lib/browserAir.ts: the page keeps one cache for its
 * lifetime, so a report fetched in one test would answer the next. Use it with
 * `vi.mock('./lib/browserAir.js', () => import('./browserAir.js'))` and `beforeEach(resetAirClient)`.
 */
import { airCache, createAirClient } from '../core/airClient.js';
import type { AirReport, Place } from '../core/types.js';

const freshClient = () => createAirClient({ fetch: (input, init) => fetch(input, init), cache: airCache() });

let client = freshClient();

export function resetAirClient(): void {
  client = freshClient();
}

export const fetchAirReport = (place: Place): Promise<AirReport> => client.fetchAirReport(place);
