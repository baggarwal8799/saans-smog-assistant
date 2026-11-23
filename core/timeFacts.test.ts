import { describe, expect, it } from 'vitest';

import { DELHI, profile } from '../test/fixtures.js';
import { type AskedTime, askedTimeFact, forecastAt, nowFact } from './askedTimes.js';
import { isoDateHour, isoHour } from './isoTime.js';
import { fitSpans, outdoorHours } from './outdoorHours.js';
import type { AirReport, Plan, SmogTrap } from './types.js';
import { addHours, within } from './windows.js';

const DAY = '2026-11-19';
/** A report at `now` with 30 forecast hours from the current hour; `aqiAt(h)` gives each hour's US AQI. */
function at(now: string, aqiAt: (hour: number) => number): AirReport {
  const first = `${isoDateHour(now)}:00`;
  const hourly = Array.from({ length: 30 }, (_, i) => {
    const time = addHours(first, i);
    const usAqi = aqiAt(Number(isoHour(time)));
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
const clock = (hour: number, minute = 0): AskedTime => ({ hours: [hour], minute, dayPart: null });

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

  it('places 10:30 before a trap that starts at 16:00, never inside it', () => {
    const fact = nowFact(r, { smogTrap: trap(`${DAY}T16:00`, '2026-11-20T10:00'), worstWindow });
    expect([fact.smogTrap?.relation, fact.worstWindow?.relation]).toEqual(['before', 'before']);
  });

  it('places now inside a span that crosses midnight', () => {
    const late = at(`${DAY}T23:30`, () => 190);
    const fact = nowFact(late, { smogTrap: trap(`${DAY}T23:00`, '2026-11-20T08:00'), worstWindow: null });
    expect([fact.now, fact.smogTrap?.relation, fact.worstWindow]).toEqual([`${DAY}T23:30`, 'inside', null]);
  });
});

describe('asked times against the clock', () => {
  const r = at(`${DAY}T10:30`, (h) => 100 + h);
  const plan = { smogTrap: trap(`${DAY}T16:00`, '2026-11-20T10:00'), worstWindow: null, bestWindow: null } as Plan;

  it('flags 10:45 as outside a trap that starts at 16:00, and 07:00 tomorrow inside it', () => {
    const soon = askedTimeFact(clock(10, 45), r, plan).forecast;
    expect([soon?.day, soon?.smogTrap?.inside]).toEqual(['today', false]);
    const early = askedTimeFact(clock(7), r, plan).forecast;
    expect([early?.day, early?.smogTrap?.inside]).toEqual(['tomorrow', true]);
  });

  it("reads a clock time already past this hour as tomorrow's, and keeps the current hour of a day part", () => {
    expect(forecastAt(clock(10, 15), r).points.map((p) => p.time)).toEqual(['2026-11-20T10:00']);
    const morning: AskedTime = { hours: [6, 7, 8, 9, 10], minute: 0, dayPart: 'morning' };
    expect(forecastAt(morning, r).points[0]?.time).toBe(`${DAY}T10:00`);
  });
});

describe('hours fit for outdoor activity', () => {
  // Unhealthy (≈ 193) until 13:00, then Good for three hours, then Unhealthy again.
  const r = at(`${DAY}T10:30`, (h) => (h >= 13 && h < 16 ? 45 : 193));
  const nobody = profile({ hasChildren: false, hasElderly: false, hasRespiratory: false });

  it('merges fit hours into spans and never lists 10:00 at US AQI 193', () => {
    expect(outdoorHours(r, profile())).toEqual({
      sensitive: true,
      spans: [{ start: `${DAY}T13:00`, end: `${DAY}T16:00` }],
    });
    expect(fitSpans(r, { sensitive: true }).some((w) => within(`${DAY}T10:00`, w))).toBe(false);
  });

  it('judges a 70-year-old father named in the question as sensitive, even when the profile lists no elderly', () => {
    const usg = at(`${DAY}T10:30`, (h) => (h < 12 ? 130 : 193));
    expect(outdoorHours(usg, nobody)).toEqual({
      sensitive: false,
      spans: [
        { start: `${DAY}T10:30`, end: `${DAY}T12:00` },
        { start: '2026-11-20T00:00', end: '2026-11-20T10:30' },
      ],
    });
    expect(outdoorHours(usg, nobody, 'When can my 70-year-old father walk?')).toEqual({ sensitive: true, spans: [] });
  });

  it('has no spans when no hour in the next 24 hours is fit', () => {
    expect(
      outdoorHours(
        at(`${DAY}T10:30`, () => 193),
        profile(),
      ).spans,
    ).toEqual([]);
  });
});
