/**
 * Household invariants: US EPA activity actions are never cut from "Do these first", no
 * "keep windows shut" on a Moderate day, no India-only terms abroad, and a dose that starts from what the household
 * already does and says which tips it assumes.
 */
import { describe, expect, it } from 'vitest';
import { doseHeadline } from '../chips';
import { INDOOR_RATIO, dailyDoseUg, round } from '../impact';
import { sampleProfile } from '../profile';
import { buildPlan, draftsFor, ruleInput } from '../recommend';
import { averagePm25 } from '../windows';
import type { Place } from '../types';
import { profile } from '../../test/fixtures';
import { airReport } from '../../test/scenarios';
import { rec, texts, violations } from '../../test/planChecks';

const LAHORE: Place = { name: 'Lahore', lat: 31.55, lon: 74.34, country: 'Pakistan' };
const LOS_ANGELES: Place = { name: 'Los Angeles', lat: 34.05, lon: -118.24, region: 'California', country: 'United States' };
/** An order to keep windows shut, as opposed to a statement about smoggy days. */
const KEEP_SHUT = /\bkeep (the )?windows (shut|closed)\b|\b(shut|close) (the |your )?windows\b|\bshut them again\b|खिड़कियाँ बंद (रखें|करें)|फिर बंद कर दें/i;
/** Words, schemes and bodies that exist only in India. */
const INDIA_ONLY = /municipal|नगर निगम|\bRWA\b|Ujjwala|उज्ज्वला|angithi|अंगीठी|CPCB|cylinder|सिलेंडर|crèche|क्रेच|coil|कॉइल/i;

describe('US EPA activity actions lead "Do these first"', () => {
  it('every activity action a rule makes priority 1 survives the MAX_URGENT cut', () => {
    let checked = 0;
    expect(
      violations((c) =>
        draftsFor(ruleInput(c.report, c.profile))
          .filter((d) => d.epaActivity && d.priority === 1)
          .map((d) => {
            checked++;
            return rec(c, d.id)?.priority !== 1 && `${d.id} cut from "Do these first"`;
          }),
      ),
    ).toEqual([]);
    expect(checked).toBeGreaterThan(500);
  });

  it('the live case: Lahore, AQI 162, a smog trap and asthma, 60 min exercise keeps the workout tip first', () => {
    for (const aqi of [161, 162, 163]) {
      const plan = buildPlan(airReport({ aqi, weather: 'nightTrap', startHour: 9, place: LAHORE }), profile({ hasRespiratory: true, exerciseMinutes: 60 }), 'en');
      const urgent = plan.recommendations.filter((r) => r.priority === 1 && !r.safety).map((r) => r.id);
      expect(urgent.slice(0, 2)).toEqual(['protect-vulnerable', 'exercise-indoors']);
      expect(plan.recommendations.some((r) => r.id === 'smog-trap' && r.priority === 1)).toBe(true);
    }
  });
});

describe('airing on a Moderate day', () => {
  it('no tip orders windows shut when the concern is low or moderate, unless a smog trap applies', () => {
    expect(
      violations(({ plan }) =>
        plan.concern === 'low' || (plan.concern === 'moderate' && !plan.smogTrap)
          ? plan.recommendations.flatMap((r) => texts(r).map((t) => KEEP_SHUT.test(t) && `${r.id}: "${KEEP_SHUT.exec(t)?.[0]}" at ${plan.concern}`))
          : [],
      ),
    ).toEqual([]);
  });

  it('the live case: Los Angeles at PM2.5 ≈ 13 with gas cooking is told to air the house, especially while cooking', () => {
    const plan = buildPlan(airReport({ aqi: 55, weather: 'none', startHour: 9, place: LOS_ANGELES }), sampleProfile('United States'), 'en');
    expect(plan.concern).toBe('moderate');
    const tip = plan.recommendations.find((r) => r.id === 'ventilate-smart');
    expect(tip?.title).toMatch(/^Air the house as usual/);
    expect(tip?.detail).toMatch(/cooking on gas/);
    expect(plan.recommendations.flatMap(texts).join(' ')).not.toMatch(KEEP_SHUT);
  });
});

describe('localisation by place', () => {
  it('no India-only word, scheme or habit reaches a plan outside India', () => {
    expect(
      violations((c) =>
        c.place.country === 'India' || c.place.country === 'भारत'
          ? []
          : c.plan.recommendations.flatMap((r) => texts(r).map((t) => INDIA_ONLY.test(t) && `${r.id}: "${INDIA_ONLY.exec(t)?.[0]}"`)),
      ),
    ).toEqual([]);
  });
});

describe('the dose starts from what the household already does', () => {
  it('a household with a purifier gets no exposure cut credited to running a purifier', () => {
    expect(
      violations((c) => {
        if (!c.profile.hasPurifier) return [];
        const avg = averagePm25(c.report.hourly, c.report.current.pm25);
        const habit = round(dailyDoseUg(c.profile, avg, { indoorRatio: INDOOR_RATIO.purifier }));
        return [
          c.plan.dose.baselineUg !== habit && `baseline ${c.plan.dose.baselineUg} ≠ purifier habit ${habit}`,
          ...c.plan.recommendations.map((r) => !r.impact.community && /purifier|प्यूरीफ़ायर/i.test(r.title) && (r.impact.exposureCutPct ?? 0) > 0 && `${r.id} credits a purifier`),
        ];
      }),
    ).toEqual([]);
  });

  it('the live case: one person working from home with a purifier is shown no cut, in words', () => {
    const p = profile({ householdSize: 1, commuteMode: 'wfh', commuteKm: 0, exerciseMinutes: 0, hasPurifier: true, hasChildren: false });
    const plan = buildPlan(airReport({ aqi: 210, weather: 'none', startHour: 9, place: LOS_ANGELES }), p, 'en');
    expect(plan.dose.cutPct).toBe(0);
    expect(doseHeadline(plan, 'en')).not.toMatch(/%/);
  });

  it('a percentage headline says it assumes every tip, "More ways to help" included', () => {
    expect(
      violations((c) => {
        const head = doseHeadline(c.plan, c.lang);
        return [head.includes('%') && !/if you follow every tip|हर सुझाव मानें/.test(head) && `headline "${head}"`];
      }),
    ).toEqual([]);
  });
});
