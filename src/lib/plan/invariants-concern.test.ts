/**
 * Invariants for the one concern level, the safety group, household tailoring, the indoor model and metro wording,
 * checked over ALL rendered plan text (titles, details, workings, scopes and chips), not just recommendation ids.
 */
import { describe, expect, it } from 'vitest';
import { cautious, concernLevel } from '../concern';
import { INDOOR_RATIO, dailyDoseUg, habitRatio, pctCut, round } from '../impact';
import { buildPlan, homeRatio } from '../recommend';
import { CONCERN_LEVELS, type RecId } from '../types';
import { averagePm25 } from '../windows';
import { profile } from '../../test/fixtures';
import { INDIA, airReport } from '../../test/scenarios';
import { CAUTION, MASK, ids, rec, shown, texts, violations } from '../../test/planChecks';
import { METRO_IF } from './shared';

describe('concernLevel', () => {
  it('follows the US EPA bands and takes the worse of the AQI and the current PM2.5', () => {
    expect(concernLevel(34, 2)).toBe('low'); // the live Reykjavik case
    expect(concernLevel(75, 5)).toBe('moderate');
    expect(concernLevel(120, 30)).toBe('high');
    expect(concernLevel(168, 80)).toBe('severe');
    expect(concernLevel(34, 60)).toBe('severe'); // a PM2.5 spike the 24-hour AQI has not caught up with
    expect(concernLevel(120, Number.NaN)).toBe('high');
  });

  it('is never lower for worse air', () => {
    const order = (aqi: number) => CONCERN_LEVELS.indexOf(concernLevel(aqi, 0));
    for (let aqi = 0; aqi < 500; aqi += 5) expect(order(aqi + 5)).toBeGreaterThanOrEqual(order(aqi));
  });
});

describe('one concern level for every phrase', () => {
  it('on a clean-air day no caution phrase appears anywhere, and nothing but safety is "do first"', () => {
    expect(
      violations((c) =>
        c.plan.concern !== 'low'
          ? []
          : c.plan.recommendations.flatMap((r) => [
              r.priority === 1 && !r.safety && `${r.id}: do first on a clean day`,
              ...shown(c, r).map((t) => CAUTION.exec(t)?.[0] && `${r.id}: "${CAUTION.exec(t)?.[0]}" in "${t}"`),
            ]),
      ),
    ).toEqual([]);
  });

  it('a mask is mentioned only when the mask tip is given, and the mask tip exactly when the concern is cautious', () => {
    expect(
      violations((c) => [
        ids(c).has('n95') !== cautious(c.plan.concern) && `n95 at ${c.plan.concern}`,
        ...c.plan.recommendations.flatMap((r) =>
          shown(c, r).map((t) => MASK.test(t) && !ids(c).has('n95') && `${r.id}: mask without the mask tip`),
        ),
      ]),
    ).toEqual([]);
  });

  it('indoor-fix and community priority never rise as the air gets cleaner', () => {
    for (const id of ['diy-purifier', 'ventilate-smart', 'community-plan'] as const) {
      const at = (aqi: number) => {
        const r = airReport({ aqi, weather: 'none', startHour: 6, place: INDIA });
        return (
          buildPlan(r, profile({ hasPurifier: false }), 'en').recommendations.find((x) => x.id === id)?.priority ?? 4
        );
      };
      const ladder = [20, 75, 120, 210].map(at);
      expect(ladder, id).toEqual([...ladder].sort((a, b) => b - a));
    }
  });
});

describe('tailoring and consistency', () => {
  it('changing the household size changes the waste and community figures', () => {
    expect(
      violations((c) => {
        const bigger = buildPlan(c.report, { ...c.profile, householdSize: c.profile.householdSize + 1 }, c.lang);
        const working = (id: RecId) => bigger.recommendations.find((r) => r.id === id)?.impact.explanation;
        return [
          rec(c, 'stop-burning') &&
            working('stop-burning') === rec(c, 'stop-burning')?.impact.explanation &&
            'waste figure ignores size',
          /Pledge|संकल्प/.test(working('community-plan') ?? '') &&
            working('community-plan') === rec(c, 'community-plan')?.impact.explanation &&
            'community figure ignores size',
          bigger.dose.people !== c.profile.householdSize + 1 && 'dose ignores size',
        ];
      }),
    ).toEqual([]);
  });

  it('the dose baseline is the household habit, and the plan credits every home cut a tip claims', () => {
    expect(
      violations((c) => {
        const avg = averagePm25(c.report.hourly, c.report.current.pm25);
        const baseline = round(dailyDoseUg(c.profile, avg, { indoorRatio: habitRatio(c.profile) }));
        // A purifier household's baseline is already a shut, filtered room: window tips keep it working.
        const planIds = new Set(c.plan.recommendations.map((r) => r.id));
        const credited = c.profile.hasPurifier ? 100 : pctCut(INDOOR_RATIO.open, homeRatio(planIds));
        const home = c.plan.recommendations.filter((r) => /at home|घर पर/.test(r.impact.scope ?? ''));
        return [
          c.plan.dose.baselineUg !== baseline && `baseline ${c.plan.dose.baselineUg} ≠ habit ${baseline}`,
          ...home.map(
            (r) =>
              (r.impact.exposureCutPct ?? 0) > credited &&
              `${r.id}: claims ${r.impact.exposureCutPct}%, dose credits ${credited}%`,
          ),
        ];
      }),
    ).toEqual([]);
  });

  it('every metro suggestion is conditional on a line serving the route', () => {
    expect(
      violations((c) =>
        // A metro commuter's own mode is named, not suggested.
        (c.profile.commuteMode === 'metro' ? [] : c.plan.recommendations).map((r) => {
          const all = texts(r).join(' ');
          return /metro|मेट्रो/i.test(all) && !all.toLowerCase().includes(METRO_IF[c.lang].toLowerCase())
            ? `${r.id}: unconditional metro`
            : '';
        }),
      ),
    ).toEqual([]);
  });

  it('community action is always there (the no-burning pledge at least), as a community figure, ranked by concern', () => {
    expect(
      violations((c) => {
        const r = rec(c, 'community-plan');
        const pool = c.profile.commuteMode === 'car' || c.profile.hasChildren;
        const said = r ? texts(r).join(' ') : '';
        return [
          !r && 'community tip missing',
          r && !r.impact.community && 'not a community figure',
          r && r.priority !== (cautious(c.plan.concern) ? 2 : 3) && `priority ${r.priority}`,
          !pool && /pool|कारपूल|साझा (सवारी|गाड़ी)/i.test(said) && 'carpool without a car commute or children',
          !pool && r?.impact.co2KgPerMonth !== undefined && 'pool CO₂ without a pool',
        ];
      }),
    ).toEqual([]);
  });
});
