import { afterEach, describe, expect, it } from 'vitest';
import { QUOTA_COOLDOWN_MS, noteFailure, resetCooldowns, usableModels } from './cooldown';

const CHAIN = ['lite', 'lite-2', 'flash'];

describe('quota cooldown', () => {
  afterEach(resetCooldowns);

  it('skips a model whose daily quota is spent until the cooldown ends', () => {
    noteFailure('lite', 429, 'You exceeded your current quota, please check your plan', 1_000);
    expect(usableModels(CHAIN, 2_000)).toEqual(['lite-2', 'flash']);
    expect(usableModels(CHAIN, 1_000 + QUOTA_COOLDOWN_MS)).toEqual(CHAIN);
  });

  it('does not cool down on a brief overload or a burst limit without "quota"', () => {
    noteFailure('lite', 503, 'This model is currently experiencing high demand', 1_000);
    noteFailure('lite-2', 429, 'Resource has been exhausted (e.g. check rate)', 1_000);
    expect(usableModels(CHAIN, 2_000)).toEqual(CHAIN);
  });

  it('tries every model again when all of them are cooling down', () => {
    for (const m of CHAIN) noteFailure(m, 429, 'quota exceeded', 1_000);
    expect(usableModels(CHAIN, 2_000)).toEqual(CHAIN);
  });
});
