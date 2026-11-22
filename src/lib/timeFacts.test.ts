import { describe, expect, it } from 'vitest';
import { DELHI, profile } from '../test/fixtures';
import { askedTimeFact, forecastAt, nowFact } from './askedTimes';
import { buildContext } from './context';
import { fitSpans, outdoorHoursFact } from './outdoorHours';
import { buildPlan } from './recommend';
import type { AirReport, Plan, SmogTrap } from './types';
import { addHours, within } from './windows';

const DAY = '2026-11-19';
/** A report at `now` with 30 forecast hours from the current hour; `aqiAt(h)` gives each hour's US AQI. */
function at(now: string, aqiAt: (hour: number) => number): AirReport {
  const first = `${now.slice(0, 13)}:00`;
  const hourly = Array.from({ length: 30 }, (_, i) => {
    const time = addHours(first, i);
    const usAqi = aqiAt(Number(time.slice(11, 13)));
    return { time, usAqi, pm25: usAqi / 2 };
  });
  return {
    place: DELHI,
    timezone: 'Asia/Kolkata',
    current: { time: now, usAqi: hourly[0]?.usAqi ?? 0, pm25: 80, pm10: 120, no2: 40, o3: 20, dominant: 'pm25' },
    hourly,
  };
}
const trap = (start: string, end: string): SmogTrap => ({ start, end, minMixingM: 40, avgWindKmh: 3 });
const clock = (h: number, m = 0) => ({ label: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, hours: [h], m });

describe('within: full date-times, never hours of the day', () => {
  const night = trap(`${DAY}T16:00`, '2026-11-20T10:00');

  it('is false before a span starts, even at an hour of the day the span later covers', () => {
    expect(within(`${DAY}T10:30`, night)).toBe(false);
    expect(within(`${DAY}T15:59`, night)).toBe(false);
  });

  it('is true from the start up to, not including, the end, across midnight', () => {
    expect(within(`${DAY}T16:00`, night)).toBe(true);
    expect(within('2026-11-20T02:00', night)).toBe(true);
    expect(within('2026-11-20T09:30', night)).toBe(true);
    expect(within('2026-11-20T10:00', night)).toBe(false);
  });
});

describe('the "Now" fact', () => {
  const r = at(`${DAY}T10:30`, () => 190);
  const worstWindow = { start: `${DAY}T18:00`, end: `${DAY}T20:00`, avgPm25: 120 };

  it('says 10:30 is before a trap that starts at 16:00, never inside it', () => {
    const fact = nowFact(r, { smogTrap: trap(`${DAY}T16:00`, '2026-11-20T10:00'), worstWindow });
    expect(fact).toBe('Now (10:30 today) is before the smog trap (16:00 today to 10:00 tomorrow) and before the most polluted window (18:00–20:00 today).');
  });

  it('says INSIDE when now is in a span that crosses midnight', () => {
    const late = at(`${DAY}T23:30`, () => 190);
    expect(nowFact(late, { smogTrap: trap(`${DAY}T23:00`, '2026-11-20T08:00'), worstWindow: null }))
      .toBe('Now (23:30 today) is INSIDE the smog trap (23:00 today to 08:00 tomorrow).');
    expect(nowFact(late, { smogTrap: null, worstWindow: null })).toMatch(/is in no smog trap or polluted window\.$/);
  });

  it('reaches CONTEXT with the reading time', () => {
    const plan = buildPlan(r, profile(), 'en');
    const ctx = buildContext(r, profile(), plan, 'en');
    expect(ctx.now).toMatch(/^Now \(10:30 today\) is /);
    expect(ctx.readingTime).toBe('10:30');
  });
});

describe('asked times against the clock', () => {
  const r = at(`${DAY}T10:30`, (h) => 100 + h);
  const plan = { smogTrap: trap(`${DAY}T16:00`, '2026-11-20T10:00'), worstWindow: null, bestWindow: null } as Plan;

  it('flags 10:45 as outside a trap that starts at 16:00, and 07:00 tomorrow inside it', () => {
    expect(askedTimeFact(clock(10, 45), r, plan)).toMatch(/^Asked time 10:45 today: .*outside the smog trap \(16:00 today to 10:00 tomorrow\)/);
    expect(askedTimeFact(clock(7), r, plan)).toMatch(/^Asked time 07:00 tomorrow: .*INSIDE the smog trap/);
  });

  it('reads a clock time already past in the current hour as tomorrow\'s, and keeps the current hour of a day part', () => {
    expect(forecastAt(clock(10, 15), r).points.map((p) => p.time)).toEqual(['2026-11-20T10:00']);
    const morning = { label: 'morning', hours: [6, 7, 8, 9, 10], m: 0 };
    expect(forecastAt(morning, r).points[0]?.time).toBe(`${DAY}T10:00`);
  });
});

describe('hours fit for outdoor activity', () => {
  // Unhealthy (≈ 193) until 13:00, then Good for three hours, then Unhealthy again.
  const r = at(`${DAY}T10:30`, (h) => (h >= 13 && h < 16 ? 45 : 193));
  const nobody = profile({ hasChildren: false, hasElderly: false, hasRespiratory: false });

  it('merges fit hours into spans and never lists 10:00 at US AQI 193', () => {
    expect(outdoorHoursFact(r, profile())).toBe(
      'Hours fit for outdoor activity for this household (judged for its US EPA sensitive groups): 13:00–16:00 today',
    );
    expect(fitSpans(r, true).some((w) => within(`${DAY}T10:00`, w))).toBe(false);
  });

  it('judges a 70-year-old father named in the question as sensitive, even when the profile lists no elderly', () => {
    const usg = at(`${DAY}T10:30`, (h) => (h < 12 ? 130 : 193));
    expect(outdoorHoursFact(usg, nobody)).toMatch(/\(US EPA guidance for everyone\): 10:30–12:00 today, 00:00–10:30 tomorrow$/);
    expect(outdoorHoursFact(usg, nobody, 'When can my 70-year-old father walk?')).toMatch(/: none in the next 24 hours$/);
  });

  it('says none when no hour in the next 24 hours is fit, and reaches CONTEXT', () => {
    const bad = at(`${DAY}T10:30`, () => 193);
    expect(outdoorHoursFact(bad, profile())).toMatch(/: none in the next 24 hours$/);
    const ctx = buildContext(bad, profile(), buildPlan(bad, profile(), 'en'), 'en', ['Can my father walk after 10?']);
    expect(ctx.outdoorHours).toMatch(/: none in the next 24 hours$/);
  });
});
