import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as aqi from '../lib/aqi';
import type { AirReport, Place } from '../lib/types';
import { DELHI, report } from '../test/fixtures';
import { useAirReport } from './useAirReport';

vi.mock('../lib/aqi', async (importOriginal) => ({
  ...(await importOriginal<typeof aqi>()),
  fetchAirReport: vi.fn(),
}));

const fetchReport = vi.mocked(aqi.fetchAirReport);
const MUMBAI: Place = { name: 'Mumbai', lat: 19.08, lon: 72.88, region: 'Maharashtra', country: 'India' };

function deferred() {
  let resolve!: (r: AirReport) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<AirReport>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => fetchReport.mockReset());

describe('useAirReport after the place changes', () => {
  it('keeps the new place’s report when the old one arrives late', async () => {
    const old = deferred();
    const fresh = deferred();
    fetchReport.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const { result, rerender } = renderHook(({ place }) => useAirReport(place), { initialProps: { place: DELHI } });
    rerender({ place: MUMBAI });
    const mumbai = { ...report(), place: MUMBAI };
    await act(async () => fresh.resolve(mumbai));
    await act(async () => old.resolve(report()));
    expect(result.current.air).toEqual({ kind: 'ready', report: mumbai });
  });

  it('does not show an error when the old place’s request fails late', async () => {
    const old = deferred();
    const fresh = deferred();
    fetchReport.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const { result, rerender } = renderHook(({ place }) => useAirReport(place), { initialProps: { place: DELHI } });
    rerender({ place: MUMBAI });
    await act(async () => old.reject(new Error('timeout')));
    expect(result.current.air).toEqual({ kind: 'loading' });
    await act(async () => fresh.reject(new Error('down')));
    expect(result.current.air).toEqual({ kind: 'error' });
  });
});
