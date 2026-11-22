// @vitest-environment node
/**
 * Contract tests against real Gemini response bodies (api/_lib/fixtures): two replies recorded from
 * gemini-3.1-flash-lite with the exact request gemini.ts builds (structured output), IDs and thought signatures
 * scrubbed, plus Google's documented 429 RESOURCE_EXHAUSTED error body. The hand-written mocks elsewhere test the
 * logic; these prove the parser and renderer accept what the API really sends.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildContext } from '../../src/lib/context';
import { buildPlan } from '../../src/lib/recommend';
import { report } from '../../src/test/fixtures';
import { REFUSAL_TEXT, renderAnswer } from './answer';
import { GeminiError, callGemini } from './gemini';
import { safetyLines } from './medical';
import { ask, quietLog } from '../../src/test/apiHelpers';

const fixture = (name: string): string => readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8');
const ON_TOPIC = fixture('gemini-on-topic');
const OFF_TOPIC = fixture('gemini-off-topic');
const QUOTA_429 = fixture('gemini-429');

/** Each call gets the next recorded body, as a fresh Response. */
const recorded = (...bodies: [string, number][]) => {
  let i = 0;
  return vi.fn<typeof fetch>(async () => {
    const [text, status] = bodies[Math.min(i++, bodies.length - 1)] ?? ['', 500];
    return new Response(text, { status, headers: { 'content-type': 'application/json' } });
  });
};
const env = { GEMINI_API_KEY: 'k' };
const opts = { log: quietLog };

/** The requests the two bodies answered, and the server's own EPA verdict for the first. */
const onTopicReq = ask('Is it safe to take my kids to the park this evening?');
const offTopicReq = ask('Write me a short poem about cricket.');
const epaReply = (() => {
  const plan = buildPlan(report(), onTopicReq.profile, 'en');
  return buildContext({ report: report(), profile: onTopicReq.profile, plan, lang: 'en', said: [onTopicReq.question] })
    .epaReply;
})();

beforeEach(() => {
  quietLog.warn.mockClear();
});

describe('recorded Gemini replies', () => {
  it('parses the on-topic reply into the typed answer, skipping the thought signature', async () => {
    const answer = await callGemini('PROMPT', env, recorded([ON_TOPIC, 200]), opts);
    expect(answer.offTopic).toBe(false);
    expect(answer.reply).toBe('no');
    expect(answer.lines).toHaveLength(6);
    expect(answer.lines[0]).toBe('No, keep the children indoors all day today.');
    expect(answer.lines.every((l) => l.length > 0 && !l.includes('\n'))).toBe(true);
  });

  it('renders it: the server reply word once, then one bullet per step, then the fixed safety lines', async () => {
    const answer = await callGemini('PROMPT', env, recorded([ON_TOPIC, 200]), opts);
    const lines = renderAnswer(answer, onTopicReq, epaReply).split('\n');
    expect(lines[0]).toBe(`${epaReply === 'yes' ? 'Yes.' : 'No.'} Keep the children indoors all day today.`);
    expect(lines.slice(1, 6)).toEqual(answer.lines.slice(1).map((l) => `• ${l}`));
    expect(lines.slice(6)).toEqual(safetyLines(onTopicReq));
  });

  it('turns the off-topic reply into the fixed refusal, dropping everything the model wrote', async () => {
    const answer = await callGemini('PROMPT', env, recorded([OFF_TOPIC, 200]), opts);
    expect(answer.offTopic).toBe(true);
    expect(answer.reply).toBe('none');
    expect(renderAnswer(answer, offTopicReq)).toBe(REFUSAL_TEXT.en);
    expect(renderAnswer(answer, ask('क्रिकेट पर एक कविता लिखो', { lang: 'hi' }))).toBe(REFUSAL_TEXT.hi);
  });
});

describe('the documented 429 RESOURCE_EXHAUSTED body', () => {
  it("fails over to the next model, logging Google's message on the server only", async () => {
    const f = recorded([QUOTA_429, 429], [ON_TOPIC, 200]);
    const answer = await callGemini('PROMPT', env, f, opts);
    expect(answer.reply).toBe('no');
    expect(f.mock.calls.map((c) => String(c[0]).split('/models/')[1])).toEqual([
      'gemini-flash-lite-latest:generateContent',
      'gemini-3.1-flash-lite:generateContent',
    ]);
    const warning = String(quietLog.warn.mock.calls[0]?.[0]);
    expect(warning).toMatch(/Gemini HTTP 429: You exceeded your current quota/);
    expect(warning).toMatch(/trying next model$/);
  });

  it('ends as a 429 GeminiError when every model answers with it', async () => {
    const err = await callGemini('PROMPT', env, recorded([QUOTA_429, 429]), { ...opts, charge: () => true }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(GeminiError);
    expect((err as GeminiError).status).toBe(429);
    expect((err as GeminiError).detail.length).toBeLessThanOrEqual(160);
  });
});
