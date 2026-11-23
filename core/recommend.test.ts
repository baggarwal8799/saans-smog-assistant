import { describe, expect, it } from 'vitest';

import { planIds as ids, profile, report } from '../test/fixtures.js';
import { ABROAD, airReport } from '../test/scenarios.js';
import { bilingual } from './copy/text.js';
import { suggestCommute } from './plan/commute.js';
import type { RecDraft } from './plan/rule.js';
import { buildPlan, isMaterial } from './recommend.js';

describe('suggestCommute', () => {
  it('suggests walking or cycling for short trips on tolerable days', () => {
    expect(suggestCommute('car', 2, 'sensitive')).toBe('walk');
    expect(suggestCommute('motorbike', 6, 'sensitive')).toBe('bicycle');
  });

  it('suggests public transport on very polluted days, even for short trips', () => {
    expect(suggestCommute('car', 2, 'unhealthy')).toBe('bus');
  });

  it('leaves low-emission modes alone', () => {
    expect(suggestCommute('metro', 10, 'unhealthy')).toBeNull();
    expect(suggestCommute('wfh', 10, 'unhealthy')).toBeNull();
    expect(suggestCommute('car', 0, 'unhealthy')).toBeNull();
  });
});

describe('buildPlan', () => {
  it('covers all three parts of the brief: routines, indoor air and sustainable swaps', () => {
    const plan = buildPlan(report(), profile(), 'en');
    const cats = new Set(plan.recommendations.map((r) => r.category));
    expect(cats).toEqual(new Set(['routine', 'indoor', 'swap', 'community']));
  });

  it('scopes every percentage so it is never read as a whole-day cut', () => {
    const plan = buildPlan(report(), profile({ burnsWaste: true, heating: 'coal' }), 'en');
    for (const r of plan.recommendations) {
      if (r.impact.exposureCutPct !== undefined) {
        expect(r.impact.scope, r.id).toBeTruthy();
        expect(r.impact.exposureCutPct, r.id).toBeLessThan(100);
      }
    }
    const sources = plan.recommendations.filter((r) => r.impact.removesSource).map((r) => r.id);
    expect(sources).toEqual(expect.arrayContaining(['safe-heating', 'stop-burning', 'no-smoke-indoors']));
  });

  it('gives every recommendation an explained, quantified impact', () => {
    const plan = buildPlan(report(), profile({ burnsWaste: true, heating: 'coal', cooking: 'biomass' }), 'en');
    for (const r of plan.recommendations) {
      expect(r.impact.explanation.length).toBeGreaterThan(30);
      const quantified = (r.impact.co2KgPerMonth ?? 0) + (r.impact.exposureCutPct ?? 0) > 0 || !!r.impact.removesSource;
      expect(quantified, r.id).toBe(true);
    }
  });

  it('keeps life-safety items in their own group, so they take none of the three "do first" slots', () => {
    const plan = buildPlan(
      report(),
      profile({ heating: 'coal', cooking: 'biomass', hasElderly: true, burnsWaste: true }),
      'en',
    );
    const safety = plan.recommendations.filter((r) => r.safety).map((r) => r.id);
    const urgent = plan.recommendations.filter((r) => r.priority === 1 && !r.safety).map((r) => r.id);
    expect(safety).toEqual(['safe-heating', 'clean-cooking']);
    expect(urgent).toEqual(['protect-vulnerable', 'exercise-indoors', 'n95']);
  });

  it('on a clean-air day nothing but safety is "do first"', () => {
    const plan = buildPlan(report({ usAqi: 30 }), profile({ heating: 'gas', burnsWaste: true }), 'en');
    expect(plan.concern).toBe('low');
    expect(plan.recommendations.filter((r) => r.priority === 1).map((r) => r.id)).toEqual(['gas-heater-safety']);
  });

  it('orders by priority', () => {
    const p = buildPlan(report(), profile(), 'en').recommendations.map((r) => r.priority);
    expect(p).toEqual([...p].sort((a, b) => a - b));
  });

  it('on a very unhealthy day moves exercise indoors and recommends N95s', () => {
    const plan = buildPlan(report({ usAqi: 260 }), profile(), 'en');
    expect(ids(plan)).toEqual(expect.arrayContaining(['exercise-indoors', 'n95', 'commute-switch']));
  });

  it('protects vulnerable members: worst window on a sensitive-groups day, the whole day above it', () => {
    const find = (aqi: number) =>
      buildPlan(report({ usAqi: aqi }), profile({ hasElderly: true }), 'en').recommendations.find(
        (r) => r.id === 'protect-vulnerable',
      );
    expect(find(120)?.title).toContain('19:00');
    expect(find(170)?.title).toBe('All day today: no long or hard outdoor activity for children and elders');
    expect(find(260)?.title).toBe('Keep children and elders indoors all day today');
    // The worst window stays as an extra.
    expect(find(260)?.detail).toContain('19:00');
    expect(
      buildPlan(
        report(),
        profile({ hasChildren: false, hasElderly: false, hasRespiratory: false }),
        'en',
      ).recommendations.map((r) => r.id),
    ).not.toContain('protect-vulnerable');
  });

  it('flags coal heating as a safety issue and biomass cooking as top priority', () => {
    const plan = buildPlan(report(), profile({ heating: 'coal', cooking: 'biomass' }), 'en');
    expect(plan.recommendations.find((r) => r.id === 'safe-heating')?.priority).toBe(1);
    expect(plan.recommendations.find((r) => r.id === 'clean-cooking')?.priority).toBe(1);
    expect(ids(plan)).not.toContain('kitchen-exhaust');
  });

  it('suggests a DIY purifier only when there is none', () => {
    expect(ids(buildPlan(report(), profile({ hasPurifier: false }), 'en'))).toContain('diy-purifier');
    expect(ids(buildPlan(report(), profile({ hasPurifier: true }), 'en'))).not.toContain('diy-purifier');
  });

  it('adds waste-burning advice only when relevant', () => {
    expect(ids(buildPlan(report(), profile({ burnsWaste: true }), 'en'))).toContain('stop-burning');
    expect(ids(buildPlan(report(), profile({ burnsWaste: false }), 'en'))).not.toContain('stop-burning');
  });

  it('counts the recommended switch in the CO2 total, and carpooling only when no switch is offered', () => {
    for (const km of [2, 10, 30]) {
      const plan = buildPlan(report(), profile({ commuteMode: 'car', commuteKm: km }), 'en');
      const co2 = (id: string) => plan.recommendations.find((r) => r.id === id)?.impact.co2KgPerMonth ?? 0;
      expect(plan.co2KgPerMonthTotal).toBeCloseTo(co2('commute-switch'), 1);
    }
    // A short trip in a car on a moderate day suggests walking; with no switch, carpooling counts.
    const noSwitch = buildPlan(report({ usAqi: 260 }), profile({ commuteMode: 'car', commuteKm: 0 }), 'en');
    expect(noSwitch.co2KgPerMonthTotal).toBe(0);
  });

  it('reports zero CO2 for an already low-emission household', () => {
    const plan = buildPlan(report(), profile({ commuteMode: 'metro' }), 'en');
    expect(plan.co2KgPerMonthTotal).toBe(0);
  });

  it('cuts the inhaled dose substantially by following the plan', () => {
    const plan = buildPlan(report(), profile(), 'en');
    expect(plan.dose.withPlanUg).toBeLessThan(plan.dose.baselineUg);
    expect(plan.dose.cutPct).toBeGreaterThanOrEqual(30);
    expect(plan.cigarettesPerDay).toBeGreaterThan(5);
  });

  it('handles households without exercise or commute', () => {
    const plan = buildPlan(report(), profile({ exerciseMinutes: 0, commuteMode: 'wfh', commuteKm: 0 }), 'en');
    expect(ids(plan)).not.toContain('exercise-indoors');
    expect(ids(plan)).not.toContain('commute-switch');
  });

  it('localises to Hindi with the same structure', () => {
    const en = buildPlan(report(), profile(), 'en');
    const hi = buildPlan(report(), profile(), 'hi');
    expect(hi.recommendations.map((r) => r.id)).toEqual(en.recommendations.map((r) => r.id));
    expect(hi.recommendations[0]?.title).toMatch(/[ऀ-ॿ]/);
  });
});

describe('ozone and materiality edge cases', () => {
  it('warns of an ozone peak only when the forecast has ozone figures for it', () => {
    const ozoneDay = airReport({ aqi: 155, weather: 'ozone', startHour: 6, place: ABROAD });
    expect(ids(buildPlan(ozoneDay, profile(), 'en'))).toContain('ozone-effort');
    const noOzone = {
      ...ozoneDay,
      hourly: ozoneDay.hourly.map((p) => ({ time: p.time, pm25: p.pm25, usAqi: p.usAqi })),
    };
    expect(ids(buildPlan(noOzone, profile(), 'en'))).not.toContain('ozone-effort');
  });

  it('drops a protect-only tip that claims no exposure cut at all', () => {
    const draft: RecDraft = {
      id: 'n95',
      category: 'routine',
      priority: 1,
      title: bilingual('t', 't'),
      detail: bilingual('d', 'd'),
      explanation: bilingual('e', 'e'),
      impact: {},
    };
    expect(isMaterial(draft, 'high')).toBe(false);
    expect(isMaterial({ ...draft, impact: { removesSource: true } }, 'high')).toBe(true);
  });
});
