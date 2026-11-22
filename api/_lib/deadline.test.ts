// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAirCache } from '../../src/lib/aqi';
import { handleAssistant, resetAssistantState } from './assistant';
import { ATTEMPT_TIMEOUT_MS, MIN_REPAIR_MS, REQUEST_BUDGET_MS, attemptTimeout, startDeadline } from './deadline';
import { GeminiError, callGemini } from './gemini';
import { body, geminiResponse, modelJson, post, quietLog, textOf, withAir } from '../../src/test/apiHelpers';

/** A Gemini that never answers: each call hangs until its attempt timer aborts it. Records when each call began. */
function hanging(starts: number[]) {
  return vi.fn<typeof fetch>(
    (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        starts.push(Date.now());
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason as Error));
      }),
  );
}

beforeEach(() => {
  resetAssistantState();
  clearAirCache();
  quietLog.warn.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('request time budget', () => {
  it('fits inside the 30 s function limit with room to spare', () => {
    expect(REQUEST_BUDGET_MS).toBeLessThanOrEqual(25_000);
    expect(MIN_REPAIR_MS).toBeLessThan(ATTEMPT_TIMEOUT_MS);
  });

  it('gives each attempt the per-attempt ceiling or the time left, whichever is shorter', () => {
    let now = 0;
    const deadline = startDeadline(25_000, () => now);
    expect(attemptTimeout(deadline)).toBe(9_000);
    now = 18_000;
    expect(attemptTimeout(deadline)).toBe(7_000);
    now = 30_000;
    expect(deadline.remaining()).toBe(0);
  });

  it('ends the whole model chain at the deadline: 9 s + 9 s + the 7 s left, not 27 s', async () => {
    vi.useFakeTimers();
    const t0 = Date.now();
    const starts: number[] = [];
    const settled = callGemini('P', { GEMINI_API_KEY: 'k' }, hanging(starts), {
      log: quietLog,
      deadline: startDeadline(),
    }).catch((e: unknown) => ({ e, at: Date.now() }));
    await vi.advanceTimersByTimeAsync(40_000);
    const { e, at } = (await settled) as { e: Error; at: number };
    expect(starts.map((s) => s - t0)).toEqual([0, 9_000, 18_000]);
    expect(at - t0).toBe(REQUEST_BUDGET_MS);
    expect(e.name).toBe('TimeoutError');
  });

  it('starts no attempt once the budget is spent', async () => {
    const f = vi.fn<typeof fetch>();
    await expect(
      callGemini('P', { GEMINI_API_KEY: 'k' }, f, { log: quietLog, deadline: startDeadline(500) }),
    ).rejects.toBeInstanceOf(GeminiError);
    expect(f).not.toHaveBeenCalled();
  });

  it('skips the repair call when less than 8 s of the budget is left', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    let calls = 0;
    // The first answer breaks a rule (invented 999) and arrives after 18 s, leaving 7 s: too little for a repair.
    const slow = vi.fn<typeof fetch>(async () => {
      calls += 1;
      vi.setSystemTime(Date.now() + 18_000);
      return geminiResponse(modelJson({ reply: 'no', lines: ['Keep them in.', 'The AQI is 999.'] }));
    });
    const req = post(body({ mode: 'question', question: 'Can my kids play in the park this evening?' }));
    const res = await handleAssistant(req, { GEMINI_API_KEY: 'k' }, withAir(slow), quietLog);
    expect(res.status).toBe(200);
    expect(await textOf(res)).toBe('No. Keep them in.'); // the unrepaired line with 999 is dropped
    expect(calls).toBe(1);
    expect(quietLog.warn).toHaveBeenCalledWith(expect.stringMatching(/no repair call/));
  });
});
