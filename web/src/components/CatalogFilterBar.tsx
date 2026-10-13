import { useEffect, useId, useRef, useState } from 'react';
import type { CatalogFilterOptions } from '../api/types';
import { langLabel, type CatalogFilters } from '../catalog';

interface Props {
  kind: 'movies' | 'series';
  groups: string[];
  filters: CatalogFilters;
  options?: CatalogFilterOptions;
  loading?: boolean;
}

/*
 * Search and Category stay inline — they are what a viewer reaches for
 * constantly. The other ten filters lived in the same grid and pushed the
 * results off the first screen, badly so on a tablet, which is where this gets
 * watched. They now sit behind a button.
 */

/** How many of the filters behind the button are actually set. */
function advancedCount(filters: CatalogFilters): number {
  const values: string[] = [
    filters.year,
    filters.genre,
    filters.actor,
    filters.director,
    filters.minRating,
    filters.maxRating,
    filters.minImdbScore,
    filters.maxImdbScore,
    filters.audioLang,
    filters.subtitled,
  ];
  return values.filter((v) => v !== '').length;
}

export function CatalogFilterBar({
  kind,
  groups,
  filters,
  options,
  loading,
}: Props) {
  const prefix = kind === 'movies' ? 'movie' : 'series';
  const [open, setOpen] = useState(false);
  const count = advancedCount(filters);

  return (
    <>
      <form
        className="controls controls-inline"
        role="search"
        onSubmit={(e) => e.preventDefault()}
      >
        <div className="control control-grow">
          <label htmlFor={`${prefix}-search`}>Search</label>
          <input
            id={`${prefix}-search`}
            type="text"
            placeholder={`Search ${kind}…`}
            value={filters.query}
            onChange={(e) => filters.setQuery(e.target.value)}
          />
        </div>

        <div className="control">
          <label htmlFor={`${prefix}-group`}>Category</label>
          <select
            id={`${prefix}-group`}
            value={filters.group}
            onChange={(e) => filters.setGroup(e.target.value)}
          >
            <option value="">All categories</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        <div className="control control-action">
          <button
            type="button"
            className="secondary filter-open"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            Filters
            {count > 0 && (
              <span className="filter-count" aria-hidden="true">
                {count}
              </span>
            )}
            <span className="sr-only">
              {count > 0 ? `, ${count} active` : ', none active'}
            </span>
          </button>
        </div>

        {filters.active && (
          <div className="control control-action">
            <button
              type="button"
              className="secondary btn-sm clear-search"
              onClick={filters.clear}
            >
              Clear
            </button>
          </div>
        )}
      </form>

      {open && (
        <FilterDialog
          kind={kind}
          prefix={prefix}
          filters={filters}
          options={options}
          loading={loading}
          activeCount={count}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/**
 * The advanced filters, as a modal.
 *
 * Built from plain elements rather than `<dialog>`: that element needs Safari
 * 15.4, and this app deliberately supports Safari 12 so old tablets can be used
 * as screens. Escape and a backdrop click close it, and focus moves in on open
 * so a keyboard or TV remote can reach the fields.
 */
function FilterDialog({
  kind,
  prefix,
  filters,
  options,
  loading,
  activeCount,
  onClose,
}: {
  kind: 'movies' | 'series';
  prefix: string;
  filters: CatalogFilters;
  options?: CatalogFilterOptions;
  loading?: boolean;
  activeCount: number;
  onClose: () => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Held in a ref so the listener below can depend on nothing and still call the
  // current handler.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Mount only. Re-running this on every render would drag focus back to the
  // first field after each keystroke, which made the Actor and Director text
  // fields impossible to type into — only the first character landed.
  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>('select, input')?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const yearOptions = options?.years ?? [];
  const genreList = options?.genres ?? [];
  const actorList = options?.actors ?? [];
  const directorList = options?.directors ?? [];
  const audioLangs = options?.audioLangs ?? [];

  return (
    <div
      className="filter-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="filter-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="filter-panel-head">
          <h2 id={titleId}>Filters</h2>
          <button
            type="button"
            className="secondary btn-sm"
            onClick={onClose}
            aria-label="Close filters"
          >
            ✕
          </button>
        </header>

        <form
          className="filter-panel-body"
          onSubmit={(e) => {
            e.preventDefault();
            onClose();
          }}
        >
          <div className="control">
            <label htmlFor={`${prefix}-year`}>Year</label>
            <select
              id={`${prefix}-year`}
              value={filters.year}
              onChange={(e) => filters.setYear(e.target.value)}
            >
              <option value="">Any year</option>
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <div className="control">
            <label htmlFor={`${prefix}-genre`}>Genre</label>
            <select
              id={`${prefix}-genre`}
              value={filters.genre}
              onChange={(e) => filters.setGenre(e.target.value)}
            >
              <option value="">Any genre</option>
              {genreList.map((genre) => (
                <option key={genre} value={genre}>
                  {genre}
                </option>
              ))}
            </select>
          </div>

          {kind === 'movies' && audioLangs.length > 0 && (
            <div className="control">
              <label htmlFor={`${prefix}-audio`}>Ses dili</label>
              <select
                id={`${prefix}-audio`}
                value={filters.audioLang}
                onChange={(e) => filters.setAudioLang(e.target.value)}
              >
                <option value="">Any language</option>
                {audioLangs.map((code) => (
                  <option key={code} value={code}>
                    {langLabel(code)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="control">
            <label htmlFor={`${prefix}-director`}>Director</label>
            <input
              id={`${prefix}-director`}
              list={`${prefix}-directors`}
              value={filters.director}
              onChange={(e) => filters.setDirector(e.target.value)}
              placeholder="Any director"
            />
            <datalist id={`${prefix}-directors`}>
              {directorList.map((director) => (
                <option key={director} value={director} />
              ))}
            </datalist>
          </div>

          <div className="control">
            <label htmlFor={`${prefix}-actor`}>Actor</label>
            <input
              id={`${prefix}-actor`}
              list={`${prefix}-actors`}
              value={filters.actor}
              onChange={(e) => filters.setActor(e.target.value)}
              placeholder="Any actor"
            />
            <datalist id={`${prefix}-actors`}>
              {actorList.map((actor) => (
                <option key={actor} value={actor} />
              ))}
            </datalist>
          </div>

          <div className="control control-wide">
            <label htmlFor={`${prefix}-subtitled`}>Altyazılı</label>
            <label className="checkbox-inline">
              <input
                id={`${prefix}-subtitled`}
                type="checkbox"
                checked={filters.subtitled === '1'}
                onChange={(e) =>
                  filters.setSubtitled(e.target.checked ? '1' : '')
                }
              />
              <span>Sadece altyazılı</span>
            </label>
          </div>

          <fieldset className="filter-range">
            <legend>TMDB</legend>
            <div className="control">
              <label htmlFor={`${prefix}-min-rating`}>TMDB min</label>
              <input
                id={`${prefix}-min-rating`}
                type="number"
                min={options?.ratingRange.min ?? 0}
                max={options?.ratingRange.max ?? 10}
                step="0.1"
                value={filters.minRating}
                onChange={(e) => filters.setMinRating(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="control">
              <label htmlFor={`${prefix}-max-rating`}>TMDB max</label>
              <input
                id={`${prefix}-max-rating`}
                type="number"
                min={options?.ratingRange.min ?? 0}
                max={options?.ratingRange.max ?? 10}
                step="0.1"
                value={filters.maxRating}
                onChange={(e) => filters.setMaxRating(e.target.value)}
                placeholder="10"
              />
            </div>
          </fieldset>

          <fieldset className="filter-range">
            <legend>IMDb</legend>
            <div className="control">
              <label htmlFor={`${prefix}-min-imdb`}>IMDB min</label>
              <input
                id={`${prefix}-min-imdb`}
                type="number"
                min={options?.imdbScoreRange.min ?? 0}
                max={options?.imdbScoreRange.max ?? 10}
                step="0.1"
                value={filters.minImdbScore}
                onChange={(e) => filters.setMinImdbScore(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="control">
              <label htmlFor={`${prefix}-max-imdb`}>IMDB max</label>
              <input
                id={`${prefix}-max-imdb`}
                type="number"
                min={options?.imdbScoreRange.min ?? 0}
                max={options?.imdbScoreRange.max ?? 10}
                step="0.1"
                value={filters.maxImdbScore}
                onChange={(e) => filters.setMaxImdbScore(e.target.value)}
                placeholder="10"
              />
            </div>
          </fieldset>

          {loading && <p className="count-note">Loading filter options…</p>}
        </form>

        <footer className="filter-panel-foot">
          <button
            type="button"
            className="secondary"
            onClick={filters.clear}
            disabled={activeCount === 0 && !filters.active}
          >
            Clear all
          </button>
          <button type="button" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
