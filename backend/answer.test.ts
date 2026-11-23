// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { ask, summary } from '../test/apiHelpers.js';
import { profile } from '../test/fixtures.js';
import {
  ANSWER_SCHEMA,
  MAX_LINES,
  type ModelAnswer,
  parseAnswer,
  REFUSAL_TEXT,
  renderAnswer,
  withoutReplyWord,
} from './answer.js';
import { MEDICAL_LINE } from './medical.js';

const said = (o: Partial<ModelAnswer>): ModelAnswer => ({
  offTopic: false,
  reply: 'none',
  lines: ['Keep the windows shut.'],
  ...o,
});

describe('answer schema', () => {
  it('asks for exactly the three typed fields, with the reply as an enum and 1–6 lines', () => {
    expect(ANSWER_SCHEMA.required).toEqual(['offTopic', 'reply', 'lines']);
    expect(ANSWER_SCHEMA.properties.reply.enum).toEqual(['yes', 'no', 'only_if', 'none']);
    expect(ANSWER_SCHEMA.properties.lines).toMatchObject({ type: 'ARRAY', minItems: 1, maxItems: MAX_LINES });
  });
});

describe('parseAnswer', () => {
  it('reads a reply that fits the schema', () => {
    expect(parseAnswer('{"offTopic":false,"reply":"no","lines":["Keep them in."]}')).toEqual({
      offTopic: false,
      reply: 'no',
      lines: ['Keep them in.'],
    });
  });

  it('rejects broken JSON (a reply cut off by the token limit) and anything off the schema', () => {
    for (const bad of [
      '{"offTopic":false,"reply":"no","lines":["Keep th',
      'null',
      '"just text"',
      '{"offTopic":"no","reply":"no","lines":["x"]}',
      '{"offTopic":false,"reply":"maybe","lines":["x"]}',
      '{"offTopic":false,"reply":"no","lines":"x"}',
      '{"offTopic":false,"reply":"no","lines":["", "  ", 7]}',
    ]) {
      expect(parseAnswer(bad), bad).toBeNull();
    }
  });

  it("owns the bullets: drops a line's own bullet and line breaks, empty lines, and lines past the limit", () => {
    const json = JSON.stringify({
      offTopic: false,
      reply: 'none',
      lines: ['• Shut the windows.', '- Run the purifier\non high.', '', 'A', 'B', 'C', 'D', 'E', 'F'],
    });
    expect(parseAnswer(json)?.lines).toEqual(['Shut the windows.', 'Run the purifier on high.', 'A', 'B', 'C', 'D']);
    const long = parseAnswer(JSON.stringify({ offTopic: false, reply: 'none', lines: ['x'.repeat(900)] }));
    expect(long?.lines[0]).toHaveLength(400);
  });
});

describe('renderAnswer', () => {
  const kids = ask('Can my kids play in the park this evening?');

  it('opens the first line with the reply word, and turns later lines into bullets', () => {
    const answer = said({ reply: 'no', lines: ['Keep them indoors this evening.', 'Run the purifier.'] });
    expect(renderAnswer(answer, kids)).toBe('No. Keep them indoors this evening.\n• Run the purifier.');
    expect(renderAnswer(said({ reply: 'only_if', lines: ['they stay in until 14:00.'] }), kids)).toBe(
      'Only if they stay in until 14:00.',
    );
    expect(renderAnswer(said({ reply: 'yes' }), ask('क्या बच्चे बाहर खेल सकते हैं?', { lang: 'hi' }))).toBe(
      'हाँ। Keep the windows shut.',
    );
  });

  it("takes the word from the server's EPA verdict, never the model, whenever there is one", () => {
    expect(renderAnswer(said({ reply: 'yes' }), kids, 'no')).toBe('No. Keep the windows shut.');
    // An "only if" condition never runs on from a different word ("No. they wear N95s." read as nonsense).
    expect(
      renderAnswer(said({ reply: 'only_if', lines: ['they wear N95s.', 'Play indoors instead.'] }), kids, 'no'),
    ).toBe('No. Play indoors instead.');
    // A lone "only if" condition under a different word leaves the word on its own.
    expect(renderAnswer(said({ reply: 'only_if', lines: ['they wear N95s.'] }), kids, 'no')).toBe('No.');
    // "none" is the model saying this is not a yes/no question ("When can they play?"): no word is added.
    expect(renderAnswer(said({ reply: 'none' }), kids, 'no')).toBe('Keep the windows shut.');
  });

  it('shows the fixed refusal alone for an off-topic question, with no health lines even after asthma', () => {
    const poem = ask('Write me a poem.', { history: ['My father has asthma.'] });
    expect(renderAnswer(said({ offTopic: true, lines: ['Sorry.'] }), poem)).toBe(REFUSAL_TEXT.en);
    expect(renderAnswer(said({ offTopic: true }), { ...poem, lang: 'hi' })).toBe(REFUSAL_TEXT.hi);
  });

  it('never refuses a summary or gives it a reply word', () => {
    expect(renderAnswer(said({ offTopic: true, reply: 'yes' }), summary())).toBe('Keep the windows shut.');
  });

  it('ends with the fixed safety lines the request needs', () => {
    const asthma = summary({ profile: profile({ hasRespiratory: true }) });
    expect(renderAnswer(said({}), asthma)).toBe(`Keep the windows shut.\n${MEDICAL_LINE.en}`);
  });
});

describe('withoutReplyWord', () => {
  it.each([
    ['No, your children should stay in.', 'no', 'en', 'Your children should stay in.'],
    ['No. Keep them in.', 'no', 'en', 'Keep them in.'],
    ['Yes: 14:00 is fine.', 'yes', 'en', '14:00 is fine.'],
    ['Only if they wear N95s.', 'only_if', 'en', 'they wear N95s.'],
    ['नहीं, बच्चों को घर में रखें।', 'no', 'hi', 'बच्चों को घर में रखें।'],
    ['सिर्फ़ अगर वे N95 पहनें।', 'only_if', 'hi', 'वे N95 पहनें।'],
  ] as const)("drops the model's copy of the word the server writes: %s", (lead, reply, lang, want) => {
    expect(withoutReplyWord(lead, reply, lang)).toBe(want);
  });

  it.each([
    ['No outdoor play today.', 'no'],
    ['Not today.', 'no'],
    ['Keep them in.', 'no'],
    ['Yesterday was cleaner.', 'yes'],
  ] as const)('keeps a line that only starts with the same letters: %s', (lead, reply) => {
    expect(withoutReplyWord(lead, reply, 'en')).toBe(lead);
  });
});

describe('no reply word for a question-word question', () => {
  it('drops a model "no" for "What should he do?" and keeps it for "Can he walk?"', () => {
    const ans = { offTopic: false, reply: 'no' as const, lines: ['Keep him indoors this evening.'] };
    expect(renderAnswer(ans, ask('What should he do this evening?'))).toMatch(/^Keep him indoors/);
    expect(renderAnswer(ans, ask('Can he walk this evening?'))).toMatch(/^No\b/);
  });
});

describe('a breathing emergency', () => {
  it('opens with the get-help line and gives no yes/no word', () => {
    const q = ask('My son is wheezing badly and struggling to breathe, should I just run the air purifier?');
    const out = renderAnswer({ offTopic: false, reply: 'yes', lines: ['Run the purifier on high.'] }, q, 'no');
    expect(out.startsWith(MEDICAL_LINE.en)).toBe(true);
    expect(out).not.toMatch(/(?:^(Yes|No)\b)|(?:\n(Yes|No)\.)/);
  });
});
