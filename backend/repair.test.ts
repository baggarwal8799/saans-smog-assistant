// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { ask, promptFor } from '../test/apiHelpers.js';
import type { ModelAnswer } from './answer.js';
import { guardedAnswer } from './repair.js';

const req = ask('Can my kids play in the park this evening?');
const input = { prompt: promptFor(req), req };
const answer = (...lines: string[]): ModelAnswer => ({ offTopic: false, reply: 'none', lines });
const invented = answer('Keep them in.', 'The AQI is 999.');

describe('guardedAnswer', () => {
  it('repairs once by default when the caller gives no say on retrying', async () => {
    const asked = vi.fn<(p: string) => Promise<ModelAnswer>>();
    asked.mockResolvedValueOnce(invented).mockResolvedValueOnce(answer('Keep them in today.'));
    expect(await guardedAnswer(input, asked, { warn: vi.fn() })).toEqual(answer('Keep them in today.'));
    expect(asked).toHaveBeenCalledTimes(2);
    expect(asked.mock.calls[1]?.[0]).toMatch(/<FIX>[\s\S]*999/);
  });

  it('keeps the first answer, minus its failing line, when the repair call rejects with a non-Error', async () => {
    const log = { warn: vi.fn() };
    const asked = vi.fn<(p: string) => Promise<ModelAnswer>>();
    asked.mockResolvedValueOnce(invented).mockRejectedValueOnce('socket hang up');
    expect(await guardedAnswer(input, asked, log)).toEqual(answer('Keep them in.'));
    expect(log.warn).toHaveBeenCalledWith('assistant: repair call failed, keeping the first answer', 'unknown');
  });
});
