import { describe, expect, it } from 'vitest';

import { DELHI, profile } from '../../test/fixtures.js';
import { type AnswerContext, answerContextId } from './answerContext.js';

const base: AnswerContext = { lang: 'en', place: DELHI, profile: profile(), at: '2026-11-17T12:00' };

describe('answerContextId', () => {
  it('is short and the same for the same context', () => {
    const id = answerContextId(base);
    expect(id).toMatch(/^[0-9a-z]{1,7}$/);
    expect(answerContextId({ ...base, place: { ...DELHI }, profile: profile() })).toBe(id);
  });

  it.each<[string, Partial<AnswerContext>]>([
    ['language', { lang: 'hi' }],
    ['air reading', { at: '2026-11-17T13:00' }],
    ['place', { place: { ...DELHI, lat: 28.62 } }],
    ['place name', { place: { ...DELHI, name: 'Delhi' } }],
    ['household', { profile: profile({ hasPurifier: !base.profile.hasPurifier }) }],
    ['household size', { profile: profile({ householdSize: base.profile.householdSize + 1 }) }],
  ])('changes with the %s', (_, change) => {
    expect(answerContextId({ ...base, ...change })).not.toBe(answerContextId(base));
  });
});
