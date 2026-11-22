import { useCallback, useEffect, useState } from 'react';
import { fetchAirReport } from '../lib/aqi';
import type { AirReport, Place } from '../lib/types';

export type AirState =
  { kind: 'none' } | { kind: 'loading' } | { kind: 'ready'; report: AirReport } | { kind: 'error' };
type AirResult = { key: string; report: AirReport } | { key: string; error: true };

// Loading is derived, not stored: any result for an older request means the new one is in flight.
function airState(requestKey: string | null | undefined, result: AirResult | null): AirState {
  if (!requestKey) return { kind: 'none' };
  if (result?.key !== requestKey) return { kind: 'loading' };
  return 'report' in result ? { kind: 'ready', report: result.report } : { kind: 'error' };
}

/** The air report for a place: fetched whenever the place changes or `retry` is called; only the latest counts. */
export function useAirReport(place: Place | null): { air: AirState; retry: () => void } {
  const [result, setResult] = useState<AirResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const requestKey = place ? `${place.lat},${place.lon}#${attempt}` : null;

  useEffect(() => {
    if (!place || !requestKey) return;
    let cancelled = false;
    fetchAirReport(place)
      .then((report) => {
        if (!cancelled) setResult({ key: requestKey, report });
      })
      .catch(() => {
        if (!cancelled) setResult({ key: requestKey, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [place, requestKey]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { air: airState(requestKey, result), retry };
}
