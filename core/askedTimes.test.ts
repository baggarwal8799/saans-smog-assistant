import { describe, expect, it } from 'vitest';

import { profile } from '../test/fixtures.js';
import { airReport, INDIA } from '../test/scenarios.js';
import { type AskedTime, askedTimeFact, askedTimeFacts, askedTimes, nowFact, parseTimes } from './askedTimes.js';
import { isoHour } from './isoTime.js';
import { buildPlan } from './recommend.js';
import { endTime } from './windows.js';

const clock = (hour: number, minute: number): AskedTime => ({ hours: [hour], minute, dayPart: null });
const hhmm = (hour: number, minute: number) => `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
const hm = (texts: string[]) => parseTimes(texts).map((t) => hhmm(t.hour, t.minute));

describe('parseTimes', () => {
  it.each([
    ['Is 7:30 ok for the school bus?', ['07:30']],
    ['Leave at 7 am or 6 pm?', ['07:00', '18:00']],
    ['7:30pm, 12 a.m. and 12 pm', ['19:30', '00:00', '12:00']],
    ['between 10:00–12:00', ['10:00', '12:00']],
    ['शाम 6 बजे पार्क?', ['18:00']],
    ['सुबह 7 बजे और शाम को 5 बजे', ['07:00', '17:00']],
    ['रात 10 बजे, रात 2 बजे, दोपहर 2 बजे', ['22:00', '02:00', '14:00']],
    ['सुबह ७:३० बजे', ['07:30']],
    ['रात 12 बजे, दोपहर 12 बजे', ['00:00', '12:00']],
  ])('%s → %j', (text, expected) => {
    expect(hm([text])).toEqual(expected);
  });

  it('ignores numbers that are not times, and repeats', () => {
    expect(hm(['PM2.5 is 210, my father is 70, 3 kids, 10 km'])).toEqual([]);
    expect(hm(['25:00 or 13 pm'])).toEqual([]);
    expect(hm(['At 7:30?', 'And 7:30 again, then 7 am'])).toEqual(['07:30', '07:00']);
  });
});

describe('asked-time facts', () => {
  // Fixture: now 17:00; the smog trap runs 18:00–08:00 (still, shallow night air).
  const r = airReport({ aqi: 180, weather: 'nightTrap', startHour: 17, place: INDIA });
  const plan = buildPlan(r, profile(), 'en');
  const first = (texts: string[]) => askedTimeFacts(texts, r, plan)[0];

  it('says the next 07:30 is tomorrow, judges its forecast hour and flags it INSIDE the smog trap', () => {
    const { forecast } = askedTimeFact(clock(7, 30), r, plan);
    expect(plan.smogTrap).not.toBeNull();
    expect(forecast?.day).toBe('tomorrow');
    expect(forecast?.worst).toEqual(r.hourly.find((p) => p.time.endsWith('T07:00')));
    expect(forecast?.smogTrap).toEqual({ span: plan.smogTrap, inside: true });
    expect(forecast?.worstWindow?.span).toEqual(plan.worstWindow);
    expect(forecast?.severalHours).toBe(false);
  });

  it('flags a midday time outside the trap, and a time later in the current hour as today', () => {
    const midday = askedTimeFact(clock(13, 0), r, plan).forecast;
    expect([midday?.day, midday?.smogTrap?.inside]).toEqual(['tomorrow', false]);
    expect(askedTimeFact(clock(17, 30), r, plan).forecast?.day).toBe('today');
  });

  it('says when a time asked for "today" has already passed (asked "4 pm today" at 17:00)', () => {
    expect(first(['Can the kids play in the park at 4 pm today?'])?.forecast?.passedToday).toBe(true);
    expect(first(['Can the kids play in the park at 4 pm?'])?.forecast?.passedToday).toBe(false);
    expect(first(['आज शाम 6 बजे?'])?.forecast?.passedToday).toBe(false);
  });

  const currentQuestionDecides =
    'lets the current question decide: ' + 'a later "evening walk?" is answered for the evening, not the earlier 7:30';
  it(currentQuestionDecides, () => {
    const evening = askedTimeFacts(['And what about his evening walk?', 'Can the kids go out at 7:30?'], r, plan);
    expect(evening.map((f) => [f.time, f.forecast?.day])).toEqual([
      [{ hours: [17, 18, 19], minute: 0, dayPart: 'evening' }, 'today'],
    ]);
    expect(first(['And for my father?', 'Can the kids go out at 7:30?'])?.time).toEqual(clock(7, 30));
    expect(askedTimeFacts(['What about 18:00?', 'Can the kids go out at 7:30?'], r, plan).map((f) => f.time)).toEqual([
      clock(18, 0),
    ]);
  });

  it('gives no facts without a time, and at most four', () => {
    expect(askedTimeFacts([], r, plan)).toEqual([]);
    expect(askedTimeFacts(['1:00 2:00 3:00 4:00 5:00'], r, plan)).toHaveLength(4);
  });

  it('has no smog trap to judge when none is forecast', () => {
    expect(askedTimeFact(clock(13, 0), r, { ...plan, smogTrap: null }).forecast?.smogTrap).toBeNull();
  });

  it('places now after a span that has already ended, and has nothing to place when there is no span', () => {
    const smogTrap = { start: '2026-11-17T08:00', end: '2026-11-17T11:00', minMixingM: 40, avgWindKmh: 3 };
    expect(nowFact(r, { smogTrap, worstWindow: null })).toEqual({
      now: r.current.time,
      smogTrap: { span: smogTrap, relation: 'after' },
      worstWindow: null,
    });
    expect(nowFact(r, { smogTrap: null, worstWindow: null })).toEqual({
      now: r.current.time,
      smogTrap: null,
      worstWindow: null,
    });
  });

  it('has no forecast when the forecast does not reach the time', () => {
    const short = { ...r, hourly: r.hourly.slice(0, 3) };
    expect(askedTimeFact(clock(7, 30), short, plan)).toEqual({
      time: clock(7, 30),
      now: r.current.time,
      forecast: null,
    });
  });
});

describe('parts of the day', () => {
  const r = airReport({ aqi: 180, weather: 'nightTrap', startHour: 17, place: INDIA });
  const plan = buildPlan(r, profile(), 'en');
  const named = (text: string) => askedTimes(text).map((t) => t.dayPart ?? hhmm(t.hours[0] ?? -1, t.minute));

  it.each([
    ['my father has asthma, morning walk at 7', ['morning']],
    ['Can she jog at noon?', ['afternoon']],
    ['क्या माँ शाम को टहल सकती हैं?', ['evening']],
    ['रात को बाहर?', ['night']],
    ['सुबह की सैर', ['morning']],
    // A day part said with its clock time is that time; one said apart from any clock time is a span of its own.
    ['शाम 6 बजे पार्क?', ['18:00']],
    ['रात 2 बजे', ['02:00']],
    ['7:30 in the morning or in the evening?', ['07:30', 'evening']],
    ['Is it शामिल in the plan?', []],
  ])('%s → %j', (text, expected) => {
    expect(named(text)).toEqual(expected);
  });

  it('covers the hours of each part of the day', () => {
    expect(askedTimes('morning, afternoon, evening and night').map((t) => t.hours)).toEqual([
      [6, 7, 8, 9],
      [12, 13, 14, 15],
      [17, 18, 19],
      [20, 21, 22, 23],
    ]);
  });

  it('judges a part of the day at its worst hour, and flags it INSIDE the trap when any of its hours is', () => {
    const forecast = askedTimeFacts(['Morning walk for my father?'], r, plan)[0]?.forecast;
    const morning = r.hourly.slice(0, 24).filter((p) => ['06', '07', '08', '09'].includes(isoHour(p.time)));
    expect(forecast?.day).toBe('tomorrow');
    expect(forecast?.severalHours).toBe(true);
    expect(forecast?.worst.usAqi).toBe(Math.max(...morning.map((p) => p.usAqi)));
    expect(forecast?.smogTrap?.inside).toBe(true);
    const evening = askedTimeFacts(['शाम को बच्चे पार्क में खेल सकते हैं?'], r, plan)[0];
    expect([evening?.time.dayPart, evening?.forecast?.day, evening?.forecast?.smogTrap?.inside]).toEqual([
      'evening',
      'today',
      true,
    ]);
  });
});

describe('endTime', () => {
  it('rolls over to the next day after 23:00, so "inside the window" works across midnight', () => {
    expect(endTime('2026-11-17T22:00')).toBe('2026-11-17T23:00');
    expect(endTime('2026-11-17T23:00')).toBe('2026-11-18T00:00');
    expect(endTime('2026-11-30T23:00')).toBe('2026-12-01T00:00');
  });
});
