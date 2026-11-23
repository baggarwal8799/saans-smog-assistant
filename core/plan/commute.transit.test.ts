/**
 * The bus branch of the exposure tip. With today's factors the metro always wins on dose, so the dose model is
 * swapped for one where the bus is cleaner, to check the tip then follows the model rather than assuming the metro.
 */
import { describe, expect, it, vi } from 'vitest';

import { profile } from '../../test/fixtures.js';
import type * as Impact from '../impact.js';
import { commuteExposureRec, safestTransit } from './commute.js';

vi.mock('../impact.js', async (importOriginal) => ({
  ...(await importOriginal<typeof Impact>()),
  commuteDoseFactor: (mode: string) => (mode === 'bus' ? 0.1 : 1),
}));

describe('exposure tip when the bus is the cleaner ride', () => {
  it('suggests the bus, names the metro only as the alternative, and credits the modelled cut', () => {
    expect(safestTransit(5)).toBe('bus');
    const r = commuteExposureRec({
      profile: profile({ commuteMode: 'walk', commuteKm: 5, hasRespiratory: false }),
      concern: 'severe',
      band: 'veryUnhealthy',
      avg: 200,
      best: null,
      worst: null,
      ozonePeak: null,
      trap: null,
      dominant: 'pm25',
      now: '2026-11-17T07:00',
      india: true,
      mosquitoes: false,
    });
    expect(r?.title.en).toBe('Today, take the bus instead of walking');
    expect(r?.detail.en).toMatch(/Take the bus \(or the metro, /);
    expect(r?.detail.hi).toMatch(/बस लें \(या मेट्रो, /);
    expect(r?.impact.exposureCutPct).toBe(90);
  });
});
