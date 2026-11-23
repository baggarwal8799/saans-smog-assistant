import { useCallback, useEffect, useState } from 'react';

import { placeKey } from '../../core/place.js';
import type { AirReport, Place } from '../../core/types.js';
import { fetchAirReport } from '../lib/browserAir.js';

export type AirState =
  { kind: 'none' } | { kind: 'loading' } | { kind: 'ready'; report: AirReport } | { kind: 'error' };
type AirResult = { key: string; report: AirReport } | { key: string; error: true };

/** Exact coordinates: any move fetches again (the air cache still rounds to its grid). */
function keyFor(place: Place, attempt: number): string {
  return `${placeKey(place)}#${attempt}`;
}

/** Loading is derived, not stored: any result for an older request means the new one is in flight. */
function airState(requestKey: string | null | undefined, result: AirResult | null): AirState {
  if (!requestKey) return { kind: 'none' };
  if (result?.key !== requestKey) return { kind: 'loading' };
  return 'report' in result ? { kind: 'ready', report: result.report } : { kind: 'error' };
}

export function useAirReport(place: Place | null): { air: AirState; retry: () => void } {
  const [result, setResult] = useState<AirResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const requestKey = place ? keyFor(place, attempt) : null;

  useEffect(() => {
    if (!place) return;
    const key = keyFor(place, attempt);
    let cancelled = false;
    fetchAirReport(place)
      .then((report) => {
        if (!cancelled) setResult({ key, report });
      })
      .catch(() => {
        if (!cancelled) setResult({ key, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [place, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { air: airState(requestKey, result), retry };
}
