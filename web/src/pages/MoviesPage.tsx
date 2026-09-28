import { Link } from 'react-router-dom';
import {
  useMovieFilterOptions,
  useMovieGroups,
  useMovies,
  usePlaylistMeta,
} from '../api/hooks';
import { CatalogFilterBar } from '../components/CatalogFilterBar';
import { CatalogResults, type CatalogRow } from '../components/CatalogResults';
import { CatalogToolbar } from '../components/CatalogToolbar';
import {
  sortGroups,
  useCatalogFilters,
  useCatalogView,
  useDebouncedValue,
} from '../catalog';

const PAGE_SIZE = 60;

function toOptionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function MoviesPage() {
  const filters = useCatalogFilters();
  const [view, setView] = useCatalogView();
  // Debounce the free-text search so we fetch once the user pauses, not on
  // every keystroke.
  const debouncedQuery = useDebouncedValue(filters.query, 300);

  const filterOptions = useMovieFilterOptions();
  // Which categories this viewer may see is settled by their profile on the
  // server; the listing simply shows what comes back.
  const moviesQuery = useMovies({
    query: debouncedQuery || undefined,
    group: filters.group || undefined,
    year: toOptionalNumber(filters.year),
    genre: filters.genre || undefined,
    actor: filters.actor || undefined,
    director: filters.director || undefined,
    minRating: toOptionalNumber(filters.minRating),
    maxRating: toOptionalNumber(filters.maxRating),
    minImdbScore: toOptionalNumber(filters.minImdbScore),
    maxImdbScore: toOptionalNumber(filters.maxImdbScore),
    audioLang: filters.audioLang || undefined,
    subtitled: filters.subtitled || undefined,
    sort: filters.sort || undefined,
    page: filters.page,
    limit: PAGE_SIZE,
  });
  const groupsQuery = useMovieGroups();
  const meta = usePlaylistMeta();

  const items = moviesQuery.data?.items ?? [];
  const total = moviesQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showingFrom = total === 0 ? 0 : (filters.page - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(filters.page * PAGE_SIZE, total);
  const rows: CatalogRow[] = items.map((m) => ({
    id: m.id,
    title: m.name,
    to: `/movies/${encodeURIComponent(m.id)}`,
    poster: m.logo ?? m.metadata?.posterUrl,
    group: m.group,
    year: m.metadata?.year,
    rating: m.metadata?.rating,
    imdbScore: m.metadata?.imdbScore,
    genres: m.metadata?.genres.map((g) => g.genreName),
  }));

  const hasMovies = (meta.data?.movieCount ?? 0) > 0;

  return (
    <section>
      <h1>Movies</h1>

      {!hasMovies && !meta.isLoading && (
        <p role="status" className="empty-hint">
          No movies loaded. Connect an Xtream account on the{' '}
          <Link to="/import">Import</Link> page.
        </p>
      )}

      <CatalogFilterBar
        kind="movies"
        groups={sortGroups(groupsQuery.data)}
        filters={filters}
        options={filterOptions.data}
        loading={filterOptions.isLoading}
      />

      {moviesQuery.isError ? (
        <p role="alert" className="error">
          Failed to load movies.
        </p>
      ) : (
        <>
          <CatalogToolbar
            idPrefix="movie"
            sort={filters.sort}
            onSortChange={filters.setSort}
            view={view}
            onViewChange={setView}
            page={filters.page}
            pageCount={pageCount}
            total={total}
            showingFrom={showingFrom}
            showingTo={showingTo}
            onPageChange={filters.setPage}
            busy={moviesQuery.isFetching}
          />
          {moviesQuery.isLoading ? (
            <p role="status">Loading movies…</p>
          ) : items.length === 0 ? (
            <p role="status">No movies match your search.</p>
          ) : (
            <CatalogResults rows={rows} view={view} label="Movies" />
          )}
        </>
      )}
    </section>
  );
}
