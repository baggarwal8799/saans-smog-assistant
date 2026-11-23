/** The browser's air client: one cache for the page's lifetime, through whichever fetch is installed. */
import { airCache, createAirClient } from '../../core/airClient.js';

// Looked up per call, not captured at import, so a fetch installed later (tests, polyfills) is the one used.
export const { fetchAirReport } = createAirClient({ fetch: (input, init) => fetch(input, init), cache: airCache() });
