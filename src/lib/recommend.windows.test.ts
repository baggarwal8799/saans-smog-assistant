/** buildPlan timing: exercise windows, ozone timing, "tomorrow" wording and windows from the next full hour. */
import { describe, expect, it } from 'vitest';
import { planIds as ids, profile, report } from '../test/fixtures';
import { buildPlan } from './recommend';

describe('buildPlan windows and timing', () => {
  it('on a moderate day schedules exercise in the cleanest window and skips masks', () => {
    const plan = buildPlan(report({ usAqi: 90 }), profile(), 'en');
    expect(ids(plan)).toContain('exercise-window');
    expect(ids(plan)).not.toContain('n95');
    expect(plan.bestWindow?.start).toBe('2026-11-17T14:00');
    expect(plan.recommendations.find((x) => x.id === 'exercise-window')?.impact.scope).toBe('while exercising');
  });

  it('moves workouts indoors from "Unhealthy" (AQI 151), per US EPA guidance', () => {
    expect(ids(buildPlan(report({ usAqi: 151 }), profile(), 'en'))).toContain('exercise-indoors');
    expect(ids(buildPlan(report({ usAqi: 167 }), profile(), 'en'))).not.toContain('exercise-window');
    expect(ids(buildPlan(report({ usAqi: 150 }), profile(), 'en'))).toContain('exercise-window');
  });

  it('says "tomorrow" whenever a window is on the next day', () => {
    const plan = buildPlan(report({ usAqi: 120 }, 18), profile({ hasElderly: true }), 'en');
    expect(plan.bestWindow?.start.slice(0, 10)).toBe('2026-11-18');
    const title = (id: string) => plan.recommendations.find((r) => r.id === id)?.title ?? '';
    expect(title('exercise-window')).toMatch(
      /^(Exercise outside|If you must exercise outside, go) tomorrow between \d\d:00 and \d\d:00$/,
    );
    expect(title('ventilate-smart')).toMatch(/tomorrow around/);
    const hi = buildPlan(report({ usAqi: 120 }, 18), profile(), 'hi');
    expect(hi.recommendations.find((r) => r.id === 'exercise-window')?.title).toMatch(
      /^बाहर व्यायाम (करना ही हो तो )?कल /,
    );
    const today = buildPlan(report({ usAqi: 120 }, 6), profile(), 'en');
    expect(today.recommendations.find((r) => r.id === 'exercise-window')?.title).not.toMatch(/tomorrow/);
  });

  it('on an ozone day leads with ozone timing and says masks do not filter it', () => {
    const r = report({ usAqi: 175, dominant: 'o3' });
    // Smoggy evening (PM2.5) but an afternoon ozone peak: the ozone advice must point at the afternoon.
    r.hourly = r.hourly.map((p) => ({
      ...p,
      o3: ['12', '13', '14', '15', '16'].includes(p.time.slice(11, 13)) ? 300 : 40,
    }));
    const plan = buildPlan(r, profile(), 'en');
    const ozone = plan.recommendations.find((x) => x.id === 'ozone-effort');
    expect(ozone?.priority).toBe(1);
    // The chip names the pollutant once ("Cuts ozone while exercising"), so the scope is only where it applies.
    expect(ozone?.impact).toMatchObject({ scope: 'while exercising', pollutant: 'ozone' });
    expect(ozone?.title).toMatch(/from 1[2-5]:00 to 1[3-7]:00/);
    expect(ozone?.impact.explanation).toMatch(/Ozone averages ≈ 300 µg/);
    const mask = plan.recommendations.find((x) => x.id === 'n95');
    expect(mask?.priority).toBe(2);
    expect(mask?.detail).toMatch(/no mask filters ozone/);
    expect(ids(buildPlan(report(), profile(), 'en'))).not.toContain('ozone-effort');
  });

  it('starts windows at the next full hour, never the one already under way', () => {
    const r = report({ usAqi: 90 }, 14);
    const plan = buildPlan(r, profile(), 'en');
    // 14:00 today is the cleanest hour but already under way; tomorrow 13:00–15:00 (85 µg/m³) beats 15:00–17:00 (97.5).
    expect(plan.bestWindow).toEqual({ start: '2026-11-18T13:00', end: '2026-11-18T15:00', avgPm25: 85 });
  });

  it('falls back to indoor exercise when no daytime window exists', () => {
    const r = report({ usAqi: 120 }, 22);
    r.hourly = r.hourly.slice(0, 6);
    const plan = buildPlan(r, profile(), 'en');
    expect(plan.bestWindow).toBeNull();
    expect(ids(plan)).toContain('exercise-indoors');
    expect(plan.recommendations.find((x) => x.id === 'ventilate-smart')?.title).toMatch(/Keep windows shut/);
  });
});
