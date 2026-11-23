// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';

import { body, gemini, post, quietLog, replies, sentPrompt, textOf as text, withAir } from '../test/apiHelpers.js';
import { createAssistantHandler } from './handler.js';
import { safetyLines } from './medical.js';
import { clearAirCache } from './serverAir.js';
import { parseAssistantRequest } from './validate.js';

/** A fresh handler per test: its own answer cache and rate-limit counters. */
let handleAssistant = createAssistantHandler();

const env = { GEMINI_API_KEY: 'k' };
const block = (prompt: string, tag: string): string =>
  new RegExp(`<${tag}>\\n([\\s\\S]*?)\\n</${tag}>`).exec(prompt)?.[1] ?? '';

beforeEach(() => {
  handleAssistant = createAssistantHandler();
  clearAirCache();
  quietLog.warn.mockClear();
});

describe('handleAssistant: facts computed by the server', () => {
  const factLinePerTime =
    'puts a fact line for each time the question asks about into CONTEXT, ' + 'falling back to earlier questions';
  it(factLinePerTime, async () => {
    // Fixture: local time 06:00, smog trap 18:00–07:00.
    const facts = async (question: string, history: string[]): Promise<string[]> => {
      const f = gemini('No. Stay in.');
      await handleAssistant(post(body({ mode: 'question', question, history })), env, withAir(f), quietLog);
      return block(sentPrompt(f), 'CONTEXT')
        .split('\n')
        .filter((l) => l.startsWith('Asked time'));
    };
    const own = await facts('And at शाम 6 बजे?', ['Is 7:30 ok for the school bus?']);
    expect(own).toHaveLength(1);
    expect(own[0]).toMatch(
      new RegExp(
        String.raw`^Asked time 18:00 today: US AQI ≈ \d+, PM2\.5 ≈ \d+ µg\/m³, ` +
          String.raw`INSIDE the smog trap \(18:00 today to 07:00 tomorrow\)`,
      ),
    );
    const earlier = await facts('And for my father?', ['Is 7:30 ok for the school bus?']);
    expect(earlier[0]).toMatch(/^Asked time 07:30 today: .*outside the smog trap/);
  });

  it('appends the fixed medical line to a follow-up about a father with asthma (seen missing live)', async () => {
    const f = gemini('Keep him indoors until the cleanest window.');
    const req = body({
      mode: 'question',
      question: 'What should he do?',
      history: ['My 70-year-old father has asthma.'],
    });
    const res = await handleAssistant(post(req), env, withAir(f), quietLog);
    const out = await text(res);
    expect(out).toBe(
      ['Keep him indoors until the cleanest window.', ...safetyLines(parseAssistantRequest(req))].join('\n'),
    );
    expect(out).toMatch(/reliever inhaler[\s\S]*get medical help at once/);
  });

  it('adds no medical line when nothing calls for one', async () => {
    const res = await handleAssistant(post(body()), env, withAir(gemini('Here is your plan.')), quietLog);
    expect(await text(res)).toBe('Here is your plan.');
  });
});

describe('handleAssistant: per-client daily cap', () => {
  const capped = { ...env, MAX_AI_REQUESTS_PER_CLIENT_PER_DAY: '2' };
  const ask = (q: string, ip: string) => post(body({ mode: 'question', question: q }), { 'x-forwarded-for': ip });

  it('stops one client at its cap with "daily_limit" while other clients still get answers', async () => {
    const net = withAir(gemini('Keep the windows shut.'));
    expect((await handleAssistant(ask('What now?', '1.1.1.1'), capped, net, quietLog)).status).toBe(200);
    expect((await handleAssistant(ask('What later?', '1.1.1.1'), capped, net, quietLog)).status).toBe(200);
    const third = await handleAssistant(ask('What tonight?', '1.1.1.1'), capped, net, quietLog);
    expect(third.status).toBe(429);
    expect(third.headers.get('retry-after')).toBe('3600');
    expect(await third.json()).toEqual({ error: 'daily_limit' });
    expect((await handleAssistant(ask('What tonight?', '2.2.2.2'), capped, net, quietLog)).status).toBe(200);
  });

  it('counts a request with a repair retry once, and serves cache hits without counting', async () => {
    const f = replies('The AQI is 999.', 'Keep the windows shut.');
    const net = withAir(f);
    expect(await text(await handleAssistant(ask('What now?', '3.3.3.3'), capped, net, quietLog))).toBe(
      'Keep the windows shut.',
    );
    expect(f).toHaveBeenCalledTimes(2); // answer + repair
    expect((await handleAssistant(ask('What now?', '3.3.3.3'), capped, net, quietLog)).status).toBe(200); // cache hit
    const secondRequest = await handleAssistant(ask('What later?', '3.3.3.3'), capped, net, quietLog);
    expect(secondRequest.status).toBe(200); // 2nd request
    expect((await handleAssistant(ask('What tonight?', '3.3.3.3'), capped, net, quietLog)).status).toBe(429);
  });
});
