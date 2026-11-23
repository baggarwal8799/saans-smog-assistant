import { type ReactElement, type SubmitEvent, useId } from 'react';

import { t } from '../../core/i18n.js';
import { placeLabel } from '../../core/place.js';
import type { Place } from '../../core/types.js';
import { useCurrentLang } from '../hooks/useCurrentLang.js';
import { type SearchStatus, usePlaceSearch } from '../hooks/usePlaceSearch.js';
import { MAX_QUERY } from '../lib/geo.js';
import { Spinner } from './Skeleton.js';

interface Props {
  selected: Place | null;
  onSelect: (place: Place) => void;
}

/**
 * With no place chosen this is the page's opening question. Once a place is chosen it shrinks to a
 * one-line "Change place" control so the air reading can take the space.
 */
export function LocationPicker({ selected, onSelect }: Readonly<Props>): ReactElement {
  const lang = useCurrentLang();
  const { input, view, changing, actions } = usePlaceSearch(lang, onSelect);
  const statusId = useId();
  const open = !selected || changing.active;

  return (
    <section aria-labelledby="loc-heading" className={open ? 'locate open' : 'locate'}>
      {selected && !changing.active ? (
        <LocateBar selected={selected} onChange={changing.start} />
      ) : (
        <>
          <h2 id="loc-heading" className={selected ? 'locate-title compact' : 'locate-title'}>
            {t(lang, 'locationHeading')}
          </h2>
          {!selected && <p className="locate-lede">{t(lang, 'locationLede')}</p>}
          <SearchForm
            query={input.query}
            onQuery={input.setQuery}
            onSearch={actions.search}
            status={view.status}
            busy={view.busy}
            statusId={statusId}
          />
          <UseMyLocation status={view.status} busy={view.busy} onLocate={actions.locate} />
        </>
      )}
      <StatusLine id={statusId} status={view.status} />
      <ResultsList results={view.results} onChoose={actions.choose} />
    </section>
  );
}

function LocateBar({ selected, onChange }: Readonly<{ selected: Place; onChange: () => void }>) {
  const lang = useCurrentLang();
  return (
    <div className="locate-bar">
      <h2 id="loc-heading" className="visually-hidden">
        {t(lang, 'locationHeading')}
      </h2>
      {/* The air heading already names the place; this keeps it in reading order for screen readers. */}
      <p className="visually-hidden">
        {t(lang, 'showingFor')}: {placeLabel(selected)}
      </p>
      <button type="button" className="ghost" onClick={onChange}>
        {t(lang, 'changePlace')}
      </button>
    </div>
  );
}

interface SearchFormProps {
  query: string;
  onQuery: (q: string) => void;
  onSearch: (e: SubmitEvent<HTMLFormElement>) => Promise<void>;
  status: SearchStatus;
  busy: boolean;
  statusId: string;
}

function SearchForm({ query, onQuery, onSearch, status, busy, statusId }: Readonly<SearchFormProps>) {
  const lang = useCurrentLang();
  const inputId = useId();
  return (
    <form role="search" onSubmit={(e) => void onSearch(e)} className="search-row">
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
        maxLength={MAX_QUERY}
        value={query}
        placeholder={t(lang, 'searchPlaceholder')}
        aria-describedby={statusId}
        onChange={(e) => onQuery(e.target.value)}
      />
      <button type="submit" disabled={busy} aria-busy={status.kind === 'busy'}>
        {status.kind === 'busy' && <Spinner />}
        {t(lang, 'search')}
      </button>
    </form>
  );
}

function UseMyLocation({
  status,
  busy,
  onLocate,
}: Readonly<{ status: SearchStatus; busy: boolean; onLocate: () => Promise<void> }>) {
  const lang = useCurrentLang();
  return (
    <button
      type="button"
      className="ghost"
      onClick={() => void onLocate()}
      disabled={busy}
      aria-busy={status.kind === 'locating'}
    >
      {status.kind === 'locating' && <Spinner />}
      {t(lang, 'useMyLocation')}
    </button>
  );
}

function StatusLine({ id, status }: Readonly<{ id: string; status: SearchStatus }>) {
  const lang = useCurrentLang();
  return (
    <p id={id} role="status" className={status.kind === 'error' ? 'error' : 'status'}>
      {status.kind === 'busy' && t(lang, 'searching')}
      {status.kind === 'locating' && t(lang, 'locating')}
      {status.kind === 'empty' && t(lang, 'noResults')}
      {status.kind === 'error' && status.message}
    </p>
  );
}

function ResultsList({ results, onChoose }: Readonly<{ results: Place[]; onChoose: (p: Place) => void }>) {
  const lang = useCurrentLang();
  if (results.length === 0) return null;
  return (
    <ul aria-label={t(lang, 'results')} className="results">
      {results.map((p) => (
        <li key={`${p.lat},${p.lon}`}>
          <button type="button" className="result" onClick={() => onChoose(p)}>
            {placeLabel(p)}
          </button>
        </li>
      ))}
    </ul>
  );
}
