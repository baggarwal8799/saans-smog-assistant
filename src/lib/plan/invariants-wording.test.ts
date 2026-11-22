/**
 * Wording invariants: part-of-day words match the window, "best" only for air that is at
 * most Moderate, airing advice consistent with the indoor model, one truth about children and masks, burning
 * pledges only where relevant, and commute exposure that counts the walk to the station.
 */
import { describe, expect, it } from 'vitest';
import { bestLabels, fineToGoOut } from '../concern';
import { ACCESS_WALK_MIN_EACH_WAY, INDOOR_RATIO, TRANSIT_BREATHING, TRANSIT_EXPOSURE_RATIO, commuteDoseFactor, commuteHoursPerDay } from '../impact';
import { t } from '../i18n';
import { buildPlan } from '../recommend';
import { averagePm25, findWindow, partOfDay } from '../windows';
import type { Recommendation, TimeWindow } from '../types';
import { profile } from '../../test/fixtures';
import { INDIA, airReport, type Case } from '../../test/scenarios';
import { rec, texts, violations } from '../../test/planChecks';
import { CHILD_MASK_NOTE } from './shared';

/** The Moderate upper bound of the US EPA PM2.5 bands. */
const MODERATE_MAX = 35.4;
const PARTS = /\b(morning|afternoon|evening|night)\b|सुबह|दोपहर|शाम|रात/g;
const DAYTIME = /daytime|दिन (का|के|की|में)(\s|$)/i;
const GOOD = /\bbest\b|cleanest|good time|सबसे अच्छ|सबसे साफ़/i;
const WIDE = /\bwindows? wide\b|\bwide open\b|पूरी खोल/i;
const CHILD_NEEDS_MASK = /child[^.]{0,30}\bneeds?\b[^.]{0,30}mask|बच्चों के लिए[^।]{0,30}मास्क लें/i;
const PLEDGE = /pledge|no-burning|stop burning|संकल्प|जलाना बंद/i;

/** The window each time-stamped tip is about. */
function windowOf(c: Case, r: Recommendation): TimeWindow | null {
  if (r.id === 'exercise-window' || (r.id === 'ventilate-smart' && /\d\d:\d\d/.test(r.title))) return c.plan.bestWindow;
  if (r.id === 'protect-vulnerable') return c.plan.worstWindow;
  if (r.id === 'ozone-effort') return findWindow(c.report.hourly.slice(1), 2, 'worst', (p) => p.o3 ?? 0);
  return null;
}

describe('1. time-of-day words match the window', () => {
  it('names the part of day from the hours, in both languages', () => {
    expect(['05:00', '11:00', '12:00', '16:00', '17:00', '19:00', '21:00', '02:00'].map((h) => partOfDay(`2026-11-17T${h}`).en)).toEqual([
      'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'night', 'night',
    ]);
    expect(partOfDay('2026-11-17T19:00').hi).toBe('शाम');
  });

  it('no "daytime" for a window from 18:00 or before 06:00, and any part-of-day word is the right one', () => {
    expect(
      violations((c) =>
        c.plan.recommendations.flatMap((r) => {
          const w = windowOf(c, r);
          if (!w) return [];
          const h = Number(w.start.slice(11, 13));
          const right = partOfDay(w.start)[c.lang];
          return texts(r).flatMap((text) => [
            (h >= 18 || h < 6) && DAYTIME.test(text) && `${r.id}: daytime at ${h}:00`,
            ...[...text.matchAll(PARTS)].map((m) => m[0] !== right && `${r.id}: "${m[0]}" for a window at ${h}:00`),
          ]);
        }),
      ),
    ).toEqual([]);
  });
});

describe('2. "best" only for air that is at most Moderate', () => {
  it('every rendered best, cleanest or good-time label implies the window PM2.5 ≤ 35.4 µg/m³', () => {
    expect(
      violations(({ plan, lang }) => {
        const labels = bestLabels(plan.bestWindow);
        const ui = [t(lang, labels.window), t(lang, 'windowBasis'), ...(plan.bestWindow ? [t(lang, labels.key)] : [])];
        const clean = plan.bestWindow !== null && plan.bestWindow.avgPm25 <= MODERATE_MAX;
        const shown = [...ui.map((s) => ['ui', s]), ...plan.recommendations.flatMap((r) => texts(r).map((s) => [r.id, s]))];
        return shown.map(([where, s]) => !clean && GOOD.test(s ?? '') && `${where}: "${GOOD.exec(s ?? '')?.[0]}" at ${plan.bestWindow?.avgPm25}`);
      }),
    ).toEqual([]);
  });

  it('the band test uses the EPA Moderate bound', () => {
    expect([fineToGoOut(35.4), fineToGoOut(35.5), fineToGoOut(67)]).toEqual([true, false, false]);
    expect(bestLabels({ start: '', end: '', avgPm25: 67 })).toEqual({ window: 'bestWindowNeutral', key: 'keyBestNeutral' });
    expect(t('en', 'bestWindowNeutral')).toBe('Least polluted 2 hours, if you must go out');
  });
});

/** A "sensitive groups" day whose least polluted window still sits at PM2.5 ≈ 67, so no hour is clean. */
function dirtyWindowPlan(lang: 'en' | 'hi') {
  const r = airReport({ aqi: 120, weather: 'none', startHour: 6, place: INDIA });
  const low = Math.min(...r.hourly.map((h) => h.pm25));
  // A flattened winter shape: the cleanest hours at 67 µg/m³ and indoors (× 0.6 of the day average) well below that.
  const report = { ...r, current: { ...r.current, pm25: 30 }, hourly: r.hourly.map((h) => ({ ...h, pm25: 67 + (h.pm25 - low) / 2 })) };
  return buildPlan(report, profile({ exerciseMinutes: 30 }), lang);
}

describe('2-3. no clean hour: PM2.5 ≈ 67 in the least polluted window', () => {
  it.each(['en', 'hi'] as const)('neutral exercise wording and a brief airing (%s)', (lang) => {
    const plan = dirtyWindowPlan(lang);
    const ex = plan.recommendations.find((r) => r.id === 'exercise-window');
    const vent = plan.recommendations.find((r) => r.id === 'ventilate-smart');
    expect(ex?.title).toMatch(lang === 'en' ? /^If you must exercise outside/ : /करना ही हो तो/);
    expect(vent?.detail).toMatch(/5–10/);
    for (const s of [...(ex ? texts(ex) : []), ...(vent ? texts(vent) : [])]) {
      expect(s).not.toMatch(GOOD);
      expect(s).not.toMatch(WIDE);
    }
  });
});

describe('3. airing advice is consistent with indoor versus outdoor air', () => {
  it('"open windows wide" only when the window is at or below the indoor model, or at most Moderate', () => {
    expect(
      violations(({ plan, report }) => {
        const indoor = averagePm25(report.hourly, report.current.pm25) * INDOOR_RATIO.closed;
        const b = plan.bestWindow;
        const ok = b !== null && (b.avgPm25 <= indoor || b.avgPm25 <= MODERATE_MAX);
        return plan.recommendations.flatMap((r) => texts(r).map((s) => WIDE.test(s) && !ok && `${r.id}: wide open at ${b?.avgPm25} vs indoor ${indoor}`));
      }),
    ).toEqual([]);
  });

  it('the brief airing claims no PM2.5 cut for the air let in', () => {
    expect(
      violations((c) => {
        const v = rec(c, 'ventilate-smart');
        return [v && !WIDE.test(v.detail) && v.impact.scope === 'in the air you let in' && 'brief airing claims a cleaner-air cut'];
      }),
    ).toEqual([]);
  });
});

describe('4-6. one mask truth, relevant pledges, honest commute exposure', () => {
  it('no text says children need masks, and the mask tip carries the shared child note', () => {
    expect(
      violations((c) => [
        ...c.plan.recommendations.flatMap((r) => texts(r).map((s) => CHILD_NEEDS_MASK.test(s) && `${r.id}: children need masks`)),
        c.profile.hasChildren && rec(c, 'n95') && !rec(c, 'n95')?.detail.includes(CHILD_MASK_NOTE[c.lang]) && 'n95 without the child note',
      ]),
    ).toEqual([]);
  });

  it('on a clean-air day the burning pledge is only a community step, never household alarm', () => {
    expect(
      violations((c) =>
        c.plan.concern !== 'low' || c.profile.burnsWaste
          ? []
          : c.plan.recommendations.flatMap((r) => texts(r).map((s) => r.id !== 'community-plan' && PLEDGE.test(s) && `${r.id}: pledge`)),
      ),
    ).toEqual([]);
  });

  it('public transport counts the walk to the stop, in the cut and in the working', () => {
    const ride = TRANSIT_EXPOSURE_RATIO.metro * TRANSIT_BREATHING.metro * commuteHoursPerDay('metro', 5);
    const walk = TRANSIT_EXPOSURE_RATIO.walk * TRANSIT_BREATHING.walk * ((2 * ACCESS_WALK_MIN_EACH_WAY) / 60);
    expect(commuteDoseFactor('metro', 5)).toBeCloseTo(ride + walk);
    expect(commuteDoseFactor('walk', 5)).toBeCloseTo(TRANSIT_EXPOSURE_RATIO.walk * TRANSIT_BREATHING.walk * commuteHoursPerDay('walk', 5));
    expect(
      violations((c) => {
        const tip = rec(c, 'commute-exposure');
        return [tip && !tip.impact.explanation.includes(String(ACCESS_WALK_MIN_EACH_WAY)) && 'working omits the access walk'];
      }),
    ).toEqual([]);
  });

  it('the dose note says it uses an adult breathing rate for everyone', () => {
    expect(t('en', 'doseNote')).toMatch(/adult breathing rate for everyone/);
    expect(t('hi', 'doseNote')).toMatch(/वयस्क/);
  });
});
