import { describe, expect, it } from 'vitest';

import { askedTimes } from '../core/askedTimes.js';
import { CHILD_MASK_NOTE } from '../core/copy/masks.js';
import { buildPlan } from '../core/recommend.js';
import type { AirReport, SmogTrap } from '../core/types.js';
import { profile, report } from '../test/fixtures.js';
import { airReport, INDIA } from '../test/scenarios.js';
import { buildContext } from './context.js';
import { askedLabel, askedTimeLines, bandLine, nowLine, outdoorHoursLine, outdoorLines } from './promptFacts.js';

// Now 17:00; the smog trap runs 18:00–08:00 (still, shallow night air).
const evening = airReport({ aqi: 180, weather: 'nightTrap', startHour: 17, place: INDIA });
const plan = buildPlan(evening, profile(), 'en');
const lines = (said: string[], r: AirReport = evening) => askedTimeLines(said, r, plan);
const trap = (start: string, end: string): SmogTrap => ({ start, end, minMixingM: 40, avgWindKmh: 3 });

describe('askedLabel', () => {
  it.each([
    ['Is 7:30 ok?', ['07:30']],
    ['my father has asthma, morning walk at 7', ['morning (06:00–10:00)']],
    ['Can she jog at noon?', ['afternoon (12:00–16:00)']],
    ['रात को बाहर?', ['night (20:00–00:00)']],
    ['7:30 in the morning or in the evening?', ['07:30', 'evening (17:00–20:00)']],
  ])('%s → %j', (text, expected) => {
    expect(askedTimes(text).map(askedLabel)).toEqual(expected);
  });
});

describe('asked-time lines', () => {
  it('gives the forecast figures for the next 07:30 and flags it INSIDE the smog trap', () => {
    const [line] = lines(['Is 7:30 ok?']);
    const point = evening.hourly.find((p) => p.time.endsWith('T07:00'));
    expect(line).toMatch(/^Asked time 07:30 tomorrow: US AQI ≈ \d+, PM2\.5 ≈ \d+ µg\/m³, /);
    expect(line).toContain(
      `US AQI ≈ ${Math.round(point?.usAqi ?? -1)}, PM2.5 ≈ ${Math.round(point?.pm25 ?? -1)} µg/m³`,
    );
    expect(line).toMatch(/INSIDE the smog trap \(18:00 today to 08:00 tomorrow\)/);
    expect(line).toMatch(/inside the most polluted window \(\d\d:00–\d\d:00 (today|tomorrow)\): (yes|no)/);
    expect(line).toMatch(/inside the cleanest window \(.+\): (yes|no)\.$/);
  });

  it('says outside, today, already passed, and no trap in words the model can quote', () => {
    expect(lines(['At 13:00?'])[0]).toMatch(/^Asked time 13:00 tomorrow: .*outside the smog trap/);
    expect(lines(['At 17:30?'])[0]).toMatch(/^Asked time 17:30 today: /);
    expect(lines(['Can the kids play in the park at 4 pm today?'])[0]).toMatch(
      / 16:00 today has already passed; the figures are for tomorrow\.$/,
    );
    expect(lines(['Can the kids play in the park at 4 pm?'])[0]).not.toMatch(/already passed/);
    expect(askedTimeLines(['At 13:00?'], evening, { ...plan, smogTrap: null })[0]).toContain('no smog trap forecast');
  });

  it('names the worst hour of a part of the day', () => {
    expect(lines(['Morning walk for my father?'])[0]).toMatch(
      /^Asked time morning \(06:00–10:00\) tomorrow: worst hour \d\d:00, US AQI ≈ \d+, .*INSIDE the smog trap/,
    );
  });

  it('says so when the forecast does not reach the time', () => {
    expect(lines(['Is 7:30 ok?'], { ...evening, hourly: evening.hourly.slice(0, 3) })).toEqual([
      'Asked time 07:30: outside the 24 h forecast, so no figures for it.',
    ]);
  });
});

describe('the "Now" line', () => {
  const at = (time: string): AirReport => ({ ...evening, current: { ...evening.current, time } });
  const worstWindow = { start: '2026-11-19T18:00', end: '2026-11-19T20:00', avgPm25: 120 };

  it('says before, INSIDE and after, with each span in words', () => {
    expect(
      nowLine(at('2026-11-19T10:30'), { smogTrap: trap('2026-11-19T16:00', '2026-11-20T10:00'), worstWindow }),
    ).toBe(
      'Now (10:30 today) is before the smog trap (16:00 today to 10:00 tomorrow) ' +
        'and before the most polluted window (18:00–20:00 today).',
    );
    expect(
      nowLine(at('2026-11-19T23:30'), { smogTrap: trap('2026-11-19T23:00', '2026-11-20T08:00'), worstWindow: null }),
    ).toBe('Now (23:30 today) is INSIDE the smog trap (23:00 today to 08:00 tomorrow).');
    expect(nowLine(evening, { smogTrap: trap('2026-11-17T08:00', '2026-11-17T11:00'), worstWindow: null })).toBe(
      'Now (17:00 today) is after the smog trap (08:00–11:00 today).',
    );
    expect(nowLine(evening, { smogTrap: null, worstWindow: null })).toBe(
      'Now (17:00 today) is in no smog trap or polluted window.',
    );
  });
});

describe('the US EPA band line', () => {
  it('quotes the band and names the sensitive members the household has', () => {
    expect(bandLine(52, profile({ hasChildren: false, hasRespiratory: true }))).toBe(
      'US EPA guidance for Moderate air (US AQI 51–100): ' +
        'unusually sensitive people should consider reducing prolonged or heavy exertion outdoors. ' +
        'This household has someone with a heart or lung condition (US EPA sensitive groups): ' +
        'say what this means for them.',
    );
    expect(bandLine(161, profile({ hasChildren: true, hasElderly: true, hasRespiratory: true }))).toContain(
      'This household has children, older adults, someone with a heart or lung condition (US EPA sensitive groups)',
    );
    expect(bandLine(120, profile({ hasChildren: false }))).toBe(
      'US EPA guidance for Unhealthy for sensitive groups air (US AQI 101–150): ' +
        'sensitive groups should reduce prolonged or heavy exertion outdoors.',
    );
    expect(bandLine(40, profile())).toBe('');
  });
});

describe('the outdoor activity lines', () => {
  const line = (aqi: number, q: string, lang: 'en' | 'hi' = 'en') =>
    outdoorLines(q, report({ usAqi: aqi }), profile({ hasChildren: false }), lang).lines[0] ?? '';

  it('says "avoid" for a child at AQI 161, with the plan\'s own mask note, and the plain reply', () => {
    const f = outdoorLines('Can my 7-year-old kid play in the park?', report({ usAqi: 161 }), profile(), 'en');
    expect(f.reply).toBe('no');
    expect(f.lines[0]).toMatch(
      new RegExp(
        String.raw`^US EPA activity guidance now \(US AQI ≈ 161\): children: ` +
          String.raw`avoid prolonged or heavy exertion outdoors; move it indoors ` +
          String.raw`or to an hour listed as fit for outdoor activity \(a mask does not make it safe; `,
      ),
    );
    expect(f.lines[0]).toContain(`${CHILD_MASK_NOTE.en}). The yes/no answer for each: children: No.`);
  });

  it("hands over EPA's own words for each kind of advice", () => {
    expect(line(163, 'Can my father, who has asthma, walk?')).toMatch(
      new RegExp(
        String.raw`father: avoid prolonged or heavy exertion outdoors; ` +
          String.raw`if a short trip out cannot wait, keep it gentle; move it indoors.*father: No\.`,
      ),
    );
    expect(line(163, 'Can my father, who has asthma, play cricket?')).toMatch(
      /father: avoid prolonged or heavy exertion outdoors; move it indoors/,
    );
    expect(line(163, 'Can my 40-year-old brother jog?')).toMatch(
      new RegExp(
        String.raw`: reduce prolonged or heavy exertion outdoors, with more breaks\. ` +
          String.raw`The yes\/no answer for each: .*: Only briefly and gently\.$`,
      ),
    );
    expect(line(250, 'Can my father, who has asthma, walk?')).toMatch(/father: avoid all physical activity outdoors/);
    expect(line(250, 'Can I jog?')).toMatch(/the person asking: avoid prolonged or heavy exertion outdoors/);
    expect(line(40, 'Can I jog?')).toMatch(
      /: the person asking: outdoor activity is fine\. .*: the person asking: Yes\.$/,
    );
  });

  it('labels each asked time, spells out mixed replies, and answers in the reply language', () => {
    const q = 'Can my kids and my father walk at 7:00 and in the evening?';
    const times = outdoorLines(q, report({ usAqi: 161 }), profile(), 'en');
    expect(times.lines).toEqual([
      expect.stringMatching(/^US EPA activity guidance at 07:00 \(US AQI ≈ \d+\): children: .*; father: /),
      expect.stringMatching(/^US EPA activity guidance in the evening \(17:00–20:00\) \(US AQI ≈ \d+\): /),
    ]);
    expect(line(161, 'Can my kids and my father go for a walk?')).toMatch(
      /children: No; father: Only briefly and gently\.$/,
    );
    const hindi = line(161, 'क्या बच्चे पार्क में खेल सकते हैं?', 'hi');
    expect(hindi).toMatch(/The yes\/no answer for each: children: नहीं\.$/);
    expect(outdoorLines('How do I clean the purifier filter?', report({ usAqi: 161 }), profile(), 'en')).toEqual({
      lines: [],
    });
  });
});

describe('the outdoor hours line', () => {
  const nobody = profile({ hasChildren: false, hasElderly: false, hasRespiratory: false });

  it('lists fit spans, or none, and says whom they were judged for', () => {
    const clean = airReport({ aqi: 20, weather: 'none', startHour: 10, place: INDIA });
    expect(outdoorHoursLine(clean, profile(), '')).toBe(
      'Hours fit for outdoor activity for this household (judged for its US EPA sensitive groups): ' +
        '10:00 today to 10:00 tomorrow',
    );
    expect(outdoorHoursLine(clean, nobody, '')).toMatch(/\(US EPA guidance for everyone\): /);
    expect(outdoorHoursLine(evening, profile(), '')).toBe(
      'Hours fit for outdoor activity for this household (judged for its US EPA sensitive groups): ' +
        'none in the next 24 hours',
    );
  });
});

describe('CONTEXT', () => {
  it('carries these lines, and asked times only for times the user said', () => {
    const said = ['Can the kids go out at 7:30, or शाम 6 बजे?'];
    const ctx = buildContext({ report: evening, profile: profile(), plan, lang: 'en', said });
    expect(ctx.now).toBe(nowLine(evening, plan));
    expect(ctx.outdoorHours).toBe(outdoorHoursLine(evening, profile(), said[0] ?? ''));
    expect(ctx.epaBand).toBe(bandLine(evening.current.usAqi, profile()));
    const outdoor = outdoorLines(said[0] ?? '', evening, profile(), 'en');
    expect(ctx.askedTimes).toEqual([...lines(said), ...outdoor.lines]);
    expect(ctx.askedTimes.map((f) => f.slice(0, 22)).slice(0, 2)).toEqual([
      'Asked time 07:30 tomor',
      'Asked time 18:00 today',
    ]);
    expect(ctx.epaReply).toBe(outdoor.reply);
    expect(buildContext({ report: evening, profile: profile(), plan, lang: 'en' }).askedTimes).toEqual([]);
  });
});
