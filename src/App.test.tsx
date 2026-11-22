import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { clearAirCache } from './lib/aqi';
import { PLACE_KEY } from './lib/profile';
import { DELHI, jsonResponse } from './test/fixtures';
import { axeViolations, mockNetwork } from './test/network';

beforeEach(() => clearAirCache());
afterEach(() => vi.unstubAllGlobals());

describe('App: air, plan and household', () => {
  it('starts with no location and no accessibility violations', async () => {
    mockNetwork();
    const { container } = render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: /Saans/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'How’s the air where you are?' })).toBeInTheDocument();
    // Nothing below the question until a place is chosen.
    expect(screen.queryByRole('region', { name: /Your plan for today/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Skip to main content/ })).toHaveAttribute('href', '#main');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('searches a city, shows live air, a full plan with impacts, and stays accessible', async () => {
    const user = userEvent.setup();
    mockNetwork();
    const { container } = render(<App />);

    await user.type(screen.getByRole('searchbox', { name: /Search your city/ }), 'Delhi');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await user.click(await screen.findByRole('button', { name: 'New Delhi, Delhi, India' }));

    const airHeading = await screen.findByRole('heading', { name: /Air right now/ });
    // The result is brought into view and focused, so picking a city visibly does something on phones.
    await waitFor(() => expect(airHeading).toHaveFocus());
    expect(airHeading).toHaveTextContent('Air right now in New Delhi, Delhi, India');
    expect(screen.getByRole('button', { name: 'Change place' })).toBeInTheDocument();
    // The search collapses once a place is chosen, and reopens on demand.
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.getByText('262')).toBeInTheDocument();
    expect(screen.getByText('Very unhealthy')).toBeInTheDocument();
    expect(screen.getByText(/like smoking .* cigarettes/)).toBeInTheDocument();

    const plan = screen.getByRole('region', { name: /Your plan for today/ });
    const steps = within(plan).getByRole('region', { name: 'Do these first' });
    expect(within(steps).getAllByRole('listitem')).toHaveLength(3);
    for (const name of [/Low-emission routine/, /Indoor air fixes/, /Sustainable swaps/]) {
      expect(within(plan).getByRole('heading', { name })).toBeInTheDocument();
    }
    expect(within(plan).getByText(/less pollution in your lungs/)).toBeInTheDocument();
    // Every "How we worked this out" toggle has its own accessible name (the tip's title).
    const toggles = [...plan.querySelectorAll('.why summary')].map((el) => el.textContent ?? '');
    expect(new Set(toggles).size).toBe(toggles.length);
    expect(within(plan).getAllByText(/Cuts PM2.5 (outdoors|at home|while exercising|in the kitchen|for them)/).length).toBeGreaterThan(2);
    expect(within(plan).getAllByText('Removes a smoke source').length).toBeGreaterThan(0);
    expect(within(plan).getByRole('heading', { name: /Community action/ })).toBeInTheDocument();
    expect(within(plan).getAllByText(/kg CO₂/).length).toBeGreaterThan(0);
    expect(localStorage.getItem(PLACE_KEY)).toContain('New Delhi');

    expect(await axeViolations(container)).toEqual([]);
  });

  it('updates the plan when the profile changes and persists it', async () => {
    const user = userEvent.setup();
    localStorage.setItem(PLACE_KEY, JSON.stringify(DELHI));
    mockNetwork();
    render(<App />);
    await screen.findByRole('heading', { name: /Air right now/ });

    expect(screen.queryByText(/Never burn coal/)).not.toBeInTheDocument();
    // The household starts as a one-line summary; the form opens on demand.
    const edit = screen.getByRole('button', { name: 'Edit household' });
    expect(edit).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(/4 people, children, Car 10 km/)).toBeInTheDocument();
    // Until it is edited, the plan says it is built on a sample household, and nothing is stored.
    expect(screen.getByText(/sample household above, not yours yet/)).toBeInTheDocument();
    expect(localStorage.getItem('saans.profile.v1')).toBeNull();
    await user.click(edit);
    expect(screen.getByRole('button', { name: 'Done' })).toHaveAttribute('aria-expanded', 'true');
    // The editor is its own chunk, so its fields arrive a moment after the click.
    await user.selectOptions(await screen.findByLabelText('Winter heating'), 'coal');
    // The carbon-monoxide warning gets its own "Safety first" group, above and outside the three "Do these first".
    const safety = await screen.findByRole('region', { name: 'Safety first' });
    expect(within(safety).getAllByRole('listitem')[0]).toHaveTextContent(/Never burn coal/);
    expect(within(screen.getByRole('region', { name: 'Do these first' })).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('heading', { name: /Never burn coal/ })).toHaveAttribute('id', 'rec-safe-heating');
    expect(screen.getByText(/Coal \/ angithi/, { selector: '.household-line' })).toBeInTheDocument();

    // Working from home hides the commute distance, which no longer applies.
    await user.selectOptions(screen.getByLabelText('Main daily commute'), 'wfh');
    expect(screen.queryByLabelText('One-way commute distance (km)')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Main daily commute'), 'car');

    // A household that already has a purifier is not told to build one, nor credited for running it.
    expect(screen.getByText(/Build a DIY box-fan/)).toBeInTheDocument();
    await user.click(screen.getByLabelText('We have an air purifier'));
    expect(screen.queryByText(/Build a DIY box-fan/)).not.toBeInTheDocument();

    // Clearing a number box to retype must not snap back to the default.
    const size = screen.getByLabelText('People at home');
    await user.clear(size);
    expect(size).toHaveValue(null);
    await user.type(size, '6');
    expect(size).toHaveValue(6);
    await user.tab();
    expect(size).toHaveValue(6);
    expect(localStorage.getItem('saans.profile.v1')).toContain('"householdSize":6');

    const km = screen.getByLabelText('One-way commute distance (km)');
    await user.clear(km);
    await user.type(km, '2');
    await user.selectOptions(screen.getByLabelText('Cooking fuel'), 'biomass');
    expect(screen.getByRole('heading', { name: /Switch to LPG or induction/ })).toBeInTheDocument();
    expect(localStorage.getItem('saans.profile.v1')).toContain('"heating":"coal"');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText(/sample household/)).not.toBeInTheDocument();
    expect(screen.getByText(/Your plan is tailored to these details/)).toBeInTheDocument();
  });

  it('shows an error with retry when air data fails', async () => {
    const user = userEvent.setup();
    localStorage.setItem(PLACE_KEY, JSON.stringify(DELHI));
    const { fetchMock } = mockNetwork({ airFails: true });
    render(<App />);
    expect(await screen.findByText(/Could not load air quality/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes('air-quality')).length).toBe(2));
  });

  it('switches the whole interface to Hindi and sets the document language', async () => {
    const user = userEvent.setup();
    localStorage.setItem(PLACE_KEY, JSON.stringify(DELHI));
    mockNetwork();
    const { container } = render(<App />);
    await screen.findByRole('heading', { name: /Air right now/ });

    await user.click(screen.getByRole('button', { name: /Language/ }));
    expect(document.documentElement.lang).toBe('hi');
    expect(screen.getByRole('heading', { name: /आज के लिए आपकी योजना/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /अभी की हवा/ })).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('says so when a search finds nothing', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({})));
    render(<App />);
    await user.type(screen.getByRole('searchbox'), 'Zzzz');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText(/No places found/)).toBeInTheDocument();
  });
});
