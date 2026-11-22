/** Invariants about the words: language, locale, time labels, self-consistent prose and chips that match the working. */
import { describe, expect, it } from 'vitest';
import { findWindow } from '../windows';
import { impactChips } from '../chips';
import { buildPlan } from '../recommend';
import type { Recommendation, TimeWindow } from '../types';
import type { Case } from '../../test/scenarios';
import { DEVANAGARI, POLLUTANT_NAMES, effectPercents, hasTomorrow, latinRuns, rec, texts, violations } from '../../test/planChecks';
import { HEAVY_EXERTION_AQI, MODE_NAME, isIndia } from './shared';
import { phrase, spanLabel } from './spans';

const INDIA_ONLY = /Ujjwala|RWA|angithi|अंगीठी|उज्ज्वला|क्रेच/;
const MODE_WORDS = Object.values(MODE_NAME).flatMap((t) => [t.en, t.hi]);

/** Which window each time-stamped tip is about. */
function windowOf(c: Case, r: Recommendation): TimeWindow | null {
  const { plan, report } = c;
  if (r.id === 'exercise-window' || (r.id === 'ventilate-smart' && /\d\d:\d\d/.test(r.title))) return plan.bestWindow;
  if (r.id === 'protect-vulnerable') return plan.worstWindow;
  if (r.id === 'smog-trap' && plan.smogTrap) return { ...plan.smogTrap, avgPm25: 0 };
  if (r.id === 'ozone-effort') return findWindow(report.hourly.slice(1), 2, 'worst', (p) => p.o3 ?? 0);
  return null;
}

describe('language invariants', () => {
  it('6. Hindi is Devanagari, differs from English, and leaks no English sentence', () => {
    expect(
      violations((c) => {
        if (c.lang !== 'hi') return c.plan.recommendations.flatMap((r) => texts(r).map((t) => DEVANAGARI.test(t) && `${r.id}: Hindi in English "${t}"`));
        const en = buildPlan(c.report, c.profile, 'en').recommendations;
        return c.plan.recommendations.flatMap((r, i) => [
          ...[r.title, r.detail].map((t) => !DEVANAGARI.test(t) && `${r.id}: no Devanagari "${t}"`),
          (r.title === en[i]?.title || r.detail === en[i]?.detail) && `${r.id}: same as English`,
          ...texts(r).flatMap((t) => latinRuns(t).map((run) => `${r.id}: English run "${run}"`)),
        ]);
      }),
    ).toEqual([]);
  });

  it('7. outside India, no India-only scheme or word appears in either language', () => {
    expect(
      violations((c) =>
        isIndia(c.place.country) ? [] : c.plan.recommendations.flatMap((r) => texts(r).map((t) => INDIA_ONLY.exec(t)?.[0] && `${r.id}: "${INDIA_ONLY.exec(t)?.[0]}"`)),
      ),
    ).toEqual([]);
  });

  it('8. "tomorrow"/"कल" appears exactly when the window starts or ends on a later date than now', () => {
    expect(
      violations((c) =>
        c.plan.recommendations.flatMap((r) => {
          const w = windowOf(c, r);
          const later = w !== null && w.end.slice(0, 10) > c.report.current.time.slice(0, 10);
          const said = hasTomorrow(r.title) || hasTomorrow(r.detail);
          return [said !== later && `${r.id}: tomorrow=${String(said)} for ${w?.start ?? 'no window'} at ${c.report.current.time}`];
        }),
      ),
    ).toEqual([]);
  });
});

describe('spans across midnight', () => {
  /** "16:00 to 10:00", "16:00–10:00": an end at or before its start is on the next day, so the text must say so. */
  const wraps = (text: string): boolean =>
    [...text.matchAll(/(\d\d:\d\d)(?:–| to | and | से )(?:कल |परसों )?(\d\d:\d\d)/g)].some(([, a = '', b = '']) => b <= a);
  it('every span whose end is at or before its start in clock time says "tomorrow" (कल in Hindi)', () => {
    expect(
      violations((c) => {
        const { plan, report } = c;
        const labels = [plan.bestWindow, plan.worstWindow, plan.smogTrap].flatMap((w) => (w ? [spanLabel(w, report.current.time)[c.lang]] : []));
        const shown = [...plan.recommendations.flatMap(texts), ...labels].flatMap((t) => t.split(/[.।:]\s/));
        return shown.map((t) => wraps(t) && !hasTomorrow(t) && `no "tomorrow" in "${t}"`);
      }),
    ).toEqual([]);
  });

  it('the live case: a 16:00 trap that lifts at 10:00 says the end is tomorrow, in both languages', () => {
    const trap = { start: '2026-11-17T16:00', end: '2026-11-18T10:00' };
    expect(phrase(trap, '2026-11-17T13:00', 'fromTo')).toEqual({ en: 'from 16:00 to 10:00 tomorrow', hi: '16:00 से कल 10:00 तक' });
    expect(spanLabel(trap, '2026-11-17T13:00')).toEqual({ en: '16:00–10:00 tomorrow', hi: '16:00 से कल 10:00 तक' });
    expect(phrase({ start: '2026-11-18T23:00', end: '2026-11-19T01:00' }, '2026-11-17T13:00', 'between').en).toBe('tomorrow between 23:00 and 01:00 the day after');
  });
});

describe('self-consistent text', () => {
  it('no title names the same mode twice', () => {
    expect(
      violations((c) =>
        c.plan.recommendations.map((r) => {
          const words = r.title.split(/[\s,:;]+/);
          const twice = MODE_WORDS.find((m) => words.filter((w) => w === m).length > 1);
          return twice && `${r.id}: "${twice}" twice in "${r.title}"`;
        }),
      ),
    ).toEqual([]);
  });

  it('every AQI threshold in prose is an engine constant', () => {
    const allowed = new Set([HEAVY_EXERTION_AQI]);
    expect(
      violations((c) =>
        c.plan.recommendations.flatMap((r) => [...r.detail.matchAll(/AQI\D{0,12}(\d+)/g)].map((m) => !allowed.has(Number(m[1])) && `${r.id}: AQI ${m[1]}`)),
      ),
    ).toEqual([]);
  });

  it('"before/after the smog trap" is computed from the times', () => {
    expect(
      violations(({ plan, ...c }) => {
        const d = rec({ plan, ...c }, 'ventilate-smart')?.detail ?? '';
        const b = plan.bestWindow;
        const t = plan.smogTrap;
        const before = /before the smog trap|जाल शुरू होने से पहले का/.test(d);
        const after = /after the smog trap|जाल हटने के बाद का/.test(d);
        return [before && !(b && t && b.end <= t.start) && 'says before', after && !(b && t && b.start >= t.end) && 'says after'];
      }),
    ).toEqual([]);
  });

  it('protect-vulnerable names exactly the members the household has', () => {
    const who = [
      ['hasChildren', /children|school|बच्च|स्कूल/],
      ['hasElderly', /elder|बुज़ुर्ग/],
      ['hasRespiratory', /heart or lung|inhaler|दिल या फेफड़े|इनहेलर/],
    ] as const;
    expect(
      violations((c) => {
        const r = rec(c, 'protect-vulnerable');
        if (!r) return [];
        return who.map(([flag, re]) => re.test(`${r.title} ${r.detail}`) !== c.profile[flag] && `${flag}=${String(c.profile[flag])}: "${r.title}"`);
      }),
    ).toEqual([]);
  });
});

describe('chips match the working', () => {
  it('every effect percentage in the working equals the chip, and chip numbers appear verbatim in it', () => {
    expect(
      violations((c) =>
        c.plan.recommendations.flatMap((r) => {
          const { exposureCutPct: pct, co2KgPerMonth: kg, explanation } = r.impact;
          return [
            ...effectPercents(explanation).map((p) => p !== pct && `${r.id}: working says ${p}%, chip ${String(pct)}%`),
            pct !== undefined && !explanation.includes(`${pct}%`) && `${r.id}: ${pct}% not in working`,
            kg !== undefined && !explanation.includes(String(kg)) && `${r.id}: ${kg} kg not in "${explanation}"`,
          ];
        }),
      ),
    ).toEqual([]);
  });

  it('no chip names two pollutants, and ozone cuts are labelled as ozone', () => {
    expect(
      violations((c) =>
        c.plan.recommendations.flatMap((r) =>
          impactChips(r.impact, c.lang).map((chip) => {
            const names = chip.text.match(POLLUTANT_NAMES) ?? [];
            return (names.length > 1 || (r.id === 'ozone-effort' && !/ozone|ओज़ोन/i.test(chip.text))) && `${r.id}: "${chip.text}"`;
          }),
        ),
      ),
    ).toEqual([]);
  });
});
