import { type RefObject, type SubmitEvent, useRef, useState } from 'react';

import { t } from '../../core/i18n.js';
import type { Lang, Place } from '../../core/types.js';
import { coordsLabel, currentPosition, reverseGeocode, searchPlaces } from '../lib/geo.js';

export type SearchStatus =
  { kind: 'idle' } | { kind: 'busy' } | { kind: 'locating' } | { kind: 'error'; message: string } | { kind: 'empty' };

interface PlaceSearch {
  input: { query: string; setQuery: (query: string) => void };
  view: { results: Place[]; status: SearchStatus; busy: boolean };
  changing: { active: boolean; start: () => void };
  actions: {
    search: (e: SubmitEvent<HTMLFormElement>) => Promise<void>;
    choose: (place: Place) => void;
    locate: () => Promise<void>;
  };
}

export function usePlaceSearch(lang: Lang, onSelect: (place: Place) => void): PlaceSearch {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [status, setStatus] = useState<SearchStatus>({ kind: 'idle' });
  const [changing, setChanging] = useState(false);
  const latest = useRef(0);

  async function search(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const isLatest = startRequest(latest, setStatus, 'busy');
    try {
      const found = await searchPlaces(query, lang);
      if (!isLatest()) return;
      setResults(found);
      setStatus(found.length ? { kind: 'idle' } : { kind: 'empty' });
    } catch {
      if (isLatest()) setStatus({ kind: 'error', message: t(lang, 'searchError') });
    }
  }

  function choose(place: Place) {
    // A choice ends the search, so a reply still on its way cannot reopen the list.
    latest.current++;
    setResults([]);
    setStatus({ kind: 'idle' });
    setChanging(false);
    onSelect(place);
  }

  async function locate() {
    const isLatest = startRequest(latest, setStatus, 'locating');
    const place = await namedPosition(lang).catch(() => null);
    if (!isLatest()) return;
    // Browser error text is untranslated, so a failure shows our own message in the user's language.
    if (place) choose(place);
    else setStatus({ kind: 'error', message: t(lang, 'locationError') });
  }

  const busy = status.kind === 'busy' || status.kind === 'locating';
  return {
    input: { query, setQuery },
    view: { results, status, busy },
    changing: { active: changing, start: () => setChanging(true) },
    actions: { search, choose, locate },
  };
}

/**
 * Starts a search or a locate. Only the latest one may change the screen, so a slow earlier reply can never replace
 * a newer one: the returned check stays true only until another request starts or a place is chosen.
 */
function startRequest(
  latest: RefObject<number>,
  setStatus: (status: SearchStatus) => void,
  kind: 'busy' | 'locating',
): () => boolean {
  const id = ++latest.current;
  setStatus({ kind });
  return () => id === latest.current;
}

async function namedPosition(lang: Lang): Promise<Place> {
  const position = await currentPosition();
  const named = await reverseGeocode(position.lat, position.lon, lang).catch(() => null);
  return named ?? { ...position, name: coordsLabel(position.lat, position.lon) };
}
