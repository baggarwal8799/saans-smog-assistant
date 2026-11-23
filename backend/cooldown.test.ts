// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { body, geminiResponse, modelJson, post, quietLog, withAir } from '../test/apiHelpers.js';
import { urlOf } from '../test/fakeRedis.js';
import { createCooldown, QUOTA_COOLDOWN_MS } from './cooldown.js';
import { createAssistantHandler } from './handler.js';

const CHAIN = ['lite', 'lite-2', 'flash'];
const QUOTA_BODY = JSON.stringify({ error: { message: 'You exceeded your current quota' } });

describe('quota cooldown', () => {
  it('skips a model whose daily quota is spent until the cooldown ends', () => {
    const cooldown = createCooldown();
    cooldown.note('lite', 429, 'You exceeded your current quota, please check your plan', 1_000);
    expect(cooldown.usable(CHAIN, 2_000)).toEqual(['lite-2', 'flash']);
    expect(cooldown.usable(CHAIN, 1_000 + QUOTA_COOLDOWN_MS)).toEqual(CHAIN);
  });

  it('does not cool down on a brief overload or a burst limit without "quota"', () => {
    const cooldown = createCooldown();
    cooldown.note('lite', 503, 'This model is currently experiencing high demand', 1_000);
    cooldown.note('lite-2', 429, 'Resource has been exhausted (e.g. check rate)', 1_000);
    expect(cooldown.usable(CHAIN, 2_000)).toEqual(CHAIN);
  });

  it('tries every model again when all of them are cooling down', () => {
    const cooldown = createCooldown();
    for (const m of CHAIN) cooldown.note(m, 429, 'quota exceeded', 1_000);
    expect(cooldown.usable(CHAIN, 2_000)).toEqual(CHAIN);
  });

  it('keeps each instance separate', () => {
    const [a, b] = [createCooldown(), createCooldown()];
    a.note('lite', 429, 'quota exceeded', 1_000);
    expect(a.usable(CHAIN, 2_000)).toEqual(['lite-2', 'flash']);
    expect(b.usable(CHAIN, 2_000)).toEqual(CHAIN);
  });

  it('is kept by the handler between requests, so a spent model is skipped on the next one', async () => {
    const models: string[] = [];
    const net = vi.fn<typeof fetch>(async (input) => {
      const model = urlOf(input).split('/models/')[1]?.split(':')[0] ?? '';
      models.push(model);
      if (model === 'gemini-flash-lite-latest') return new Response(QUOTA_BODY, { status: 429 });
      return geminiResponse(modelJson('ok'));
    });
    const handle = createAssistantHandler();
    const ask = (question: string) => post(body({ mode: 'question', question }));
    expect((await handle(ask('What now?'), { GEMINI_API_KEY: 'k' }, withAir(net), quietLog)).status).toBe(200);
    expect((await handle(ask('What later?'), { GEMINI_API_KEY: 'k' }, withAir(net), quietLog)).status).toBe(200);
    expect(models).toEqual(['gemini-flash-lite-latest', 'gemini-3.1-flash-lite', 'gemini-3.1-flash-lite']);
  });
});
