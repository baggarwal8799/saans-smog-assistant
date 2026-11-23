import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AssistantResponse } from '../../core/contract.js';
import { deferred } from '../../test/deferred.js';
import { DELHI, profile } from '../../test/fixtures.js';
import * as client from '../lib/assistantClient.js';
import { useAssistant } from './useAssistant.js';

vi.mock('../lib/assistantClient.js', async (importOriginal) => ({
  ...(await importOriginal<typeof client>()),
  askAssistant: vi.fn(),
}));

const ask = vi.mocked(client.askAssistant);
const mount = () => renderHook(() => useAssistant({ lang: 'en', place: DELHI, profile: profile() }));

async function overtakenRun(first: 'summary' | 'question', second: 'summary' | 'question') {
  const slow = deferred<AssistantResponse>();
  ask.mockReturnValueOnce(slow.promise).mockResolvedValueOnce({ text: 'New answer' });
  const { result } = mount();
  act(() => void result.current.run(first));
  await act(() => result.current.run(second));
  return { slow, result };
}

beforeEach(() => ask.mockReset());

describe('useAssistant: only the latest request counts', () => {
  it('ignores a slow earlier reply that lands after a newer one', async () => {
    const { slow, result } = await overtakenRun('summary', 'question');
    expect(result.current.reply.answer).toEqual({ text: 'New answer', mode: 'question', auto: false });
    await act(async () => slow.resolve({ text: 'Old answer' }));
    expect(result.current.reply.answer?.text).toBe('New answer');
    expect(result.current.request.pending).toBeNull();
  });

  it('ignores a slow earlier failure, so no stale error appears over the newer answer', async () => {
    const { slow, result } = await overtakenRun('summary', 'summary');
    await act(async () => slow.reject(new client.AssistantError('daily_limit')));
    expect(result.current.request.error).toBe('');
    expect(result.current.reply.answer?.text).toBe('New answer');
  });

  it('shows the generic error when the request fails without a code (a network failure)', async () => {
    ask.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { result } = mount();
    await act(() => result.current.run('summary'));
    await waitFor(() => expect(result.current.request.error).toBe('The assistant could not answer. Please try again.'));
    expect(result.current.request.busy).toBe(false);
  });
});

describe('useAssistant: history', () => {
  it('saves the question that was asked, not text typed into the box while the reply was on its way', async () => {
    const slow = deferred<AssistantResponse>();
    ask.mockReturnValueOnce(slow.promise).mockResolvedValueOnce({ text: 'Second answer' });
    const { result } = mount();
    act(() => result.current.input.setQuestion('Is the park safe today?'));
    act(() => void result.current.run('question'));
    act(() => result.current.input.setQuestion('And for my father?'));
    await act(async () => slow.resolve({ text: 'First answer' }));
    await act(() => result.current.run('question'));
    expect(ask.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ question: 'And for my father?', history: ['Is the park safe today?'] }),
    );
  });
});
