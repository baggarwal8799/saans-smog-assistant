/**
 * Relevance invariants: only members the household has, no big percentage for a tiny benefit, advice that fits the
 * place, and US EPA health actions ranked above emissions advice.
 */
import { describe, expect, it } from 'vitest';

import { profile } from '../../test/fixtures.js';
import { percents, rec, shown, violations } from '../../test/planChecks.js';
import { ABROAD, airReport, type Case, INDIA } from '../../test/scenarios.js';
import { doseHeadline } from '../chips.js';
import { MOSQUITO_MAX_ABS_LAT } from '../place.js';
import { buildPlan } from '../recommend.js';
import type { Place, Recommendation } from '../types.js';
import { SCOPE } from './copy/shared.js';
import { MIN_EXPOSURE_CUT_PCT } from './rule.js';

const REYKJAVIK: Place = { name: 'Reykjavík', lat: 64.15, lon: -21.94, country: 'Iceland' };
/** A tip that only protects the people breathing: no CO₂, no source removed, not a safety step. */
const protectsOnly = (r: Recommendation): boolean => !r.impact.co2KgPerMonth && !r.impact.removesSource && !r.safety;
/** Source tips: removing a smoke source, or cutting the home's own cooking smoke (a clean day does not shrink it). */
const sourceTip = (c: Case, r: Recommendation): boolean =>
  r.impact.removesSource === true || r.impact.scope === SCOPE.kitchen[c.lang];

/** Each member flag and the words that name that member, in both languages. */
const MEMBER_WORDS = [
  ['hasChildren', /child|\bkids?\b|बच्च/i],
  ['hasElderly', /elder|older people|बुज़ुर्ग/i],
  ['hasRespiratory', /heart|lung|asthma|दिल|फेफड़|अस्थमा/i],
] as const;

describe('advice names only the household members who exist', () => {
  it('no tip mentions children, elders or a heart or lung condition the profile does not have', () => {
    expect(
      violations((c) =>
        c.plan.recommendations.flatMap((r) =>
          shown(c, r).flatMap((t) =>
            MEMBER_WORDS.map(
              ([flag, re]) => !c.profile[flag] && re.test(t) && `${r.id}: "${re.exec(t)?.[0]}" without ${flag}`,
            ),
          ),
        ),
      ),
    ).toEqual([]);
  });

  it('the live case: an elder with asthma and no children gets no child-size mask line', () => {
    const r = airReport({ aqi: 210, weather: 'none', startHour: 6, place: INDIA });
    const mask = buildPlan(
      r,
      profile({ hasChildren: false, hasElderly: true, hasRespiratory: true }),
      'en',
    ).recommendations.find((x) => x.id === 'n95');
    expect(mask?.detail).not.toMatch(/child/i);
    expect(mask?.detail).toMatch(/doctor/);
  });
});

describe('materiality: no big percentage for a tiny benefit', () => {
  it(`every exposure-only tip cuts at least ${MIN_EXPOSURE_CUT_PCT}%`, () => {
    expect(
      violations((c) =>
        c.plan.recommendations.map(
          (r) =>
            protectsOnly(r) &&
            (r.impact.exposureCutPct ?? 0) < MIN_EXPOSURE_CUT_PCT &&
            `${r.id}: ${String(r.impact.exposureCutPct)}%`,
        ),
      ),
    ).toEqual([]);
  });

  it('on a clean-air day only source removal or safety shows 20% or more, and the dose line gives µg, not %', () => {
    expect(
      violations((c) => {
        if (c.plan.concern !== 'low') return [];
        const head = doseHeadline(c.plan, c.lang);
        return [
          ...c.plan.recommendations.flatMap((r) =>
            sourceTip(c, r) || r.safety
              ? []
              : shown(c, r).flatMap((t) => percents(t).map((p) => p >= 20 && `${r.id}: ${p}% in "${t}"`)),
          ),
          (head.includes('%') || !head.includes('µg')) && `dose line "${head}"`,
        ];
      }),
    ).toEqual([]);
  });

  it('Reykjavik, AQI 31 and almost no PM2.5: no purifier, no DIY filter, no exercise window, no 52% dose claim', () => {
    for (const hasPurifier of [false, true]) {
      const plan = buildPlan(
        airReport({ aqi: 31, weather: 'ozone', startHour: 6, place: REYKJAVIK }),
        profile({ hasPurifier, exerciseMinutes: 30 }),
        'en',
      );
      const ids = plan.recommendations.map((r) => r.id);
      expect(ids).not.toContain('diy-purifier');
      expect(ids).not.toContain('exercise-window');
      expect(doseHeadline(plan, 'en')).toMatch(/^Today’s air is clean: you breathe about \d+ µg of PM2\.5 a day\./);
      expect(doseHeadline(plan, 'hi')).toMatch(/µg/);
    }
  });

  it('a smoggy day keeps the percentage headline', () => {
    const plan = buildPlan(airReport({ aqi: 210, weather: 'none', startHour: 6, place: INDIA }), profile(), 'en');
    expect(doseHeadline(plan, 'en')).toBe(`${plan.dose.cutPct}% less pollution in your lungs if you follow every tip`);
  });
});

describe('relevance by place', () => {
  it(`no coil advice beyond ${MOSQUITO_MAX_ABS_LAT}° latitude; incense alone is low priority on smoggy days`, () => {
    expect(
      violations((c) => {
        const far = Math.abs(c.place.lat) > MOSQUITO_MAX_ABS_LAT;
        const smoke = rec(c, 'no-smoke-indoors');
        return [
          ...(far
            ? c.plan.recommendations.flatMap((r) =>
                shown(c, r).map((t) => /coil|कॉइल/i.test(t) && `${r.id}: coil at ${c.place.lat}°`),
              )
            : []),
          far &&
            smoke &&
            (smoke.priority !== 3 || c.plan.concern === 'low') &&
            `incense tip p${smoke.priority} at ${c.plan.concern}`,
          !far && !smoke && 'no coil tip in mosquito country',
        ];
      }),
    ).toEqual([]);
  });

  it('Reykjavik gets no coil tip; Delhi does', () => {
    const ids = (place: Place) =>
      buildPlan(airReport({ aqi: 120, weather: 'none', startHour: 6, place }), profile(), 'en').recommendations;
    expect(ids(REYKJAVIK).find((r) => r.id === 'no-smoke-indoors')?.title).toBe(
      'Skip incense and candles on smoggy days',
    );
    expect(ids(INDIA).find((r) => r.id === 'no-smoke-indoors')?.title).toMatch(/mosquito coils/);
  });
});

describe('US EPA health actions outrank emissions advice', () => {
  it('above AQI 150 "move the workout indoors" stays in "Do these first" unless 3 health items outrank it', () => {
    expect(
      violations(({ plan, report, profile: p }) => {
        if (report.current.usAqi <= 150 || p.exerciseMinutes <= 0) return [];
        const urgent = plan.recommendations.filter((r) => r.priority === 1 && !r.safety);
        const inside = urgent.some((r) => r.id === 'exercise-indoors');
        return [
          !inside &&
            urgent.filter(protectsOnly).length < 3 &&
            `exercise-indoors demoted behind ${urgent.map((r) => r.id).join(', ')}`,
        ];
      }),
    ).toEqual([]);
  });

  it('the live case: AQI 168, a driver who exercises keeps the workout tip above the commute switch', () => {
    const r = airReport({ aqi: 168, weather: 'none', startHour: 6, place: ABROAD });
    const plan = buildPlan(
      r,
      profile({ commuteMode: 'car', commuteKm: 10, exerciseMinutes: 30, hasChildren: false }),
      'en',
    );
    const order = plan.recommendations.map((x) => x.id);
    expect(plan.recommendations.find((x) => x.id === 'exercise-indoors')?.priority).toBe(1);
    expect(order.indexOf('exercise-indoors')).toBeLessThan(order.indexOf('commute-switch'));
  });
});
