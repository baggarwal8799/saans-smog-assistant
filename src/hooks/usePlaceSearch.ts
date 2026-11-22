import { useState, type SubmitEvent } from 'react';
import { coordsLabel, currentPosition, reverseGeocode, searchPlaces } from '../lib/geo';
import { t } from '../lib/i18n';
import type { Lang, Place } from '../lib/types';

export type SearchStatus =
  { kind: 'idle' } | { kind: 'busy' } | { kind: 'locating' } | { kind: 'error'; message: string } | { kind: 'empty' };

/** The place search, its results, "use my location", and whether a chosen place is being changed. */
export function usePlaceSearch(lang: Lang, onSelect: (place: Place) => void) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [status, setStatus] = useState<SearchStatus>({ kind: 'idle' });
  const [changing, setChanging] = useState(false);

  async function search(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus({ kind: 'busy' });
    try {
      const found = await searchPlaces(query, lang);
      setResults(found);
      setStatus(found.length ? { kind: 'idle' } : { kind: 'empty' });
    } catch {
      setStatus({ kind: 'error', message: t(lang, 'searchError') });
    }
  }

  function choose(place: Place) {
    setResults([]);
    setStatus({ kind: 'idle' });
    setChanging(false);
    onSelect(place);
  }

  async function locate() {
    setStatus({ kind: 'locating' });
    let position: Place;
    try {
      position = await currentPosition('');
    } catch {
      // Browser error text is untranslated, so show our own message in the user's language.
      setStatus({ kind: 'error', message: t(lang, 'locationError') });
      return;
    }
    // Name the place ("Lucknow, Uttar Pradesh, India"); if the lookup fails, fall back to coordinates.
    const named = await reverseGeocode(position.lat, position.lon, lang).catch(() => null);
    choose(named ?? { ...position, name: coordsLabel(position.lat, position.lon) });
  }

  const busy = status.kind === 'busy' || status.kind === 'locating';
  return { query, setQuery, results, status, busy, changing, setChanging, search, choose, locate };
}
