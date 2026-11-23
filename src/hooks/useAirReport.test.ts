import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AirReport, Place } from '../../core/types.js';
import { deferred } from '../../test/deferred.js';
import { DELHI, report } from '../../test/fixtures.js';
import * as browserAir from '../lib/browserAir.js';
import { useAirReport } from './useAirReport.js';

vi.mock('../lib/browserAir.js', () => ({ fetchAirReport: vi.fn() }));

const fetchReport = vi.mocked(browserAir.fetchAirReport);
const MUMBAI: Place = { name: 'Mumbai', lat: 19.08, lon: 72.88, region: 'Maharashtra', country: 'India' };

function switchedPlace() {
  const old = deferred<AirReport>();
  const fresh = deferred<AirReport>();
  fetchReport.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
  const { result, rerender } = renderHook(({ place }) => useAirReport(place), { initialProps: { place: DELHI } });
  rerender({ place: MUMBAI });
  return { old, fresh, result };
}

beforeEach(() => fetchReport.mockReset());

describe('useAirReport after the place changes', () => {
  it('keeps the new place’s report when the old one arrives late', async () => {
    const { old, fresh, result } = switchedPlace();
    const mumbai = { ...report(), place: MUMBAI };
    await act(async () => fresh.resolve(mumbai));
    await act(async () => old.resolve(report()));
    expect(result.current.air).toEqual({ kind: 'ready', report: mumbai });
  });

  it('does not show an error when the old place’s request fails late', async () => {
    const { old, fresh, result } = switchedPlace();
    await act(async () => old.reject(new Error('timeout')));
    expect(result.current.air).toEqual({ kind: 'loading' });
    await act(async () => fresh.reject(new Error('down')));
    expect(result.current.air).toEqual({ kind: 'error' });
  });
});
