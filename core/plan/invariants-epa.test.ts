/**
 * The plan follows the EPA guide in epa.ts, as the verdicts do: strictness never falls as the AQI rises, and no rule
 * offers time outdoors where the guide says to avoid it.
 */
import { describe, expect, it } from 'vitest';

import { profile } from '../../test/fixtures.js';
import { rec, texts, violations } from '../../test/planChecks.js';
import { airReport, AQIS, type Case, cases, INDIA } from '../../test/scenarios.js';
import { aqiLevel } from '../aqi.js';
import { type Activity, activityRank, epaActivity, epaVerdict, type Verdict } from '../epa.js';
import { buildPlan } from '../recommend.js';
import type { Plan, RecId, Recommendation } from '../types.js';

const ACTIVE_SWITCH = /to (walking|bicycle)$|जगह (पैदल|साइकिल) से/;

/** Advice that offers going out: a window to go in, "outside it", "if you must", a gentle walk. */
const GO_OUT = new RegExp(
  [
    /\boutside it\b|\bexercise outside\b|\bgo out\b|\bif you must (?:go|exercise|travel)\b|\bwalk gently\b/,
    /इसके बाहर|बाहर व्यायाम|ही हो तो|धीरे टहलें/,
  ]
    .map((part) => part.source)
    .join('|'),
  'i',
);
const ALL_DAY = /\ball day\b|दिन भर/i;
const ALL_OUT = /all physical activity outdoors|हर तरह की शारीरिक गतिविधि/;
const MEMBER_WORDS = {
  hasChildren: /children|बच्चों/,
  hasElderly: /elders|बुज़ुर्गों/,
  hasRespiratory: /heart or lung|दिल या फेफड़े/,
} as const;

const all = (r: Recommendation | undefined): string => (r ? texts(r).join(' ') : '');
const hasMembers = (c: Pick<Case, 'profile'>): boolean =>
  c.profile.hasChildren || c.profile.hasElderly || c.profile.hasRespiratory;

/** The EPA level the vulnerable tip gives, read back from its words. */
function vulnerableLevel(plan: Plan): Activity {
  const text = all(plan.recommendations.find((r) => r.id === 'protect-vulnerable'));
  if (!text) return 'fine';
  if (ALL_OUT.test(text)) return 'avoidAll';
  return ALL_DAY.test(text) ? 'avoid' : 'reduce';
}
const toVerdict = (a: Activity): Verdict => (a === 'avoidAll' ? 'avoid' : a);

/** Each strictness the plan expresses, as a number that must not fall as the AQI rises. */
function strictness(plan: Plan): number[] {
  const has = (id: RecId): number => (plan.recommendations.some((r) => r.id === id) ? 1 : 0);
  return [
    activityRank(vulnerableLevel(plan)),
    has('exercise-indoors'),
    has('commute-exposure'),
    plan.avoidAllOutdoors ? 1 : 0,
  ];
}

describe('EPA activity invariants', () => {
  it('(a) strictness never decreases as the AQI rises, other inputs fixed', () => {
    const sample = cases().filter((_, i) => i % 9 === 0);
    const out: string[] = [];
    for (const c of sample) {
      const strictAt = (aqi: number) => strictness(buildPlan(airReport({ ...c, aqi }), c.profile, c.lang));
      const scores = [...AQIS].sort((a, b) => a - b).map((aqi) => ({ aqi, s: strictAt(aqi) }));
      scores.slice(1).forEach(({ aqi, s }, i) => {
        const prev = scores[i];
        s.forEach(
          (v, k) =>
            prev && v < (prev.s[k] ?? 0) && out.push(`part ${k} falls from AQI ${prev.aqi} to ${aqi} | ${c.name}`),
        );
      });
    }
    expect(sample.length).toBeGreaterThan(250);
    expect(out.slice(0, 6)).toEqual([]);
  });

  it('(b) every sensitive member gets the verdict of the assistant, and is never offered going out on "avoid"', () => {
    let checked = 0;
    expect(
      violations((c) => {
        if (!hasMembers(c)) return [];
        checked++;
        const aqi = c.report.current.usAqi;
        const verdict = epaVerdict(aqi, { sensitive: true });
        const level = vulnerableLevel(c.plan);
        // On a "reduce" day the advice is the worst window, so a forecast without one has nothing to say.
        const silent = verdict === 'reduce' && !c.plan.worstWindow && level === 'fine';
        const tip = rec(c, 'protect-vulnerable');
        return [
          !silent && toVerdict(level) !== verdict && `members told "${level}", assistant says "${verdict}"`,
          !silent &&
            level !== epaActivity(aqiLevel(aqi), { sensitive: true }) &&
            `members told "${level}", EPA says "${epaActivity(aqiLevel(aqi), { sensitive: true })}"`,
          ...Object.entries(MEMBER_WORDS).map(
            ([flag, words]) =>
              tip &&
              c.profile[flag as keyof typeof MEMBER_WORDS] &&
              !words.test(tip.title) &&
              `${flag} not named in "${tip.title}"`,
          ),
          ...(verdict === 'avoid'
            ? c.plan.recommendations.flatMap((r) =>
                texts(r).map((t) => GO_OUT.test(t) && `${r.id} offers going out: "${GO_OUT.exec(t)?.[0]}"`),
              )
            : []),
          verdict === 'avoid' && rec(c, 'exercise-window') && 'outdoor workout window on an "avoid" day',
        ];
      }),
    ).toEqual([]);
    expect(checked).toBeGreaterThan(1000);
  });

  it('(c) from AQI 301, no rule suggests any outdoor activity for anyone', () => {
    expect(
      violations((c) => {
        if (c.report.current.usAqi <= 300) return [];
        const sw = rec(c, 'commute-switch')?.title ?? '';
        return [
          !c.plan.avoidAllOutdoors && 'avoidAllOutdoors not set',
          rec(c, 'exercise-window') && 'outdoor workout window',
          ACTIVE_SWITCH.test(sw) && `active commute: ${sw}`,
          hasMembers(c) && vulnerableLevel(c.plan) !== 'avoidAll' && `members told "${vulnerableLevel(c.plan)}"`,
          ...c.plan.recommendations.flatMap((r) =>
            texts(r).map((t) => GO_OUT.test(t) && `${r.id}: "${GO_OUT.exec(t)?.[0]}"`),
          ),
        ];
      }),
    ).toEqual([]);
  });

  it('at AQI 163 the advice for children covers the whole day, not only the worst window', () => {
    const r = airReport({ aqi: 163, weather: 'none', startHour: 21, place: INDIA });
    const plan = buildPlan(r, profile({ hasChildren: true }), 'en');
    const tip = plan.recommendations.find((x) => x.id === 'protect-vulnerable');
    expect(tip?.title).toBe('All day today: no long or hard outdoor activity for children');
    expect(tip?.detail).not.toMatch(GO_OUT);
    expect(tip?.detail).toMatch(/Keep them fully indoors tomorrow from \d\d:00 to \d\d:00/);
  });
});

describe('the workout tip never goes beyond the guide', () => {
  it('says "reduce" where the guide only says reduce for the person exercising, and "indoors" from "avoid" on', () => {
    const bad = violations((c) => {
      const tip = rec(c, 'exercise-indoors');
      if (!tip || c.lang !== 'en') return [];
      const self = epaActivity(aqiLevel(c.aqi), { sensitive: c.profile.hasRespiratory });
      const reduces = /short and light/.test(tip.title);
      return [
        self === 'reduce' && !reduces && `AQI ${c.aqi}: "${tip.title}" is stricter than the guide's "reduce"`,
        (self === 'avoid' || self === 'avoidAll') && reduces && `AQI ${c.aqi}: "${tip.title}" is milder than "avoid"`,
      ];
    });
    expect(bad).toEqual([]);
  });
});
