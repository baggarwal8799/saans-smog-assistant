import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { clearAirCache } from './lib/aqi';
import { jsonResponse, openMeteoPayload } from './test/fixtures';
import { mockNetwork } from './test/network';

beforeEach(() => clearAirCache());
afterEach(() => vi.unstubAllGlobals());

describe('App: location', () => {
  it('names "Use my location" with the real place, and falls back to coordinates', async () => {
    const user = userEvent.setup();
    const geo = { getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: 26.8468, longitude: 80.9462 } } as GeolocationPosition) };
    vi.stubGlobal('navigator', { ...navigator, geolocation: geo });
    const { fetchMock } = mockNetwork();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('bigdatacloud')) return jsonResponse({ city: 'Lucknow', principalSubdivision: 'Uttar Pradesh', countryName: 'India' });
      if (url.includes('air-quality-api')) return jsonResponse(openMeteoPayload(10));
      return new Response('', { status: 404 });
    });
    const { unmount } = render(<App />);
    await user.click(screen.getByRole('button', { name: /Use my location/ }));
    expect(await screen.findByRole('heading', { name: 'Air right now in Lucknow, Uttar Pradesh, India' })).toBeInTheDocument();
    expect(screen.queryByText(/My location/)).not.toBeInTheDocument();
    unmount();
    localStorage.clear();
    clearAirCache();

    fetchMock.mockImplementation(async (input: RequestInfo | URL) =>
      String(input).includes('air-quality-api') ? jsonResponse(openMeteoPayload(10)) : new Response('', { status: 503 }),
    );
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Use my location/ }));
    expect(await screen.findByRole('heading', { name: 'Air right now in 26.85° N, 80.95° E' })).toBeInTheDocument();
  });

  it('reports a location error from the browser', async () => {
    const user = userEvent.setup();
    mockNetwork();
    vi.stubGlobal('navigator', { ...navigator, geolocation: undefined });
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Use my location/ }));
    expect(await screen.findByText(/Could not get your location/)).toBeInTheDocument();
  });
});
