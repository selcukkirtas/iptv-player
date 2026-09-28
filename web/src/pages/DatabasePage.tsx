import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useGroupedMovies,
  useGroupedSeries,
  useMetadataGenres,
  useMetadataStats,
  useMovieFilterOptions,
} from '../api/hooks';
import { langLabel } from '../catalog';
import type {
  GroupedMovieRow,
  GroupedSeriesRow,
  MetadataBrowseParams,
} from '../api/types';

type Tab = 'movies' | 'series';
const PAGE_SIZE = 50;

function toOptionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function fmtRating(v?: number): string {
  return v === undefined ? '–' : v.toFixed(1);
}

export function DatabasePage() {
  const [tab, setTab] = useState<Tab>('movies');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [genre, setGenre] = useState('');
  const [year, setYear] = useState('');
  const [minRating, setMinRating] = useState('');
  const [director, setDirector] = useState('');
  const [actor, setActor] = useState('');
  const [debouncedDirector, setDebouncedDirector] = useState('');
  const [debouncedActor, setDebouncedActor] = useState('');
  const [audioLang, setAudioLang] = useState('');
  const [subtitled, setSubtitled] = useState(false);
  const [sort, setSort] = useState<'rating' | 'title' | 'year'>('rating');
  const [page, setPage] = useState(1);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // Debounce the free-text search inputs so we don't fire per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedDirector(director.trim()), 300);
    return () => clearTimeout(t);
  }, [director]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedActor(actor.trim()), 300);
    return () => clearTimeout(t);
  }, [actor]);

  // Any filter/tab/page change collapses the open versions panel.
  useEffect(() => {
    setExpandedKey(null);
  }, [tab, debounced, genre, year, minRating, sort, page]);

  // Any filter/tab change resets to the first page.
  useEffect(() => {
    setPage(1);
  }, [
    tab,
    debounced,
    genre,
    year,
    minRating,
    debouncedDirector,
    debouncedActor,
    audioLang,
    subtitled,
    sort,
  ]);

  // Genre/audio reset when switching tabs (movie vs series lists differ; audio
  // is movies-only).
  useEffect(() => {
    setGenre('');
    setAudioLang('');
  }, [tab]);

  const params: MetadataBrowseParams = useMemo(
    () => ({
      query: debounced || undefined,
      genre: genre || undefined,
      year: toOptionalNumber(year),
      minRating: toOptionalNumber(minRating),
      director: debouncedDirector || undefined,
      actor: debouncedActor || undefined,
      audioLang: tab === 'movies' ? audioLang || undefined : undefined,
      subtitled: subtitled ? '1' : undefined,
      sort,
      page,
      limit: PAGE_SIZE,
    }),
    [
      tab,
      debounced,
      genre,
      year,
      minRating,
      debouncedDirector,
      debouncedActor,
      audioLang,
      subtitled,
      sort,
      page,
    ],
  );

  const stats = useMetadataStats();
  const genres = useMetadataGenres(tab === 'movies' ? 'movie' : 'series');
  const movieFilterOptions = useMovieFilterOptions();
  const audioLangs = movieFilterOptions.data?.audioLangs ?? [];
  const moviesQuery = useGroupedMovies(params);
  const seriesQuery = useGroupedSeries(params);
  const active = tab === 'movies' ? moviesQuery : seriesQuery;

  const total = active.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showingFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(page * PAGE_SIZE, total);

  return (
    <section>
      <h1>Database</h1>
      <p className="db-stats" role="status">
        Enriched metadata in local DB:{' '}
        <strong>{(stats.data?.movies ?? 0).toLocaleString()}</strong> movie
        versions, <strong>{(stats.data?.series ?? 0).toLocaleString()}</strong>{' '}
        series versions
        {stats.isFetching ? ' · refreshing…' : ''}
      </p>

      <div className="db-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'movies'}
          className={tab === 'movies' ? 'db-tab active' : 'db-tab'}
          onClick={() => setTab('movies')}
        >
          Movies
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'series'}
          className={tab === 'series' ? 'db-tab active' : 'db-tab'}
          onClick={() => setTab('series')}
        >
          Series
        </button>
      </div>

      <div className="controls">
        <div className="control">
          <label htmlFor="db-search">Search title</label>
          <input
            id="db-search"
            type="search"
            placeholder="e.g. Inception"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="control">
          <label htmlFor="db-genre">Genre</label>
          <select
            id="db-genre"
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
          >
            <option value="">All genres</option>
            {(genres.data ?? []).map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        <div className="control">
          <label htmlFor="db-year">Year</label>
          <input
            id="db-year"
            type="number"
            placeholder="Any"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </div>
        <div className="control">
          <label htmlFor="db-minrating">Min rating</label>
          <input
            id="db-minrating"
            type="number"
            step="0.5"
            min="0"
            max="10"
            placeholder="0–10"
            value={minRating}
            onChange={(e) => setMinRating(e.target.value)}
          />
        </div>
        <div className="control">
          <label htmlFor="db-director">Director</label>
          <input
            id="db-director"
            type="text"
            placeholder="Any director"
            value={director}
            onChange={(e) => setDirector(e.target.value)}
          />
        </div>
        <div className="control">
          <label htmlFor="db-actor">Actor</label>
          <input
            id="db-actor"
            type="text"
            placeholder="Any actor"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
          />
        </div>
        {tab === 'movies' && audioLangs.length > 0 && (
          <div className="control">
            <label htmlFor="db-audio">Ses dili</label>
            <select
              id="db-audio"
              value={audioLang}
              onChange={(e) => setAudioLang(e.target.value)}
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
          <label htmlFor="db-subtitled">Altyazılı</label>
          <label className="checkbox-inline">
            <input
              id="db-subtitled"
              type="checkbox"
              checked={subtitled}
              onChange={(e) => setSubtitled(e.target.checked)}
            />
            <span>Sadece altyazılı</span>
          </label>
        </div>
        <div className="control">
          <label htmlFor="db-sort">Sort by</label>
          <select
            id="db-sort"
            value={sort}
            onChange={(e) =>
              setSort(e.target.value as 'rating' | 'title' | 'year')
            }
          >
            <option value="rating">Rating (high→low)</option>
            <option value="title">Title (A→Z)</option>
            <option value="year">Year (new→old)</option>
          </select>
        </div>
      </div>

      {active.isLoading ? (
        <p role="status">Loading…</p>
      ) : active.isError ? (
        <p role="alert" className="error">
          Failed to load metadata.
        </p>
      ) : total === 0 ? (
        <p role="status">No records match your filters.</p>
      ) : (
        <>
          <p className="count-note" role="status">
            {tab === 'movies' ? 'Unique titles ' : ''}
            {showingFrom.toLocaleString()}–{showingTo.toLocaleString()} of{' '}
            {total.toLocaleString()}
          </p>
          <div className="db-table-wrap">
            {tab === 'movies' ? (
              <table className="db-table">
                <thead>
                  <tr>
                    <th className="col-poster"></th>
                    <th>Title</th>
                    <th>Year</th>
                    <th>TMDB</th>
                    <th>IMDb</th>
                    <th>Genres</th>
                    <th>Versions</th>
                  </tr>
                </thead>
                <tbody>
                  {(moviesQuery.data?.items ?? []).map((m) => (
                    <MovieGroupRows
                      key={m.key}
                      group={m}
                      expanded={expandedKey === m.key}
                      onToggle={() =>
                        setExpandedKey((k) => (k === m.key ? null : m.key))
                      }
                    />
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="db-table">
                <thead>
                  <tr>
                    <th className="col-poster"></th>
                    <th>Title</th>
                    <th>Years</th>
                    <th>TMDB</th>
                    <th>IMDb</th>
                    <th>Status</th>
                    <th>Genres</th>
                    <th>Versions</th>
                  </tr>
                </thead>
                <tbody>
                  {(seriesQuery.data?.items ?? []).map((s) => (
                    <SeriesGroupRows
                      key={s.key}
                      group={s}
                      expanded={expandedKey === s.key}
                      onToggle={() =>
                        setExpandedKey((k) => (k === s.key ? null : s.key))
                      }
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="db-pager">
            <button
              type="button"
              className="secondary"
              disabled={page <= 1 || active.isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ‹ Prev
            </button>
            <span className="count-note">
              Page {page} / {pageCount}
              {active.isFetching ? ' · loading…' : ''}
            </span>
            <button
              type="button"
              className="secondary"
              disabled={page >= pageCount || active.isFetching}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              Next ›
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/** A deduplicated movie row plus, when expanded, its playable versions. */
function MovieGroupRows({
  group,
  expanded,
  onToggle,
}: {
  group: GroupedMovieRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className={expanded ? 'db-group-row open' : 'db-group-row'}
        onClick={onToggle}
      >
        <td className="col-poster">
          {group.posterUrl ? (
            <img
              src={group.posterUrl}
              alt=""
              loading="lazy"
              className="db-poster"
            />
          ) : (
            <div className="db-poster db-poster-empty">🎬</div>
          )}
        </td>
        <td className="db-title-cell">
          {group.imdbId ? (
            <a
              href={`https://www.imdb.com/title/${group.imdbId}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              {group.title}
            </a>
          ) : (
            group.title
          )}
          {group.tmdbTitle && group.tmdbTitle !== group.title ? (
            <div className="db-sub">{group.tmdbTitle}</div>
          ) : null}
        </td>
        <td>{group.year ?? '–'}</td>
        <td>{fmtRating(group.rating)}</td>
        <td>{fmtRating(group.imdbScore)}</td>
        <td className="db-genres">
          {group.genres.map((g) => (
            <span key={g} className="db-genre-pill">
              {g}
            </span>
          ))}
        </td>
        <td>
          <span className="db-version-badge">
            {expanded ? '▾' : '▸'} {group.versionCount}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr className="db-versions-row">
          <td colSpan={7}>
            <ul className="db-versions">
              {group.versions.map((v) => (
                <li key={v.movieId} className="db-version">
                  <span className="db-version-name">{v.name}</span>
                  {v.group ? (
                    <span className="db-genre-pill">{v.group}</span>
                  ) : null}
                  <Link
                    className="db-watch-btn"
                    to={`/movies/${encodeURIComponent(v.movieId)}`}
                  >
                    ▶ Watch
                  </Link>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}

/** A deduplicated series row plus, when expanded, its provider versions. */
function SeriesGroupRows({
  group,
  expanded,
  onToggle,
}: {
  group: GroupedSeriesRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className={expanded ? 'db-group-row open' : 'db-group-row'}
        onClick={onToggle}
      >
        <td className="col-poster">
          {group.posterUrl ? (
            <img
              src={group.posterUrl}
              alt=""
              loading="lazy"
              className="db-poster"
            />
          ) : (
            <div className="db-poster db-poster-empty">📺</div>
          )}
        </td>
        <td className="db-title-cell">
          {group.imdbId ? (
            <a
              href={`https://www.imdb.com/title/${group.imdbId}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              {group.title}
            </a>
          ) : (
            group.title
          )}
          {group.tmdbTitle && group.tmdbTitle !== group.title ? (
            <div className="db-sub">{group.tmdbTitle}</div>
          ) : null}
        </td>
        <td>
          {group.yearStart ?? '–'}
          {group.yearEnd && group.yearEnd !== group.yearStart
            ? `–${group.yearEnd}`
            : ''}
        </td>
        <td>{fmtRating(group.rating)}</td>
        <td>{fmtRating(group.imdbScore)}</td>
        <td>{group.status ?? '–'}</td>
        <td className="db-genres">
          {group.genres.map((g) => (
            <span key={g} className="db-genre-pill">
              {g}
            </span>
          ))}
        </td>
        <td>
          <span className="db-version-badge">
            {expanded ? '▾' : '▸'} {group.versionCount}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr className="db-versions-row">
          <td colSpan={8}>
            <ul className="db-versions">
              {group.versions.map((v) => (
                <li key={v.seriesId} className="db-version">
                  <span className="db-version-name">{v.name}</span>
                  {v.group ? (
                    <span className="db-genre-pill">{v.group}</span>
                  ) : null}
                  <Link
                    className="db-watch-btn"
                    to={`/series/${encodeURIComponent(v.seriesId)}`}
                  >
                    ▶ Open
                  </Link>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}
