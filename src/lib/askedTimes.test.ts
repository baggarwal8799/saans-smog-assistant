import { describe, expect, it } from 'vitest';
import { profile } from '../test/fixtures';
import { INDIA, airReport } from '../test/scenarios';
import { askedTimeFact, askedTimeFacts, askedTimes, nowFact, parseTimes } from './askedTimes';
import { buildContext } from './context';
import { buildPlan } from './recommend';
import { endTime } from './windows';

const clock = (h: number, m: number) => ({
  label: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
  hours: [h],
  m,
});
const hm = (texts: string[]) =>
  parseTimes(texts).map((t) => `${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}`);

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

  it('says the next 07:30 is tomorrow, gives its forecast figures and flags it INSIDE the smog trap', () => {
    const fact = askedTimeFact(clock(7, 30), r, plan);
    const point = r.hourly.find((p) => p.time.endsWith('T07:00'));
    expect(plan.smogTrap).not.toBeNull();
    expect(fact).toMatch(/^Asked time 07:30 tomorrow: /);
    expect(fact).toContain(
      `US AQI ≈ ${Math.round(point?.usAqi ?? -1)}, PM2.5 ≈ ${Math.round(point?.pm25 ?? -1)} µg/m³`,
    );
    expect(fact).toMatch(/INSIDE the smog trap \(18:00 today to 08:00 tomorrow\)/);
    expect(fact).toMatch(/inside the most polluted window \(\d\d:00–\d\d:00 (today|tomorrow)\): (yes|no)/);
  });

  it('flags a midday time outside the trap, and a time later in the current hour as today', () => {
    expect(askedTimeFact(clock(13, 0), r, plan)).toMatch(/^Asked time 13:00 tomorrow: .*outside the smog trap/);
    expect(askedTimeFact(clock(17, 30), r, plan)).toMatch(/^Asked time 17:30 today: /);
  });

  it('says when a time asked for "today" has already passed (asked "4 pm today" at 17:00)', () => {
    expect(askedTimeFacts(['Can the kids play in the park at 4 pm today?'], r, plan)[0]).toMatch(
      /16:00 today has already passed; the figures are for tomorrow\./,
    );
    expect(askedTimeFacts(['Can the kids play in the park at 4 pm?'], r, plan)[0]).not.toMatch(/already passed/);
    expect(askedTimeFacts(['आज शाम 6 बजे?'], r, plan)[0]).not.toMatch(/already passed/);
  });

  it('lets the current question decide: a later "evening walk?" is answered for the evening, not the earlier 7:30', () => {
    expect(
      askedTimeFacts(['And what about his evening walk?', 'Can the kids go out at 7:30?'], r, plan).map((f) =>
        f.slice(0, 39),
      ),
    ).toEqual(['Asked time evening (17:00–20:00) today:']);
    expect(askedTimeFacts(['And for my father?', 'Can the kids go out at 7:30?'], r, plan)[0]).toMatch(
      /^Asked time 07:30/,
    );
    expect(
      askedTimeFacts(['What about 18:00?', 'Can the kids go out at 7:30?'], r, plan).map((f) => f.slice(0, 16)),
    ).toEqual(['Asked time 18:00']);
  });

  it('lands in CONTEXT only for times the user said', () => {
    expect(buildContext({ report: r, profile: profile(), plan, lang: 'en' }).askedTimes).toEqual([]);
    const facts = buildContext({
      report: r,
      profile: profile(),
      plan,
      lang: 'en',
      said: ['Is 7:30 ok, or शाम 6 बजे?'],
    }).askedTimes;
    expect(facts.map((f) => f.slice(0, 22))).toEqual(['Asked time 07:30 tomor', 'Asked time 18:00 today']);
    expect(askedTimeFacts(['1:00 2:00 3:00 4:00 5:00'], r, plan)).toHaveLength(4);
  });

  it('says plainly when no smog trap is forecast', () => {
    expect(askedTimeFact(clock(13, 0), r, { ...plan, smogTrap: null })).toContain('no smog trap forecast');
  });

  it('places now after a span that has already ended, and says when there is no span at all', () => {
    const ended = {
      smogTrap: { start: '2026-11-17T08:00', end: '2026-11-17T11:00', minMixingM: 40, avgWindKmh: 3 },
      worstWindow: null,
    };
    expect(nowFact(r, ended)).toBe(`Now (17:00 today) is after the smog trap (08:00–11:00 today).`);
    expect(nowFact(r, { smogTrap: null, worstWindow: null })).toBe(
      'Now (17:00 today) is in no smog trap or polluted window.',
    );
  });

  it('says so when the forecast does not reach the time', () => {
    const short = { ...r, hourly: r.hourly.slice(0, 3) };
    expect(askedTimeFact(clock(7, 30), short, plan)).toBe(
      'Asked time 07:30: outside the 24 h forecast, so no figures for it.',
    );
  });
});

describe('parts of the day', () => {
  const r = airReport({ aqi: 180, weather: 'nightTrap', startHour: 17, place: INDIA });
  const plan = buildPlan(r, profile(), 'en');
  const labels = (text: string) => askedTimes(text).map((t) => t.label);

  it.each([
    ['my father has asthma, morning walk at 7', ['morning (06:00–10:00)']],
    ['Can she jog at noon?', ['afternoon (12:00–16:00)']],
    ['क्या माँ शाम को टहल सकती हैं?', ['evening (17:00–20:00)']],
    ['रात को बाहर?', ['night (20:00–00:00)']],
    ['सुबह की सैर', ['morning (06:00–10:00)']],
    // A day part said with its clock time is that time; one said apart from any clock time is a span of its own.
    ['शाम 6 बजे पार्क?', ['18:00']],
    ['रात 2 बजे', ['02:00']],
    ['7:30 in the morning or in the evening?', ['07:30', 'evening (17:00–20:00)']],
    ['Is it शामिल in the plan?', []],
  ])('%s → %j', (text, expected) => {
    expect(labels(text)).toEqual(expected);
  });

  it('judges a part of the day at its worst hour, and flags it INSIDE the trap when any of its hours is', () => {
    const fact = askedTimeFacts(['Morning walk for my father?'], r, plan)[0] ?? '';
    const morning = r.hourly.slice(0, 24).filter((p) => ['06', '07', '08', '09'].includes(p.time.slice(11, 13)));
    const worst = Math.max(...morning.map((p) => p.usAqi));
    expect(fact).toMatch(/^Asked time morning \(06:00–10:00\) tomorrow: worst hour \d\d:00, /);
    expect(fact).toContain(`US AQI ≈ ${worst}`);
    expect(fact).toMatch(/INSIDE the smog trap/);
    expect(
      buildContext({ report: r, profile: profile(), plan, lang: 'en', said: ['शाम को बच्चे पार्क में खेल सकते हैं?'] })
        .askedTimes[0],
    ).toMatch(/^Asked time evening \(17:00–20:00\) today: .*INSIDE the smog trap/);
  });
});

describe('endTime', () => {
  it('rolls over to the next day after 23:00, so "inside the window" works across midnight', () => {
    expect(endTime('2026-11-17T22:00')).toBe('2026-11-17T23:00');
    expect(endTime('2026-11-17T23:00')).toBe('2026-11-18T00:00');
    expect(endTime('2026-11-30T23:00')).toBe('2026-12-01T00:00');
  });
});
