import { useId, useState, type FormEvent } from 'react';
import { coordsLabel, currentPosition, placeLabel, reverseGeocode, searchPlaces } from '../lib/geo';
import { t } from '../lib/i18n';
import type { Lang, Place } from '../lib/types';
import { Spinner } from './Skeleton';

interface Props {
  lang: Lang;
  selected: Place | null;
  onSelect: (place: Place) => void;
}

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'locating' } | { kind: 'error'; message: string } | { kind: 'empty' };

/**
 * With no place chosen this is the page's opening question. Once a place is chosen it shrinks to a
 * one-line "Change place" control so the air reading can take the space.
 */
export function LocationPicker({ lang, selected, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [changing, setChanging] = useState(false);
  const inputId = useId();
  const statusId = useId();
  const open = !selected || changing;
  const busy = status.kind === 'busy' || status.kind === 'locating';

  async function onSearch(e: FormEvent<HTMLFormElement>) {
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

  async function onLocate() {
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

  return (
    <section aria-labelledby="loc-heading" className={open ? 'locate open' : 'locate'}>
      {selected && !changing ? (
        <div className="locate-bar">
          <h2 id="loc-heading" className="visually-hidden">
            {t(lang, 'locationHeading')}
          </h2>
          {/* The air heading already names the place; this keeps it in reading order for screen readers. */}
          <p className="visually-hidden">
            {t(lang, 'showingFor')}: {placeLabel(selected)}
          </p>
          <button type="button" className="ghost" onClick={() => setChanging(true)}>
            {t(lang, 'changePlace')}
          </button>
        </div>
      ) : (
        <>
          <h2 id="loc-heading" className={selected ? 'locate-title compact' : 'locate-title'}>
            {t(lang, 'locationHeading')}
          </h2>
          {!selected && <p className="locate-lede">{t(lang, 'locationLede')}</p>}
          <form role="search" onSubmit={onSearch} className="search-row">
            <label htmlFor={inputId} className="visually-hidden">
              {t(lang, 'searchLabel')}
            </label>
            <input
              id={inputId}
              type="search"
              name="place"
              autoComplete="address-level2"
              required
              minLength={2}
              maxLength={80}
              value={query}
              placeholder={t(lang, 'searchPlaceholder')}
              aria-describedby={statusId}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit" disabled={busy} aria-busy={status.kind === 'busy'}>
              {status.kind === 'busy' && <Spinner />}
              {t(lang, 'search')}
            </button>
          </form>
          <button type="button" className="ghost" onClick={onLocate} disabled={busy} aria-busy={status.kind === 'locating'}>
            {status.kind === 'locating' && <Spinner />}
            {t(lang, 'useMyLocation')}
          </button>
        </>
      )}

      <p id={statusId} role="status" className={status.kind === 'error' ? 'error' : 'status'}>
        {status.kind === 'busy' && t(lang, 'searching')}
        {status.kind === 'locating' && t(lang, 'locating')}
        {status.kind === 'empty' && t(lang, 'noResults')}
        {status.kind === 'error' && status.message}
      </p>

      {results.length > 0 && (
        <ul aria-label={t(lang, 'results')} className="results">
          {results.map((p) => (
            <li key={`${p.lat},${p.lon}`}>
              <button type="button" className="result" onClick={() => choose(p)}>
                {placeLabel(p)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
