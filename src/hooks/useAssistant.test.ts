import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '../lib/assistantClient';
import type { AssistantResponse } from '../lib/contract';
import { DELHI, profile } from '../test/fixtures';
import { useAssistant } from './useAssistant';

vi.mock('../lib/assistantClient', async (importOriginal) => ({
  ...(await importOriginal<typeof client>()),
  askAssistant: vi.fn(),
}));

const ask = vi.mocked(client.askAssistant);
const mount = () => renderHook(() => useAssistant({ lang: 'en', place: DELHI, profile: profile() }));

/** A reply that arrives only when the test says so. */
function deferred() {
  let resolve!: (r: AssistantResponse) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<AssistantResponse>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => ask.mockReset());

describe('useAssistant: only the latest request counts', () => {
  it('ignores a slow earlier reply that lands after a newer one', async () => {
    const slow = deferred();
    ask.mockReturnValueOnce(slow.promise).mockResolvedValueOnce({ text: 'New answer' });
    const { result } = mount();
    act(() => void result.current.run('summary'));
    await act(() => result.current.run('question'));
    expect(result.current.answer).toEqual({ text: 'New answer', mode: 'question', auto: false });
    await act(async () => slow.resolve({ text: 'Old answer' }));
    expect(result.current.answer?.text).toBe('New answer');
    expect(result.current.pending).toBeNull();
  });

  it('ignores a slow earlier failure, so no stale error appears over the newer answer', async () => {
    const slow = deferred();
    ask.mockReturnValueOnce(slow.promise).mockResolvedValueOnce({ text: 'New answer' });
    const { result } = mount();
    act(() => void result.current.run('summary'));
    await act(() => result.current.run('summary'));
    await act(async () => slow.reject(new client.AssistantError('daily_limit')));
    expect(result.current.error).toBe('');
    expect(result.current.answer?.text).toBe('New answer');
  });

  it('shows the generic error when the request fails without a code (a network failure)', async () => {
    ask.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { result } = mount();
    await act(() => result.current.run('summary'));
    await waitFor(() => expect(result.current.error).toBe('The assistant could not answer. Please try again.'));
    expect(result.current.busy).toBe(false);
  });
});
