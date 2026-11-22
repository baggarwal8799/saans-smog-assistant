// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ungroundedNumbers } from './numbers';
import { promptFor, summary } from '../../src/test/apiHelpers';

describe('numbers: grounding', () => {
  const ctx = promptFor(summary());

  it('passes numbers from CONTEXT, times, years, roundings and small counts', () => {
    const ok = [
      'PM2.5 is 210 µg/m³; the 14:00–16:00 window is ≈ 83 µg/m³. An N95 cuts it ≈ 80%.',
      'About 8 cigarettes a day in 2026. Air out at 2 pm for 2 h. 3 steps.',
      'Saves 31 kg CO₂ a month; PM10 and FFP2 are fine.',
      'PM2.5 २१० है, शाम 7 बजे सबसे ज़्यादा।',
    ];
    for (const answer of ok) expect(ungroundedNumbers(answer, ctx)).toEqual([]);
  });

  it('flags invented digits, including Devanagari digits and thousands separators', () => {
    expect(ungroundedNumbers('AQI is 999 and masks cut 65%.', ctx)).toEqual([999, 65]);
    // Clock hours in CONTEXT ground a time, not a quantity: "AQI 12" is not grounded by "12:00".
    expect(ungroundedNumbers('AQI 12 at 12:00.', ctx)).toEqual([12]);
    expect(ungroundedNumbers('PM2.5 ३३३ है और 67 सिगरेट।', ctx)).toEqual([333, 67]);
    expect(ungroundedNumbers('It saves 1,200 kg.', ctx)).toEqual([1200]);
  });

  it('counts numbers from the system rules as grounded ("AQI 151 or higher" was flagged live)', () => {
    const answer = 'Since the US AQI is 151 or higher, the risk applies to everyone.';
    expect(ungroundedNumbers(answer, 'US AQI 166')).toEqual([]);
  });

  it('does not count the digits rule example "7" as a fact', () => {
    expect(ungroundedNumbers('That is like 7 cigarettes.', 'US AQI 166')).toEqual([7]);
  });
});
