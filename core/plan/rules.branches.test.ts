/** Rule edges driven directly through each rule, with a hand-built input instead of a whole air report. */
import { describe, expect, it } from 'vitest';

import { profile } from '../../test/fixtures.js';
import { bilingual, joinList } from '../copy/text.js';
import { phrase } from '../spans.js';
import type { Profile, TimeWindow } from '../types.js';
import { commuteRec, safestTransit, suggestCommute } from './commute.js';
import { exerciseRec } from './routine.js';
import type { RuleInput } from './rule.js';
import { vulnerableRec } from './vulnerable.js';

const NOW = '2026-11-17T07:00';
const WORST: TimeWindow = { start: '2026-11-17T19:00', end: '2026-11-17T22:00', avgPm25: 240 };

function input(p: Partial<Profile>, over: Partial<RuleInput> = {}): RuleInput {
  return {
    profile: profile(p),
    concern: 'low',
    band: 'good',
    avg: 40,
    best: null,
    worst: null,
    ozonePeak: null,
    trap: null,
    dominant: 'pm25',
    now: NOW,
    india: true,
    mosquitoes: false,
    ...over,
  };
}

describe('commute switch', () => {
  it('drops a switch whose saving rounds to 0.0 kg, but keeps a real one', () => {
    const smoggy = { band: 'unhealthy', concern: 'high' } as const;
    // A cleaner mode exists for the trip, yet 10 m each way saves well under 0.05 kg a month.
    expect(suggestCommute('car', 0.01, 'unhealthy')).toBe('bus');
    expect(commuteRec(input({ commuteMode: 'car', commuteKm: 0.01 }, smoggy))).toBeNull();
    const real = commuteRec(input({ commuteMode: 'car', commuteKm: 12 }, smoggy));
    expect(real?.impact.co2KgPerMonth).toBeGreaterThan(0);
  });

  it('with the real factors the metro always beats the bus on dose, at every distance', () => {
    for (const km of [0, 1, 5, 20, 60]) expect(safestTransit(km)).toBe('metro');
  });
});

describe('exercise timing', () => {
  it('gives no tip on a clean-air day with no clean window to name', () => {
    expect(exerciseRec(input({ exerciseMinutes: 30 }))).toBeNull();
  });

  it('moves the workout indoors when there is no clean window and the air is not clean', () => {
    expect(exerciseRec(input({ exerciseMinutes: 30 }, { concern: 'moderate', band: 'moderate' }))?.id).toBe(
      'exercise-indoors',
    );
  });
});

describe('sensitive-groups tip without a worst window', () => {
  const kids = { hasChildren: true, hasElderly: false, hasRespiratory: false };

  it('"Unhealthy": the whole-day advice stands, with no peak named', () => {
    const r = vulnerableRec(input(kids, { band: 'unhealthy', concern: 'high' }));
    expect(r?.title.en).toMatch(/^All day today: no long or hard outdoor activity for /);
    expect(r?.detail.en).not.toMatch(/fully indoors/);
    expect(r?.explanation.en).not.toMatch(/peaks at/);
    expect(r?.explanation.hi).not.toMatch(/तक पहुँचता है/);
  });

  it('"Very unhealthy": indoors all day, with no "worst" time named', () => {
    const r = vulnerableRec(input(kids, { band: 'veryUnhealthy', concern: 'severe' }));
    expect(r?.title.en).toMatch(/indoors all day today$/);
    expect(r?.detail.en).not.toMatch(/The air is worst/);
    expect(r?.detail.hi).not.toMatch(/सबसे खराब होगी/);
  });

  it('names the peak once a worst window exists', () => {
    const r = vulnerableRec(input(kids, { band: 'veryUnhealthy', concern: 'severe', worst: WORST }));
    expect(r?.detail.en).toMatch(/The air is worst from 19:00 to 22:00, in the /);
    expect(r?.explanation.en).toMatch(/Forecast PM2\.5 peaks at ≈ 240 µg\/m³ from 19:00 to 22:00\./);
  });

  it('"Unhealthy for sensitive groups" needs a window: without one there is no tip', () => {
    expect(vulnerableRec(input(kids, { band: 'sensitive', concern: 'moderate' }))).toBeNull();
  });
});

describe('time phrases', () => {
  it('"around" a span that runs past midnight names the next day', () => {
    const span = { start: '2026-11-17T22:00', end: '2026-11-18T02:00' };
    expect(phrase(span, '2026-11-17T13:00', 'around')).toEqual({
      en: 'around 22:00 to 02:00 tomorrow',
      hi: '22:00 से कल 02:00 के आसपास',
    });
    expect(phrase({ start: '2026-11-17T14:00', end: '2026-11-17T16:00' }, '2026-11-17T13:00', 'around').en).toBe(
      'around 14:00–16:00',
    );
  });
});

describe('joinList', () => {
  const t = (w: string) => bilingual(w, w);
  it('joins 0, 1, 2 and 3 items with the language’s own "and"', () => {
    expect(joinList([])).toEqual({ en: '', hi: '' });
    expect(joinList([t('a')])).toEqual({ en: 'a', hi: 'a' });
    expect(joinList([t('a'), t('b')])).toEqual({ en: 'a and b', hi: 'a और b' });
    expect(joinList([t('a'), t('b'), t('c')])).toEqual({ en: 'a, b and c', hi: 'a, b और c' });
  });
});
