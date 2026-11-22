import { describe, expect, it } from 'vitest';
import { profile, report } from '../test/fixtures';
import { suggestCommute } from './plan/commute';
import { buildPlan } from './recommend';

const ids = (plan: ReturnType<typeof buildPlan>) => plan.recommendations.map((r) => r.id);

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
      const quantified = (r.impact.co2KgPerMonth ?? 0) + (r.impact.exposureCutPct ?? 0) > 0 || r.impact.removesSource === true;
      expect(quantified, r.id).toBe(true);
    }
  });

  it('keeps life-safety items in their own group, so they take none of the three "do first" slots', () => {
    const plan = buildPlan(report(), profile({ heating: 'coal', cooking: 'biomass', hasElderly: true, burnsWaste: true }), 'en');
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

  it('on a moderate day schedules exercise in the cleanest window and skips masks', () => {
    const plan = buildPlan(report({ usAqi: 90 }), profile(), 'en');
    expect(ids(plan)).toContain('exercise-window');
    expect(ids(plan)).not.toContain('n95');
    expect(plan.bestWindow?.start).toBe('2026-11-17T14:00');
    expect(plan.recommendations.find((x) => x.id === 'exercise-window')?.impact.scope).toBe('while exercising');
  });

  it('protects vulnerable household members: the worst window on a sensitive-groups day, the whole day above it', () => {
    const find = (aqi: number) => buildPlan(report({ usAqi: aqi }), profile({ hasElderly: true }), 'en').recommendations.find((r) => r.id === 'protect-vulnerable');
    expect(find(120)?.title).toContain('19:00');
    expect(find(170)?.title).toBe('All day today: no long or hard outdoor activity for children and elders');
    expect(find(260)?.title).toBe('Keep children and elders indoors all day today');
    // The worst window stays as an extra.
    expect(find(260)?.detail).toContain('19:00');
    expect(buildPlan(report(), profile({ hasChildren: false, hasElderly: false, hasRespiratory: false }), 'en').recommendations.map((r) => r.id)).not.toContain(
      'protect-vulnerable',
    );
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

  it('moves workouts indoors from "Unhealthy" (AQI 151), per US EPA guidance', () => {
    expect(ids(buildPlan(report({ usAqi: 151 }), profile(), 'en'))).toContain('exercise-indoors');
    expect(ids(buildPlan(report({ usAqi: 167 }), profile(), 'en'))).not.toContain('exercise-window');
    expect(ids(buildPlan(report({ usAqi: 150 }), profile(), 'en'))).toContain('exercise-window');
  });

  it('says "tomorrow" whenever a window is on the next day', () => {
    const plan = buildPlan(report({ usAqi: 120 }, 18), profile({ hasElderly: true }), 'en');
    expect(plan.bestWindow?.start.slice(0, 10)).toBe('2026-11-18');
    const title = (id: string) => plan.recommendations.find((r) => r.id === id)?.title ?? '';
    expect(title('exercise-window')).toMatch(/^(Exercise outside|If you must exercise outside, go) tomorrow between \d\d:00 and \d\d:00$/);
    expect(title('ventilate-smart')).toMatch(/tomorrow around/);
    const hi = buildPlan(report({ usAqi: 120 }, 18), profile(), 'hi');
    expect(hi.recommendations.find((r) => r.id === 'exercise-window')?.title).toMatch(/^बाहर व्यायाम (करना ही हो तो )?कल /);
    const today = buildPlan(report({ usAqi: 120 }, 6), profile(), 'en');
    expect(today.recommendations.find((r) => r.id === 'exercise-window')?.title).not.toMatch(/tomorrow/);
  });

  it('on an ozone day leads with ozone timing and says masks do not filter it', () => {
    const r = report({ usAqi: 175, dominant: 'o3' });
    // Smoggy evening (PM2.5) but an afternoon ozone peak: the ozone advice must point at the afternoon.
    r.hourly = r.hourly.map((p) => ({ ...p, o3: Number(p.time.slice(11, 13)) >= 12 && Number(p.time.slice(11, 13)) <= 16 ? 300 : 40 }));
    const plan = buildPlan(r, profile(), 'en');
    const ozone = plan.recommendations.find((x) => x.id === 'ozone-effort');
    expect(ozone?.priority).toBe(1);
    // The chip names the pollutant once ("Cuts ozone while exercising"), so the scope is only where it applies.
    expect(ozone?.impact).toMatchObject({ scope: 'while exercising', pollutant: 'ozone' });
    expect(ozone?.title).toMatch(/from 1[2-5]:00 to 1[3-7]:00/);
    expect(ozone?.impact.explanation).toMatch(/Ozone averages ≈ 300 µg/);
    const mask = plan.recommendations.find((x) => x.id === 'n95');
    expect(mask?.priority).toBe(2);
    expect(mask?.detail).toMatch(/no mask filters ozone/);
    expect(ids(buildPlan(report(), profile(), 'en'))).not.toContain('ozone-effort');
  });

  it('starts windows at the next full hour, never the one already under way', () => {
    const r = report({ usAqi: 90 }, 14);
    const plan = buildPlan(r, profile(), 'en');
    // 14:00 today is the cleanest hour but already under way; tomorrow 13:00–15:00 (85 µg/m³) beats 15:00–17:00 (97.5).
    expect(plan.bestWindow).toEqual({ start: '2026-11-18T13:00', end: '2026-11-18T15:00', avgPm25: 85 });
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

  it('falls back to indoor exercise when no daytime window exists', () => {
    const r = report({ usAqi: 120 }, 22);
    r.hourly = r.hourly.slice(0, 6);
    const plan = buildPlan(r, profile(), 'en');
    expect(plan.bestWindow).toBeNull();
    expect(ids(plan)).toContain('exercise-indoors');
    expect(plan.recommendations.find((x) => x.id === 'ventilate-smart')?.title).toMatch(/Keep windows shut/);
  });
});
