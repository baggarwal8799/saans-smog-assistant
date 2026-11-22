import { useId, type SubmitEvent } from 'react';
import { usePlaceSearch, type SearchStatus } from '../hooks/usePlaceSearch';
import { placeLabel } from '../lib/geo';
import { t } from '../lib/i18n';
import type { Lang, Place } from '../lib/types';
import { Spinner } from './Skeleton';

interface Props {
  lang: Lang;
  selected: Place | null;
  onSelect: (place: Place) => void;
}

/**
 * With no place chosen this is the page's opening question. Once a place is chosen it shrinks to a
 * one-line "Change place" control so the air reading can take the space.
 */
export function LocationPicker({ lang, selected, onSelect }: Readonly<Props>) {
  const search = usePlaceSearch(lang, onSelect);
  const statusId = useId();
  const open = !selected || search.changing;

  return (
    <section aria-labelledby="loc-heading" className={open ? 'locate open' : 'locate'}>
      {selected && !search.changing ? (
        <LocateBar lang={lang} selected={selected} onChange={() => search.setChanging(true)} />
      ) : (
        <>
          <h2 id="loc-heading" className={selected ? 'locate-title compact' : 'locate-title'}>
            {t(lang, 'locationHeading')}
          </h2>
          {!selected && <p className="locate-lede">{t(lang, 'locationLede')}</p>}
          <SearchForm
            lang={lang}
            query={search.query}
            onQuery={search.setQuery}
            onSearch={search.search}
            status={search.status}
            busy={search.busy}
            statusId={statusId}
          />
          <UseMyLocation lang={lang} status={search.status} busy={search.busy} onLocate={search.locate} />
        </>
      )}
      <StatusLine id={statusId} lang={lang} status={search.status} />
      <ResultsList lang={lang} results={search.results} onChoose={search.choose} />
    </section>
  );
}

function LocateBar({ lang, selected, onChange }: Readonly<{ lang: Lang; selected: Place; onChange: () => void }>) {
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
  lang: Lang;
  query: string;
  onQuery: (q: string) => void;
  onSearch: (e: SubmitEvent<HTMLFormElement>) => Promise<void>;
  status: SearchStatus;
  busy: boolean;
  statusId: string;
}

function SearchForm({ lang, query, onQuery, onSearch, status, busy, statusId }: Readonly<SearchFormProps>) {
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
        maxLength={80}
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

function UseMyLocation(
  props: Readonly<{ lang: Lang; status: SearchStatus; busy: boolean; onLocate: () => Promise<void> }>,
) {
  const { lang, status, busy, onLocate } = props;
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

function StatusLine({ id, lang, status }: Readonly<{ id: string; lang: Lang; status: SearchStatus }>) {
  return (
    <p id={id} role="status" className={status.kind === 'error' ? 'error' : 'status'}>
      {status.kind === 'busy' && t(lang, 'searching')}
      {status.kind === 'locating' && t(lang, 'locating')}
      {status.kind === 'empty' && t(lang, 'noResults')}
      {status.kind === 'error' && status.message}
    </p>
  );
}

function ResultsList({
  lang,
  results,
  onChoose,
}: Readonly<{ lang: Lang; results: Place[]; onChoose: (p: Place) => void }>) {
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
