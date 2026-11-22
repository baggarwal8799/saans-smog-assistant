import { describe, expect, it } from 'vitest';
import { profile } from '../test/fixtures';
import { ABROAD, AQIS, INDIA, airReport } from '../test/scenarios';
import { buildContext, hourlyText, householdSummary } from './context';
import { buildPlan } from './recommend';

describe('assistant context', () => {
  it('labels windows, the trap and the hour list "tomorrow" when they fall on the next day', () => {
    const r = airReport({ aqi: 120, weather: 'nightTrap', startHour: 21, place: INDIA });
    const ctx = buildContext({ report: r, profile: profile(), plan: buildPlan(r, profile(), 'en'), lang: 'en' });
    expect(ctx.bestWindow).toMatch(/tomorrow \(PM2\.5 ≈ \d+ µg\/m³\)$/);
    expect(ctx.smogTrap).toMatch(/^22:00 today to 08:00 tomorrow: wind ≈ 3 km\/h, mixing layer under 50 m/);
    expect(hourlyText(r, r.current.time)).toMatch(/^22:00 \d+, 23:00 \d+, 00:00 \(tomorrow\) \d+/);
    expect(hourlyText(r, r.current.time).match(/tomorrow/g)).toHaveLength(1);
  });

  it('says when no trap is expected and quotes the chips the person sees', () => {
    const r = airReport({ aqi: 155, weather: 'ozone', startHour: 6, place: ABROAD });
    const plan = buildPlan(r, profile(), 'en');
    const ctx = buildContext({ report: r, profile: profile(), plan, lang: 'en' });
    expect(ctx.smogTrap).toBe('none expected in the next 24 h');
    expect(ctx.bestWindow).toMatch(/today/);
    const ozone = ctx.recommendations.find((x) => x.title.startsWith('Ozone is the main pollutant'));
    expect(ozone?.impact).toBe('Cuts ozone while exercising ≈ 50%');
    const community = ctx.recommendations.find((x) => x.title.startsWith('Plan with neighbours'));
    expect(community?.impact).toMatch(/kg CO₂\/month, community figure; Cuts PM2.5 in the shared room ≈ 50%/);
  });

  it('groups a safety tip as safety, and falls back to the explanation when a tip has no chip to quote', () => {
    const r = airReport({ aqi: 210, weather: 'none', startHour: 9, place: INDIA });
    const plan = buildPlan(r, profile(), 'en');
    const [tip] = plan.recommendations;
    if (!tip) throw new Error('the plan has no tips');
    const safety = { ...tip, title: 'Never run a gas heater in a shut room', safety: true };
    const plain = { ...tip, title: 'Plain', priority: 2 as const, impact: { explanation: 'Why it helps' } };
    const ctx = buildContext({
      report: r,
      profile: profile(),
      plan: { ...plan, recommendations: [safety, plain] },
      lang: 'en',
    });
    expect(ctx.recommendations[0]?.group).toBe('safety');
    expect(ctx.recommendations[1]).toEqual({ title: 'Plain', impact: 'Why it helps', group: 'more' });
  });

  it('leaves the windows empty when the forecast has none', () => {
    const r = airReport({ aqi: 120, weather: 'none', startHour: 6, place: INDIA });
    r.hourly = r.hourly.slice(0, 1);
    const ctx = buildContext({ report: r, profile: profile(), plan: buildPlan(r, profile(), 'hi'), lang: 'hi' });
    expect(ctx.bestWindow).toBe('');
    expect(ctx.worstWindow).toBe('');
  });

  it('summarises every household detail, and leaves out what is not there', () => {
    const all = householdSummary(
      profile({ hasElderly: true, hasRespiratory: true, hasPurifier: true, burnsWaste: true }),
    );
    expect(all).toMatch(/children, elderly, someone with a heart\/lung condition, commute .+ 10 km one-way/);
    expect(all).toMatch(/has purifier, waste or leaves burned nearby$/);
    const none = householdSummary(profile({ hasChildren: false, commuteMode: 'wfh' }));
    expect(none).toMatch(/^4 people, works from home, .+no purifier$/);
  });

  it('writes the household in one language in a Hindi CONTEXT, not English labels with Hindi values', () => {
    const r = airReport({ aqi: 120, weather: 'none', startHour: 6, place: INDIA });
    const ctx = buildContext({ report: r, profile: profile(), plan: buildPlan(r, profile(), 'hi'), lang: 'hi' });
    expect(ctx.household).toBe(householdSummary(profile()));
    expect(ctx.household).not.toMatch(/\p{Script=Devanagari}/u);
  });

  it('marks each item with the group the screen shows it in, so the AI summary ranks the same way', () => {
    for (const aqi of [40, 163, 260]) {
      const r = airReport({ aqi, weather: 'nightTrap', startHour: 6, place: INDIA });
      const plan = buildPlan(r, profile(), 'en');
      const ctx = buildContext({ report: r, profile: profile(), plan, lang: 'en' });
      const group = (x: (typeof plan.recommendations)[number]) => {
        if (x.safety) return 'safety';
        return x.priority === 1 ? 'first' : 'more';
      };
      const want = plan.recommendations.map(group);
      expect(ctx.recommendations.map((x) => x.group)).toEqual(want.slice(0, ctx.recommendations.length));
      expect(ctx.recommendations.filter((x) => x.group === 'first').length).toBeLessThanOrEqual(3);
    }
  });

  it('never sends a zero combined total, and sends every non-zero one', () => {
    let omitted = 0;
    for (const aqi of AQIS) {
      for (const p of [
        profile(),
        profile({ commuteMode: 'wfh', exerciseMinutes: 0 }),
        profile({ commuteMode: 'car', commuteKm: 15 }),
      ]) {
        const r = airReport({ aqi, weather: 'none', startHour: 9, place: ABROAD });
        const plan = buildPlan(r, p, 'en');
        const ctx = buildContext({ report: r, profile: p, plan, lang: 'en' });
        expect(ctx.doseCutPct).not.toBe(0);
        expect(ctx.co2KgPerMonth).not.toBe(0);
        expect(ctx.doseCutPct).toBe(plan.dose.cutPct || undefined);
        expect(ctx.co2KgPerMonth).toBe(plan.co2KgPerMonthTotal || undefined);
        if (ctx.co2KgPerMonth === undefined || ctx.doseCutPct === undefined) omitted += 1;
      }
    }
    expect(omitted).toBeGreaterThan(0);
  });

  it("carries the US EPA band statement for every band but Good, naming the household's sensitive members", () => {
    const asthma = profile({ hasChildren: false, hasRespiratory: true });
    const wellington = airReport({ aqi: 52, weather: 'none', startHour: 9, place: ABROAD });
    const ctx = buildContext({
      report: wellington,
      profile: asthma,
      plan: buildPlan(wellington, asthma, 'en'),
      lang: 'en',
    });
    expect(ctx.epaBand).toMatch(
      /^US EPA guidance for Moderate air .*unusually sensitive people .* someone with a heart or lung condition/,
    );
    const good = airReport({ aqi: 20, weather: 'none', startHour: 9, place: ABROAD });
    expect(
      buildContext({ report: good, profile: asthma, plan: buildPlan(good, asthma, 'en'), lang: 'en' }),
    ).not.toHaveProperty('epaBand');
  });
});
