import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '../lib/assistantClient';
import { DELHI, profile } from '../test/fixtures';
import { AUTO_SUMMARY_DELAY_MS, Assistant, autoSummaryAllowed } from './Assistant';

vi.mock('../lib/assistantClient', async (importOriginal) => ({
  ...(await importOriginal<typeof client>()),
  askAssistant: vi.fn(async ({ mode }: { mode: string }) => ({ text: `Answer for ${mode}` })),
}));

const ask = vi.mocked(client.askAssistant);

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}
function setSaveData(saveData: boolean | undefined) {
  Object.defineProperty(navigator, 'connection', { configurable: true, value: saveData === undefined ? undefined : { saveData } });
}

/** Renders with the automatic summary on, then lets its delay pass. */
async function mountAndWait() {
  const onAutoSummary = vi.fn();
  render(<Assistant lang="en" place={DELHI} profile={profile()} autoSummary onAutoSummary={onAutoSummary} />);
  await act(() => vi.advanceTimersByTimeAsync(AUTO_SUMMARY_DELAY_MS + 50));
  return onAutoSummary;
}

beforeEach(() => {
  ask.mockClear();
  setVisibility('visible');
  setSaveData(undefined);
});
afterEach(() => {
  vi.useRealTimers();
  setVisibility('visible');
  setSaveData(undefined);
});

describe('the automatic summary', () => {
  it('is allowed only in a visible tab without Save-Data', () => {
    expect(autoSummaryAllowed()).toBe(true);
    setSaveData(false);
    expect(autoSummaryAllowed()).toBe(true);
    setSaveData(true);
    expect(autoSummaryAllowed()).toBe(false);
    setSaveData(undefined);
    setVisibility('hidden');
    expect(autoSummaryAllowed()).toBe(false);
  });

  it('is requested after the delay in a visible tab', async () => {
    vi.useFakeTimers();
    const used = await mountAndWait();
    expect(used).toHaveBeenCalledOnce();
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ mode: 'summary', history: [] }));
  });

  it.each([
    ['the tab is hidden', () => setVisibility('hidden')],
    ['the browser asks to save data', () => setSaveData(true)],
  ])('is never sent when %s; the Explain button still works and the chance is used up', async (_label, arrange) => {
    arrange();
    vi.useFakeTimers();
    const used = await mountAndWait();
    expect(ask).not.toHaveBeenCalled();
    // Used up, so a later household edit at the same place does not fire it either.
    expect(used).toHaveBeenCalledOnce();
    vi.useRealTimers();
    const button = screen.getByRole('button', { name: 'Explain my plan' });
    await userEvent.setup().click(button);
    expect(await screen.findByText('Answer for summary')).toBeInTheDocument();
    expect(ask).toHaveBeenCalledOnce();
  });
});

describe('conversation history', () => {
  it('holds only typed questions, never the "Explain my plan" request', async () => {
    const user = userEvent.setup();
    render(<Assistant lang="en" place={DELHI} profile={profile()} />);
    await user.click(screen.getByRole('button', { name: 'Explain my plan' }));
    await screen.findByText('Answer for summary');
    await user.type(screen.getByLabelText('Your question'), 'Can my kids play outside?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    await screen.findByText('Answer for question');
    await user.click(screen.getByRole('button', { name: 'Explain my plan' }));
    await screen.findByText('Answer for summary');
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    await screen.findByText('Answer for question');
    // The summary in between added nothing: the second question carries only the first.
    const q = 'Can my kids play outside?';
    expect(ask.mock.calls.map(([a]) => [a.mode, a.history])).toEqual([
      ['summary', []],
      ['question', []],
      ['summary', [q]],
      ['question', [q]],
    ]);
  });
});
