// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { profile } from '../../src/test/fixtures';
import { MEDICAL_LINE, needsMedicalLine, safetyLines } from './medical';
import { ungroundedNumbers } from './numbers';
import { nonDevanagariWords } from './script';
import { ask, summary } from '../../src/test/apiHelpers';

describe('medical line, added by code', () => {
  it('is needed when the household, the question or an earlier question involves a condition or symptoms', () => {
    // Models tend to drop the medical line on a follow-up, so a condition named earlier still counts.
    const father = ask('What should he do this evening?', { history: ['My 70-year-old father has asthma.'] });
    expect(needsMedicalLine(father)).toBe(true);
    expect(needsMedicalLine(ask('My son keeps coughing. Can he go to school?'))).toBe(true);
    expect(needsMedicalLine(ask('Is it ok for someone with a heart condition to walk?'))).toBe(true);
    expect(needsMedicalLine(ask('बेटे को खाँसी है, क्या वह बाहर जा सकता है?', { lang: 'hi' }))).toBe(true);
    expect(needsMedicalLine(ask('पिताजी को दमा है।', { lang: 'hi' }))).toBe(true);
    expect(needsMedicalLine(summary({ profile: profile({ hasRespiratory: true }) }))).toBe(true);
  });

  it('is not needed otherwise, and "Delhi" (दिल्ली) is not "heart" (दिल)', () => {
    expect(needsMedicalLine(ask('Can my kids play in the park this evening?'))).toBe(false);
    expect(needsMedicalLine(ask('दिल्ली में आज बच्चे बाहर खेल सकते हैं?', { lang: 'hi' }))).toBe(false);
    expect(needsMedicalLine(ask('Which mask should I buy?'))).toBe(false);
    expect(needsMedicalLine(summary())).toBe(false);
  });

  it('gives the medical line in the request language, last', () => {
    const father = ask('What should he do?', { history: ['My father has a heart condition.'] });
    expect(safetyLines(father)).toEqual([MEDICAL_LINE.en]);
    expect(safetyLines(ask('पिताजी को दिल की बीमारी है, क्या करें?', { lang: 'hi' }))).toEqual([MEDICAL_LINE.hi]);
    expect(safetyLines(ask('Can kids play outside?'))).toEqual([]);
  });

  it('is fixed text the content checks would pass, since it is shown unchecked: no numbers, pure Devanagari', () => {
    for (const line of [MEDICAL_LINE.en, MEDICAL_LINE.hi]) expect(ungroundedNumbers(line, '')).toEqual([]);
    expect(nonDevanagariWords(MEDICAL_LINE.hi)).toEqual([]);
  });

  it('adds the carbon-monoxide and inhaler lines when the user raises those topics, before the medical line', () => {
    expect(safetyLines(ask('Can we sleep with the coal angithi lit tonight?')).join()).toMatch(/carbon monoxide/);
    expect(safetyLines(ask('क्या रात में अंगीठी जलाकर सो सकते हैं?', { lang: 'hi' })).join()).toMatch(/कार्बन मोनोऑक्साइड/);
    const asthma = safetyLines(ask('What should my grandmother with asthma do today?'));
    expect(asthma[0]).toMatch(/reliever inhaler/);
    expect(asthma.at(-1)).toBe(MEDICAL_LINE.en);
    expect(safetyLines(ask('When should I air the house?'))).toEqual([]);
  });
});
