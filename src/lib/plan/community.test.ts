import { describe, expect, it } from 'vitest';
import { buildPlan } from '../recommend';
import { profile, report } from '../../test/fixtures';

describe('community action', () => {
  it('always adds community action (at least the no-burning pledge), ranked by concern, and keeps it out of the household total', () => {
    const bad = buildPlan(report({ usAqi: 260 }), profile({ commuteMode: 'metro' }), 'en');
    const community = bad.recommendations.find((r) => r.id === 'community-plan');
    expect(community?.impact).toMatchObject({ community: true, exposureCutPct: 50, scope: 'in the shared room' });
    expect(community?.impact.co2KgPerMonth).toBeGreaterThan(0);
    expect(community?.priority).toBe(2);
    expect(bad.co2KgPerMonthTotal).toBe(0);
    const clean = buildPlan(report({ usAqi: 30 }), profile(), 'en').recommendations.find((r) => r.id === 'community-plan');
    expect(clean?.priority).toBe(3);
  });

  it('scales the community figures with the household: its own car route and its size', () => {
    const tip = (p: Parameters<typeof profile>[0]) => buildPlan(report(), profile(p), 'en').recommendations.find((r) => r.id === 'community-plan');
    // 4 to a car on the user's own 25 km: 3 × 1100 km × 0.17 kg/km.
    expect(tip({ commuteMode: 'car', commuteKm: 25 })?.impact.co2KgPerMonth).toBe(561);
    expect(tip({ commuteMode: 'car', commuteKm: 25 })?.impact.explanation).toMatch(/on your 25 km route/);
    expect(tip({ commuteMode: 'bus' })?.impact.explanation).toMatch(/on an example 10 km route/);
    // 20 homes × 4 people × 0.5 kg × 10 g/kg × 4.3 weeks.
    expect(tip({ householdSize: 4 })?.impact.explanation).toMatch(/20 homes × 4 people .* ≈ 1720 g of PM2.5/);
  });

  it('offers a pool only to a driver or a family with children, and reads cleanly for every combination', () => {
    for (const commuteMode of ['car', 'bus'] as const)
      for (const hasChildren of [true, false])
        for (const burnsWaste of [true, false])
          for (const usAqi of [30, 260])
            for (const lang of ['en', 'hi'] as const) {
              const plan = buildPlan(report({ usAqi }), profile({ commuteMode, hasChildren, burnsWaste }), lang);
              const r = plan.recommendations.find((x) => x.id === 'community-plan');
              const pool = commuteMode === 'car' || hasChildren;
              const label = `${commuteMode} kids=${String(hasChildren)} burns=${String(burnsWaste)} AQI ${usAqi} ${lang}`;
              expect(Boolean(r), label).toBe(true);
              if (!r) continue;
              const all = [r.title, r.detail, r.impact.explanation].join(' ');
              expect(/pool|कारपूल|साझा (सवारी|गाड़ी)/i.test(all), label).toBe(pool);
              expect(all, label).not.toMatch(/: [;,]|; ?;|, ?,|\band and\b|और और|:\s*[.।]|\s[.।]/);
              const parts = r.title.split(/: /)[1]?.split(/, | and | और /) ?? [];
              if (lang === 'en') expect(r.detail.startsWith(parts.length > 1 ? 'Set these up' : 'Set this up'), label).toBe(true);
            }
    const kidsOnly = buildPlan(report({ usAqi: 30 }), profile({ commuteMode: 'bus', hasChildren: true }), 'en').recommendations.find((x) => x.id === 'community-plan');
    expect(kidsOnly?.title).toBe('Plan with neighbours: pool rides and stop burning');
    expect(kidsOnly?.detail).toMatch(/: a school-run pool; and a no-burning pledge for leaves and garbage/);
  });
});

describe('community action everywhere', () => {
  it('gives even a car-free single person on a clean day abroad a no-burning pledge worded for the place', () => {
    const abroad = report({ usAqi: 25 });
    const tip = buildPlan({ ...abroad, place: { ...abroad.place, country: 'Switzerland' } }, profile({ householdSize: 1, hasChildren: false, commuteMode: 'metro' }), 'en')
      .recommendations.find((r) => r.id === 'community-plan');
    expect(tip?.detail).toMatch(/wood stoves or fireplaces/);
    expect(tip?.detail).not.toMatch(/carpool|leaves and garbage/);
    expect(tip?.impact).toMatchObject({ community: true, removesSource: true });
  });
});
