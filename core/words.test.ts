import { describe, expect, it } from 'vitest';

import { compileWords } from './words.js';

describe('compileWords', () => {
  it('matches whole words, or word starts with `prefix`, at ASCII word edges', () => {
    const whole = compileWords([{ edge: 'word', words: ['walk', 'bus stop'] }], 'i');
    const start = compileWords([{ edge: 'word', prefix: true, words: ['walk'] }], 'i');
    expect(['a Walk.', 'the bus stop', 'walking', 'sidewalk'].map((s) => whole.test(s))).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(['walking', 'sidewalk'].map((s) => start.test(s))).toEqual([true, false]);
  });

  it('keeps Devanagari words whole with a `letter` edge, where \\b does not apply', () => {
    const re = compileWords([{ edge: 'letter', words: ['दिल'] }]);
    expect(['मेरा दिल', 'दिलचस्प', 'बेदिल'].map((s) => re.test(s))).toEqual([true, false, false]);
  });

  it('matches `anywhere` entries inside longer words, and treats entries as plain text', () => {
    const re = compileWords([{ edge: 'anywhere', words: ['heater', 'a.b'] }]);
    expect(['waterheater', 'a.b', 'axb'].map((s) => re.test(s))).toEqual([true, true, false]);
  });
});
