import { render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { describe, expect, it } from 'vitest';

import { LanguageContext } from '../hooks/useCurrentLang.js';
import { lazyPart } from './lazyPart.js';

describe('lazyPart', () => {
  it('renders the loaded component', async () => {
    const Part = lazyPart(async () => ({ label }: { label: string }) => <p>loaded {label}</p>);
    render(
      <Suspense fallback={<p>waiting</p>}>
        <Part label="part" />
      </Suspense>,
    );
    expect(await screen.findByText('loaded part')).toBeInTheDocument();
  });

  it('shows a plain alert in the page language when the chunk cannot be fetched, not a blank page', async () => {
    const Part = lazyPart<{ label: string }>(() =>
      Promise.reject(new Error('Failed to fetch dynamically imported module')),
    );
    render(
      <LanguageContext value="hi">
        <main>
          <h1>Still here</h1>
          <Suspense fallback={<p>waiting</p>}>
            <Part label="part" />
          </Suspense>
        </main>
      </LanguageContext>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('यह हिस्सा लोड नहीं हो सका');
    expect(screen.getByRole('heading', { name: 'Still here' })).toBeInTheDocument();
  });
});
