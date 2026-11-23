import { describe, expect, it } from 'vitest';

import { profile, report } from '../../test/fixtures.js';
import { EMISSION_KG_PER_KM } from '../impact.js';
import { buildPlan } from '../recommend.js';
import { AQI_LEVELS, COMMUTE_MODES } from '../types.js';
import { suggestCommute } from './commute.js';

describe('commute switches', () => {
  it('never suggests a mode that emits more, and only meaningful (≥25%) cuts', () => {
    for (const mode of COMMUTE_MODES) {
      for (const km of [1, 5, 12, 40]) {
        for (const band of AQI_LEVELS) {
          const alt = suggestCommute(mode, km, band);
          if (alt)
            expect(EMISSION_KG_PER_KM[alt], `${mode} → ${alt}`).toBeLessThanOrEqual(EMISSION_KG_PER_KM[mode] * 0.75);
        }
      }
    }
  });

  it('sends cars to the bus, autos and motorbikes to the metro (a bus emits more per km than an auto)', () => {
    expect(suggestCommute('car', 12, 'unhealthy')).toBe('bus');
    expect(suggestCommute('auto', 12, 'unhealthy')).toBe('metro');
    expect(suggestCommute('motorbike', 12, 'unhealthy')).toBe('metro');
    expect(suggestCommute('bus', 12, 'unhealthy')).toBe('metro');
    expect(suggestCommute('metro', 12, 'unhealthy')).toBeNull();
    expect(suggestCommute('bicycle', 12, 'unhealthy')).toBeNull();
  });

  it('offers walking or cycling only when the air allows it, stricter with a heart or lung condition', () => {
    expect(suggestCommute('car', 2, 'sensitive')).toBe('walk');
    expect(suggestCommute('car', 2, 'sensitive', { sensitive: true })).toBe('bus');
    expect(suggestCommute('car', 6, 'moderate', { sensitive: true })).toBe('bicycle');
  });

  it('shows a real saving in the plan for an auto-rickshaw commuter, never 0 kg or an empty impact', () => {
    const plan = buildPlan(report({ usAqi: 168 }), profile({ commuteMode: 'auto', commuteKm: 12 }), 'en');
    const sw = plan.recommendations.find((r) => r.id === 'commute-switch');
    expect(sw?.title).toBe('Switch your auto-rickshaw commute to metro');
    expect(sw?.impact.co2KgPerMonth).toBeGreaterThan(0);
    expect(sw?.impact.explanation).not.toMatch(/= 0 kg/);
    expect(plan.co2KgPerMonthTotal).toBeGreaterThan(0);
  });
});

describe('every tip has a real impact, for every household and every air level', () => {
  it.each(COMMUTE_MODES)('commute: %s', (mode) => {
    for (const aqi of [40, 90, 130, 168, 250, 350]) {
      for (const extra of [
        {},
        { cooking: 'biomass', heating: 'gas', burnsWaste: true, hasRespiratory: true } as const,
      ]) {
        const plan = buildPlan(report({ usAqi: aqi }), profile({ commuteMode: mode, commuteKm: 7, ...extra }), 'en');
        for (const r of plan.recommendations) {
          const { co2KgPerMonth, exposureCutPct, removesSource } = r.impact;
          const real = (co2KgPerMonth ?? 0) > 0 || (exposureCutPct ?? 0) > 0 || removesSource === true;
          expect(real, `${mode} @${aqi}: ${r.id}`).toBe(true);
          expect(r.impact.explanation, r.id).not.toMatch(/= 0 kg|= −/);
        }
      }
    }
  });
});
