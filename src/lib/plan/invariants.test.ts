/**
 * Rules that must hold for EVERY plan, checked across the whole scenario grid (src/test/scenarios.ts) instead of
 * one hand-picked case per bug. Language, locale and wording rules: invariants-text.test.ts. Proportionality,
 * facts and cross-tip rules: invariants-proportion.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { findWindow } from '../windows';
import { HEATING_TYPES, COMMUTE_MODES, COOKING_FUELS, type RecId, type Recommendation } from '../types';
import {
  AQIS,
  DISTANCES,
  HOUSEHOLD_FLAGS,
  LANGS,
  PLACES,
  START_HOURS,
  WEATHERS,
  cases,
  type Case,
} from '../../test/scenarios';
import { SAFETY_IDS, ids, percents, rec, texts, titleSpan, overlaps, violations } from '../../test/planChecks';
import { activeTravelOk } from '../concern';
import { MAX_URGENT } from '../recommend';

const BAD_TEXT = /= 0 kg|= −|NaN|undefined|null|Infinity|\{/;
const realImpact = ({ impact: i }: Recommendation): boolean =>
  (i.co2KgPerMonth ?? 0) > 0 ||
  (i.exposureCutPct !== undefined && i.exposureCutPct > 0 && i.exposureCutPct < 100) ||
  i.removesSource === true;

/** The ozone peak the ozone tip warns about, when it is present. */
function ozonePeak(c: Case) {
  return rec(c, 'ozone-effort') ? findWindow(c.report.hourly.slice(1), 2, 'worst', (p) => p.o3 ?? 0) : null;
}

describe('the scenario grid', () => {
  it('covers every value of every dimension many times', () => {
    const all = cases();
    const count = (pred: (c: Case) => boolean) => all.filter(pred).length;
    const dims: [string, readonly unknown[], (c: Case) => unknown][] = [
      ['commute', COMMUTE_MODES, (c) => c.profile.commuteMode],
      ['km', DISTANCES, (c) => c.profile.commuteKm],
      ['heating', HEATING_TYPES, (c) => c.profile.heating],
      ['cooking', COOKING_FUELS, (c) => c.profile.cooking],
      ['aqi', AQIS, (c) => c.aqi],
      ['weather', WEATHERS, (c) => c.weather],
      ['lang', LANGS, (c) => c.lang],
      ['place', PLACES.map((p) => p.country), (c) => c.place.country],
      ['start', START_HOURS, (c) => c.startHour],
      ...HOUSEHOLD_FLAGS.flatMap((f) =>
        [true, false].map((v): [string, readonly unknown[], (c: Case) => unknown] => [
          `${f}=${v}`,
          [v],
          (c) => c.profile[f],
        ]),
      ),
    ];
    for (const [name, values, of] of dims)
      for (const v of values)
        expect(
          count((c) => of(c) === v),
          `${name}=${String(v)}`,
        ).toBeGreaterThanOrEqual(50);
    expect(all.length).toBeGreaterThan(2500);
  });
});

describe('plan invariants', () => {
  it('1. every recommendation has a real impact and clean text', () => {
    expect(
      violations((c) =>
        c.plan.recommendations.flatMap((r) => [
          !realImpact(r) && `${r.id}: no real impact`,
          ...texts(r).map((t) => BAD_TEXT.test(t) && `${r.id}: "${t}"`),
        ]),
      ),
    ).toEqual([]);
  });

  it('2. every exposure percentage is scoped, and no percentage claim is above 100 or below 1', () => {
    expect(
      violations((c) =>
        c.plan.recommendations.flatMap((r) => [
          r.impact.exposureCutPct !== undefined && !r.impact.scope && `${r.id}: unscoped %`,
          ...texts(r).flatMap((t) => percents(t).map((p) => (p > 100 || p < 1) && `${r.id}: ${p}% in "${t}"`)),
        ]),
      ),
    ).toEqual([]);
  });

  it('3a. no suggested outdoor time overlaps the smog trap, the worst window or a warned ozone peak', () => {
    expect(
      violations((c) => {
        const { plan, report } = c;
        const out = [
          plan.bestWindow,
          ...(['exercise-window', 'ventilate-smart'] satisfies RecId[]).map((id) =>
            titleSpan(rec(c, id)?.title ?? '', report.current.time),
          ),
        ];
        const avoid = [plan.smogTrap, plan.worstWindow, ozonePeak(c)];
        return out.flatMap((o) =>
          avoid.map((a) => overlaps(o, a) && `${o?.start}–${o?.end} overlaps ${a?.start}–${a?.end}`),
        );
      }),
    ).toEqual([]);
  });

  it('3b. no outdoor exercise above AQI 150, and no walking or cycling switch above the active-travel limit', () => {
    expect(
      violations((c) => {
        const sw = rec(c, 'commute-switch')?.title ?? '';
        const active = /to (walking|bicycle)$/.test(sw) || /जगह (पैदल|साइकिल) से/.test(sw);
        return [
          c.aqi > 150 && ids(c).has('exercise-window') && 'exercise outdoors above 150',
          active &&
            !activeTravelOk(c.plan.band, c.profile.hasRespiratory) &&
            `active switch at ${c.plan.concern}: ${sw}`,
        ];
      }),
    ).toEqual([]);
  });

  it('3c. a commute switch never increases emissions; the CO₂ total adds up; the plan never raises the dose', () => {
    expect(
      violations(({ plan, ...c }) => {
        const m = /\(([\d.]+) − ([\d.]+)\)/.exec(rec({ plan, ...c }, 'commute-switch')?.impact.explanation ?? '');
        const own = plan.recommendations
          .filter((r) => !r.impact.community)
          .reduce((s, r) => s + (r.impact.co2KgPerMonth ?? 0), 0);
        return [
          m && Number(m[2]) >= Number(m[1]) && `switch raises emissions ${m[0]}`,
          Math.abs(own - plan.co2KgPerMonthTotal) > 0.051 && `CO₂ total ${plan.co2KgPerMonthTotal} ≠ ${own}`,
          plan.dose.withPlanUg > plan.dose.baselineUg && `dose ${plan.dose.withPlanUg} > ${plan.dose.baselineUg}`,
        ];
      }),
    ).toEqual([]);
  });

  it('4. EPA: masks above AQI 100, and protection for vulnerable members when a worst window exists', () => {
    expect(
      violations((c) => {
        const p = c.profile;
        const vulnerable = p.hasChildren || p.hasElderly || p.hasRespiratory;
        return [
          c.aqi > 100 && !ids(c).has('n95') && 'no mask above 100',
          c.aqi > 100 &&
            vulnerable &&
            c.plan.worstWindow &&
            !ids(c).has('protect-vulnerable') &&
            'vulnerable unprotected',
        ];
      }),
    ).toEqual([]);
  });

  it('5. at most MAX_URGENT "do first" besides safety, safety above everything else, no duplicate ids or titles', () => {
    expect(
      violations(({ plan }) => {
        const recs = plan.recommendations;
        const lastSafety = recs.map((r) => SAFETY_IDS.has(r.id)).lastIndexOf(true);
        const firstOther = recs.findIndex((r) => !SAFETY_IDS.has(r.id));
        return [
          recs.filter((r) => r.priority === 1 && !r.safety).length > MAX_URGENT && 'too many urgent',
          ...recs.map((r) => (r.safety === true) !== SAFETY_IDS.has(r.id) && `${r.id}: safety flag wrong`),
          lastSafety > firstOther && firstOther >= 0 && `safety item below ${recs[firstOther]?.id}`,
          new Set(recs.map((r) => r.id)).size !== recs.length && 'duplicate id',
          new Set(recs.map((r) => r.title)).size !== recs.length && 'duplicate title',
        ];
      }),
    ).toEqual([]);
  });

  it('5b. safety items never push the mask or protecting vulnerable people out of the top groups', () => {
    const top = (r: Recommendation | undefined) => r !== undefined && (r.priority === 1 || r.safety === true);
    // Only US EPA activity actions and smog-trap timing outrank the mask, which EPA treats as a supplement.
    const outranksMask = (r: Recommendation) => !r.impact.co2KgPerMonth && !r.impact.removesSource;
    expect(
      violations((c) => {
        const p = c.profile;
        if (c.aqi <= 100 || !(p.hasChildren || p.hasElderly || p.hasRespiratory)) return [];
        const urgent = c.plan.recommendations.filter((r) => r.priority === 1 && !r.safety);
        const maskCut = urgent.length < MAX_URGENT || !urgent.every(outranksMask);
        // On an ozone day the mask is deliberately second: no mask filters ozone, so timing comes first.
        return [
          c.report.current.dominant !== 'o3' && !top(rec(c, 'n95')) && maskCut && 'n95 not in a top group',
          c.plan.worstWindow && !top(rec(c, 'protect-vulnerable')) && 'protect-vulnerable not in a top group',
        ];
      }),
    ).toEqual([]);
  });
});
