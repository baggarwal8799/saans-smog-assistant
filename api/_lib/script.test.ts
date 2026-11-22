// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { nonDevanagariWords } from './script';

describe('script: Devanagari only in Hindi', () => {
  it('passes Devanagari with Latin acronyms and units', () => {
    const answer =
      'नहीं। शाम 19:00–21:00 में PM2.5 ≈ 230 µg/m³ रहेगा; बच्चों को घर में रखें, बाहर N95 पहनाएँ। CO₂ और AQI भी।';
    expect(nonDevanagariWords(answer)).toEqual([]);
  });

  it('flags Arabic or Urdu letters, Latin words and English glosses', () => {
    expect(nonDevanagariWords('नहीं, बच्चों को घर में رکھیں।')).toEqual(['رکھیں']);
    expect(nonDevanagariWords('नहीं, आज smog बहुत है।')).toEqual(['smog']);
    expect(nonDevanagariWords('स्मॉग जाल (smog trap) में घर पर रहें।')).toEqual(['smog', 'trap']);
    expect(nonDevanagariWords('PM2.5 साँس में जाएगा।')).toEqual(['साँس']);
  });
});
