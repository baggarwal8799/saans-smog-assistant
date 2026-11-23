import { useCallback, useEffect, useState } from 'react';

import type { AirReport, Place } from '../../core/types.js';
import { preloadAssistant } from '../components/Workspace.js';
import { loadPlace, savePlace } from '../lib/storage.js';
import { useRevealOnLoad } from './scrollIntoView.js';
import { type AirState, useAirReport } from './useAirReport.js';

interface AirForPlace {
  place: Place | null;
  choosePlace: (p: Place) => void;
  air: AirState;
  report: AirReport | null;
  retry: () => void;
}

/** The chosen place (restored and saved across visits) and its air report. */
export function useAirForPlace(): AirForPlace {
  const [place, setPlace] = useState<Place | null>(loadPlace);
  const { air, retry } = useAirReport(place);
  const report = air.kind === 'ready' ? air.report : null;
  // Armed when the user picks a place, so the result is brought into view once it loads (on phones it renders below
  // the household form, and nothing would visibly happen otherwise).
  const revealOnLoad = useRevealOnLoad(report, 'air-heading');
  const choosePlace = useCallback(
    (p: Place) => {
      revealOnLoad();
      setPlace(p);
    },
    [revealOnLoad],
  );

  useEffect(() => {
    if (!place) return;
    savePlace(place);
    preloadAssistant();
  }, [place]);

  return { place, choosePlace, air, report, retry };
}
