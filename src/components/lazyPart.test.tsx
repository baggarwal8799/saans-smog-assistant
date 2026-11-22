import { render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { describe, expect, it } from 'vitest';
import type { Lang } from '../lib/types';
import { lazyPart } from './lazyPart';

describe('lazyPart', () => {
  it('renders the loaded component', async () => {
    const Part = lazyPart(async () => ({ lang }: { lang: Lang }) => <p>loaded {lang}</p>);
    render(<Suspense fallback={<p>waiting</p>}><Part lang="en" /></Suspense>);
    expect(await screen.findByText('loaded en')).toBeInTheDocument();
  });

  it('shows a plain alert in the page language when the chunk cannot be fetched, instead of blanking the page', async () => {
    const Part = lazyPart<{ lang: Lang }>(() => Promise.reject(new Error('Failed to fetch dynamically imported module')));
    render(
      <main>
        <h1>Still here</h1>
        <Suspense fallback={<p>waiting</p>}><Part lang="hi" /></Suspense>
      </main>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('यह हिस्सा लोड नहीं हो सका');
    expect(screen.getByRole('heading', { name: 'Still here' })).toBeInTheDocument();
  });
});
