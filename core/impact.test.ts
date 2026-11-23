import { describe, expect, it } from 'vitest';

import { profile } from '../test/fixtures.js';
import { impactChips } from './chips.js';
import {
  cigarettesEquivalent,
  clamp,
  commuteCo2SavingKg,
  commuteHoursPerDay,
  dailyDoseUg,
  EMISSION_KG_PER_KM,
  INDOOR_RATIO,
  monthlyCommuteCo2Kg,
  pctCut,
  round,
} from './impact.js';

describe('impact engine', () => {
  it('computes monthly commute CO2 from distance, both ways, 22 workdays', () => {
    expect(monthlyCommuteCo2Kg('car', 10)).toBeCloseTo(0.17 * 10 * 2 * 22);
    expect(monthlyCommuteCo2Kg('walk', 10)).toBe(0);
  });

  it('never reports a negative saving when the alternative emits more', () => {
    expect(commuteCo2SavingKg('metro', 'car', 10)).toBe(0);
    expect(commuteCo2SavingKg('car', 'metro', 10)).toBeCloseTo((0.17 - 0.03) * 440);
  });

  it('ranks modes so that active travel and metro emit least', () => {
    expect(EMISSION_KG_PER_KM.metro).toBeLessThan(EMISSION_KG_PER_KM.bus);
    expect(EMISSION_KG_PER_KM.bus).toBeLessThan(EMISSION_KG_PER_KM.car);
    expect(EMISSION_KG_PER_KM.bicycle).toBe(0);
  });

  it('converts PM2.5 to the Berkeley Earth cigarette equivalent', () => {
    expect(cigarettesEquivalent(220)).toBeCloseTo(10);
    expect(cigarettesEquivalent(-5)).toBe(0);
  });

  it('bounds percentage cuts between 0 and 100', () => {
    expect(pctCut(100, 40)).toBe(60);
    expect(pctCut(100, 140)).toBe(0);
    expect(pctCut(0, 10)).toBe(0);
  });

  it('rounds and clamps', () => {
    expect(round(1.256, 2)).toBe(1.26);
    expect(round(7.5)).toBe(8);
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
  });

  it('turns commute distance into hours, with zero for home workers', () => {
    expect(commuteHoursPerDay('car', 25)).toBeCloseTo(2);
    expect(commuteHoursPerDay('wfh', 25)).toBe(0);
    expect(commuteHoursPerDay('bus', 0)).toBe(0);
  });

  describe('daily inhaled dose', () => {
    const p = profile({ commuteMode: 'bus', commuteKm: 9, exerciseMinutes: 60, hasPurifier: false });

    it('adds commute, exercise and indoor rest', () => {
      // bus: 1 h at 100 × 1.0 × 0.5 = 50, plus the 20-minute walk to the stop at 100 × 1.1 × 1.0; exercise 1 h at
      // 100 × 3 = 300; rest 22 h − 20 min at 90 (windows open) × 0.5.
      expect(dailyDoseUg(p, 100)).toBeCloseTo(50 + 110 / 3 + 300 + 90 * 0.5 * (22 - 1 / 3));
    });

    it('drops with a mask, indoor exercise and a purifier', () => {
      const base = dailyDoseUg(p, 100);
      const habits = { maskOutdoors: true, exerciseIndoors: true, indoorRatio: INDOOR_RATIO.purifier };
      const better = dailyDoseUg(p, 100, habits);
      expect(better).toBeLessThan(base * 0.5);
    });

    it('uses the cleaner exercise window when given', () => {
      expect(dailyDoseUg(p, 100, { exercisePm25: 50 })).toBeCloseTo(50 + 110 / 3 + 150 + 90 * 0.5 * (22 - 1 / 3));
    });

    it('the baseline is the household habit: windows open, or its own purifier running', () => {
      const withPurifier = dailyDoseUg(profile({ ...p, hasPurifier: true }), 100);
      expect(withPurifier).toBe(dailyDoseUg(p, 100, { indoorRatio: INDOOR_RATIO.purifier }));
      expect(dailyDoseUg(p, 100)).toBe(dailyDoseUg(p, 100, { indoorRatio: INDOOR_RATIO.open }));
    });

    it('never lets an implausible commute exceed the hours left in the day', () => {
      const extreme = profile({ commuteMode: 'walk', commuteKm: 100, exerciseMinutes: 60 });
      // 100 km on foot would be 40 h; capped at 23 h of light breathing at 1.1 × 100 µg/m³, plus 1 h of exercise.
      expect(dailyDoseUg(extreme, 100)).toBeCloseTo(100 * 1.1 * 1.0 * 23 + 300);
    });

    it('can model a different commute mode', () => {
      expect(dailyDoseUg(p, 100, { commuteMode: 'metro' })).toBeLessThan(dailyDoseUg(p, 100, { commuteMode: 'walk' }));
    });
  });
});

describe('impactChips', () => {
  it('writes a cut with no scope as a plain PM2.5 cut, never "undefined"', () => {
    const [chip, ...rest] = impactChips({ exposureCutPct: 40, explanation: 'x' }, 'en');
    expect(rest).toEqual([]);
    expect(chip?.kind).toBe('lungs');
    expect(chip?.text).toMatch(/^Cuts PM2\.5\s+≈ 40%$/);
  });
});
