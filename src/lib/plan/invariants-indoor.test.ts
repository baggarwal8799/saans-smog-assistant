/**
 * Indoor tips claim only what the household does not already do: every "shut the windows" or "stay in" cut is
 * worked out from the household's own indoor habit (impact.ts `indoorCut`), the same baseline as the dose.
 */
import { describe, expect, it } from 'vitest';
import { indoorCut } from '../impact';
import { buildPlan } from '../recommend';
import { profile } from '../../test/fixtures';
import { INDIA, airReport } from '../../test/scenarios';
import { effectPercents, violations } from '../../test/planChecks';

/** The sentence that credits shutting the windows, in either language. */
const SHUT_WORKING = /Shut windows keep indoor PM2\.5[^.]*\.|बंद खिड़कियों से अंदर का PM2\.5[^।]*।/;

describe("indoor cuts start from the household's current habit", () => {
  it("no indoor tip claims a % cut that the household's habits already achieve", () => {
    let checked = 0;
    expect(
      violations((c) =>
        c.plan.recommendations.flatMap((r) => {
          const working = SHUT_WORKING.exec(r.impact.explanation)?.[0];
          const out: (string | false)[] = [];
          if (working) {
            checked++;
            const cut = indoorCut(c.profile);
            out.push(
              (cut <= 0 || r.impact.exposureCutPct !== cut) &&
                `${r.id}: claims ${r.impact.exposureCutPct}% for shutting windows, habit leaves ${cut}%`,
              ...effectPercents(working).map((p) => p !== cut && `${r.id}: "${p}%" in "${working}"`),
            );
          }
          // Moving someone indoors cuts from outdoor air to this home's shut-window air, purifier included.
          if (r.id === 'protect-vulnerable' || r.id === 'exercise-indoors') {
            out.push(
              r.impact.exposureCutPct !== indoorCut(c.profile, 1) &&
                `${r.id}: ${r.impact.exposureCutPct}% ≠ ${indoorCut(c.profile, 1)}%`,
            );
          }
          return out;
        }),
      ),
    ).toEqual([]);
    expect(checked).toBeGreaterThan(500);
  });

  it('a household with a purifier gets no "keep windows shut" or smog-trap credit', () => {
    const r = airReport({ aqi: 210, weather: 'nightTrap', startHour: 9, place: INDIA });
    const own = buildPlan(r, profile({ hasPurifier: true }), 'en');
    const none = buildPlan(r, profile({ hasPurifier: false }), 'en');
    expect(none.recommendations.find((x) => x.id === 'smog-trap')?.impact.exposureCutPct).toBe(33);
    expect(own.recommendations.map((x) => x.id)).not.toContain('smog-trap');
    expect(own.recommendations.filter((x) => SHUT_WORKING.test(x.impact.explanation))).toEqual([]);
    expect(indoorCut({ hasPurifier: true })).toBe(0);
  });
});
