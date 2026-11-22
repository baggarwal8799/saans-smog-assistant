import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { clearAirCache } from './lib/aqi';
import { LANG_KEY } from './lib/profile';
import { axeViolations, mockNetwork } from './test/network';

// As in the browser build: nothing preloaded, so Hindi arrives as its own chunk. The gate holds that chunk back
// until the test lets it through, and can make it fail as an offline fetch would.
const gate = vi.hoisted(() => ({ open: (): void => undefined, fail: false, promise: Promise.resolve() }));
vi.mock('./lib/i18n-preloaded', () => ({ preloaded: {} }));
vi.mock('./lib/i18n-hi', async (importOriginal) => {
  await gate.promise;
  if (gate.fail) throw new Error('offline');
  return importOriginal();
});

beforeEach(() => {
  clearAirCache();
  gate.fail = false;
  gate.promise = new Promise<void>((r) => (gate.open = r));
});
afterEach(() => vi.unstubAllGlobals());

// One sequence, because the module cache keeps Hindi once it has loaded: failure first, then a successful switch.
describe('App: the Hindi dictionary loads on demand', () => {
  it('stays English through a failed fetch and while loading, then switches in one step', async () => {
    const user = userEvent.setup();
    mockNetwork();
    // Saved Hindi whose chunk is not in memory (main.tsx could not fetch it): the page starts in English, and the
    // saved choice is kept for the next visit.
    localStorage.setItem(LANG_KEY, 'hi');
    const { container } = render(<App />);
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem(LANG_KEY)).toBe('hi');
    const toggle = screen.getByRole('button', { name: /Language/ });

    // Offline: the click fails quietly and leaves English in place.
    gate.fail = true;
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-busy', 'true');
    gate.open();
    await waitFor(() => expect(toggle).toHaveAttribute('aria-busy', 'false'));
    expect(document.documentElement.lang).toBe('en');

    // Online again: the next click retries.
    gate.fail = false;
    gate.promise = new Promise<void>((r) => (gate.open = r));
    await user.click(toggle);
    // Loading: the toggle says it is busy, and nothing else changes (no mixed text, no lang mismatch, no jump).
    expect(toggle).toHaveAttribute('aria-busy', 'true');
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByRole('heading', { level: 2, name: 'How’s the air where you are?' })).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
    // A second click while loading starts nothing new.
    await user.click(toggle);

    gate.open();
    await waitFor(() => expect(document.documentElement.lang).toBe('hi'));
    expect(screen.getByRole('heading', { level: 2, name: 'आपके यहाँ हवा कैसी है?' })).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-busy', 'false');
    expect(localStorage.getItem(LANG_KEY)).toBe('hi');
    // Back to English is instant: it is always in memory.
    await user.click(toggle);
    expect(document.documentElement.lang).toBe('en');
  });
});
