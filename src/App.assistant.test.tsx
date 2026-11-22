import { configure, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { AUTO_SUMMARY_DELAY_MS } from './hooks/useAssistant';
import { clearAirCache } from './lib/aqi';
import { PLACE_KEY } from './lib/profile';
import { DELHI, jsonResponse, openMeteoPayload } from './test/fixtures';
import { mockNetwork } from './test/network';

// The automatic summary waits for the plan to settle (AUTO_SUMMARY_DELAY_MS), so give async queries room for it.
configure({ asyncUtilTimeout: 4000 });

beforeEach(() => clearAirCache());
afterEach(() => vi.unstubAllGlobals());

describe('App: Ask Saans', () => {
  it('explains the first plan at a place on its own, once; later changes wait for a click', async () => {
    const user = userEvent.setup();
    localStorage.setItem(PLACE_KEY, JSON.stringify(DELHI));
    const { calls } = mockNetwork();
    const assistantCalls = () => calls.filter((c) => c === '/api/assistant').length;
    render(<App />);
    await screen.findByRole('heading', { name: /Air right now/ });

    // Gemini's summary arrives without a click, exactly once.
    expect(await screen.findByText('Answer for summary')).toBeInTheDocument();
    expect(assistantCalls()).toBe(1);

    // The button still re-asks.
    await user.click(screen.getByRole('button', { name: /Explain my plan/ }));
    await waitFor(() => expect(assistantCalls()).toBe(2));

    // Typing never triggers a request. A household change clears the old answer but does not spend quota on its
    // own: only the first plan at a place is explained without a click.
    await user.type(screen.getByLabelText('Your question'), 'draft');
    expect(assistantCalls()).toBe(2);
    await user.click(screen.getByRole('button', { name: 'Edit household' }));
    await user.click(await screen.findByLabelText('We have an air purifier'));
    await new Promise((r) => setTimeout(r, AUTO_SUMMARY_DELAY_MS + 300));
    expect(assistantCalls()).toBe(2);
    expect(screen.queryByText('Answer for summary')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Explain my plan/ }));
    expect(await screen.findByText('Answer for summary')).toBeInTheDocument();
    expect(assistantCalls()).toBe(3);

    const ask = screen.getByRole('button', { name: 'Ask' });
    expect(ask).toBeDisabled();
    await user.type(screen.getByLabelText('Your question'), 'Can my kids play outside?');
    await user.click(ask);
    expect(await screen.findByText('Answer for question')).toBeInTheDocument();
    expect(screen.getByText('Answer', { selector: 'figcaption' })).toBeInTheDocument();
    expect(assistantCalls()).toBe(4);

    // A follow-up carries the earlier questions, so "and for my father?" has its context.
    await user.clear(screen.getByLabelText('Your question'));
    await user.type(screen.getByLabelText('Your question'), 'And for my father?');
    await user.click(ask);
    await waitFor(() => expect(assistantCalls()).toBe(5));
    const sent = vi
      .mocked(fetch)
      .mock.calls.filter((c) => String(c[0]) === '/api/assistant')
      .map((c) => JSON.parse(String(c[1]?.body)));
    expect(sent.map((b) => b.mode)).toEqual(['summary', 'summary', 'summary', 'question', 'question']);
    // The household change started a fresh conversation, and a summary request is never sent as a question…
    expect(sent[3].history).toEqual([]);
    // …so the follow-up carries only the typed question before it, never the answer or "Explain my plan".
    expect(sent[4].history).toEqual(['Can my kids play outside?']);
    expect(sent.flatMap((b) => b.history)).not.toContain('Explain my plan');
  });

  it.each([
    ['not_configured', /needs a Gemini API key/],
    ['ai_rate_limited', /free Gemini limit/],
    ['error', /could not answer/],
    ['too_many_requests', /lot of questions in one minute/],
    ['daily_limit', /come back tomorrow/],
  ] as const)(
    'explains a %s assistant failure in plain words, on the automatic summary and on a re-ask',
    async (mode, message) => {
      const user = userEvent.setup();
      localStorage.setItem(PLACE_KEY, JSON.stringify(DELHI));
      mockNetwork({ assistant: mode });
      render(<App />);
      await screen.findByRole('heading', { name: /Air right now/ });
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      await user.click(await screen.findByRole('button', { name: /Explain my plan/ }));
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(screen.queryByRole('figure', { name: /Personal summary|Answer/ })).not.toBeInTheDocument();
    },
  );

  it('shows skeletons while air data and an answer are loading, then replaces them', async () => {
    localStorage.setItem(PLACE_KEY, JSON.stringify(DELHI));
    let releaseAir: () => void = () => undefined;
    let releaseAnswer: () => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('air-quality-api')) {
          await new Promise<void>((r) => (releaseAir = r));
          return jsonResponse(openMeteoPayload(10));
        }
        if (url.includes('api.open-meteo.com')) return new Response('', { status: 404 });
        await new Promise<void>((r) => (releaseAnswer = r));
        return jsonResponse({ text: 'Done.' });
      }),
    );
    const { container } = render(<App />);
    const message = await screen.findByText('Fetching live air quality…');
    expect(message.closest('[role="status"]')).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelector('.air-skeleton')).not.toBeNull();
    expect(container.querySelector('.plan-skeleton')).not.toBeNull();
    releaseAir();
    await screen.findByRole('heading', { name: /Air right now/ });
    expect(container.querySelector('.air-skeleton')).toBeNull();
    expect(container.querySelector('.plan-skeleton')).toBeNull();

    // The summary is requested on its own as soon as the plan is there.
    expect(await screen.findByText('Writing your answer…')).toBeInTheDocument();
    expect(container.querySelector('.answer-skeleton')).not.toBeNull();
    expect(screen.getByRole('button', { name: /Explain my plan/ })).toHaveAttribute('aria-busy', 'true');
    releaseAnswer();
    expect(await screen.findByText('Done.')).toBeInTheDocument();
    expect(container.querySelector('.answer-skeleton')).toBeNull();
  });
});
