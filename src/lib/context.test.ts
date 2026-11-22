import { describe, expect, it } from 'vitest';
import { profile } from '../test/fixtures';
import { ABROAD, AQIS, INDIA, airReport } from '../test/scenarios';
import { buildContext, hourlyText, householdSummary } from './context';
import { buildPlan } from './recommend';

describe('assistant context', () => {
  it('labels windows, the trap and the hour list "tomorrow" when they fall on the next day', () => {
    const r = airReport({ aqi: 120, weather: 'nightTrap', startHour: 21, place: INDIA });
    const ctx = buildContext(r, profile(), buildPlan(r, profile(), 'en'), 'en');
    expect(ctx.bestWindow).toMatch(/tomorrow \(PM2\.5 ≈ \d+ µg\/m³\)$/);
    expect(ctx.smogTrap).toMatch(/^22:00 today to 08:00 tomorrow: wind ≈ 3 km\/h, mixing layer under 50 m/);
    expect(hourlyText(r, r.current.time)).toMatch(/^22:00 \d+, 23:00 \d+, 00:00 \(tomorrow\) \d+/);
    expect(hourlyText(r, r.current.time).match(/tomorrow/g)).toHaveLength(1);
  });

  it('says when no trap is expected and quotes the chips the person sees', () => {
    const r = airReport({ aqi: 155, weather: 'ozone', startHour: 6, place: ABROAD });
    const plan = buildPlan(r, profile(), 'en');
    const ctx = buildContext(r, profile(), plan, 'en');
    expect(ctx.smogTrap).toBe('none expected in the next 24 h');
    expect(ctx.bestWindow).toMatch(/today/);
    const ozone = ctx.recommendations.find((x) => x.title.startsWith('Ozone is the main pollutant'));
    expect(ozone?.impact).toBe('Cuts ozone while exercising ≈ 50%');
    const community = ctx.recommendations.find((x) => x.title.startsWith('Plan with neighbours'));
    expect(community?.impact).toMatch(/kg CO₂\/month, community figure; Cuts PM2.5 in the shared room ≈ 50%/);
  });

  it('leaves the windows empty when the forecast has none', () => {
    const r = airReport({ aqi: 120, weather: 'none', startHour: 6, place: INDIA });
    r.hourly = r.hourly.slice(0, 1);
    const ctx = buildContext(r, profile(), buildPlan(r, profile(), 'hi'), 'hi');
    expect(ctx.bestWindow).toBe('');
    expect(ctx.worstWindow).toBe('');
  });

  it('summarises every household detail, and leaves out what is not there', () => {
    const all = householdSummary(profile({ hasElderly: true, hasRespiratory: true, hasPurifier: true, burnsWaste: true }), 'en');
    expect(all).toMatch(/children, elderly, someone with a heart\/lung condition, commute .+ 10 km one-way/);
    expect(all).toMatch(/has purifier, waste or leaves burned nearby$/);
    const none = householdSummary(profile({ hasChildren: false, commuteMode: 'wfh' }), 'en');
    expect(none).toMatch(/^4 people, works from home, .+no purifier$/);
  });

  it('marks each item with the group the screen shows it in, so the AI summary ranks the same way', () => {
    for (const aqi of [40, 163, 260]) {
      const r = airReport({ aqi, weather: 'nightTrap', startHour: 6, place: INDIA });
      const plan = buildPlan(r, profile(), 'en');
      const ctx = buildContext(r, profile(), plan, 'en');
      const want = plan.recommendations.map((x) => (x.safety ? 'safety' : x.priority === 1 ? 'first' : 'more'));
      expect(ctx.recommendations.map((x) => x.group)).toEqual(want.slice(0, ctx.recommendations.length));
      expect(ctx.recommendations.filter((x) => x.group === 'first').length).toBeLessThanOrEqual(3);
    }
  });

  it('never sends a zero combined total, and sends every non-zero one', () => {
    let omitted = 0;
    for (const aqi of AQIS) {
      for (const p of [profile(), profile({ commuteMode: 'wfh', exerciseMinutes: 0 }), profile({ commuteMode: 'car', commuteKm: 15 })]) {
        const r = airReport({ aqi, weather: 'none', startHour: 9, place: ABROAD });
        const plan = buildPlan(r, p, 'en');
        const ctx = buildContext(r, p, plan, 'en');
        expect(ctx.doseCutPct).not.toBe(0);
        expect(ctx.co2KgPerMonth).not.toBe(0);
        expect(ctx.doseCutPct).toBe(plan.dose.cutPct || undefined);
        expect(ctx.co2KgPerMonth).toBe(plan.co2KgPerMonthTotal || undefined);
        if (ctx.co2KgPerMonth === undefined || ctx.doseCutPct === undefined) omitted += 1;
      }
    }
    expect(omitted).toBeGreaterThan(0);
  });

  it('carries the US EPA band statement for every band but Good, naming the household\'s sensitive members', () => {
    const asthma = profile({ hasChildren: false, hasRespiratory: true });
    const wellington = airReport({ aqi: 52, weather: 'none', startHour: 9, place: ABROAD });
    const ctx = buildContext(wellington, asthma, buildPlan(wellington, asthma, 'en'), 'en');
    expect(ctx.epaBand).toMatch(/^US EPA guidance for Moderate air .*unusually sensitive people .* someone with a heart or lung condition/);
    const good = airReport({ aqi: 20, weather: 'none', startHour: 9, place: ABROAD });
    expect(buildContext(good, asthma, buildPlan(good, asthma, 'en'), 'en')).not.toHaveProperty('epaBand');
  });
});
