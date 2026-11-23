import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { loadDictionary } from '../../core/i18n.js';
import { LANG_KEY } from '../lib/storage.js';
import { ErrorBoundary } from './ErrorBoundary.js';

// As in the browser build: Hindi is a chunk that is in memory only once something has loaded it.
vi.mock('../../core/i18n-preloaded.js', () => ({ preloaded: {} }));

function Broken(): never {
  throw new Error('render failed');
}

// React and the boundary both report the error; keep the test output clean, but check the boundary's report.
let consoleError: MockInstance<typeof console.error>;
beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  consoleError.mockRestore();
  localStorage.clear();
});

describe('ErrorBoundary', () => {
  it('renders its children while nothing fails', () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('All good')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('replaces a throwing child with a plain message and a working reload button', async () => {
    // Saved Hindi whose dictionary is not in memory falls back to English, as the app itself does.
    localStorage.setItem(LANG_KEY, 'hi');
    const onReload = vi.fn();
    render(
      <ErrorBoundary onReload={onReload}>
        <Broken />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'en');
    expect(screen.getByRole('heading', { level: 1, name: 'Saans' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong on this page.');
    expect(consoleError).toHaveBeenCalledWith('Saans could not render', expect.any(Error), expect.any(String));
    await userEvent.click(screen.getByRole('button', { name: 'Reload the page' }));
    expect(onReload).toHaveBeenCalledOnce();
  });

  it('speaks the saved language when its dictionary is loaded', async () => {
    localStorage.setItem(LANG_KEY, 'hi');
    await loadDictionary('hi');
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'hi');
    expect(screen.getByRole('button', { name: 'पेज दोबारा लोड करें' })).toBeInTheDocument();
  });

  it('reloads the page by default', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(reload).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
