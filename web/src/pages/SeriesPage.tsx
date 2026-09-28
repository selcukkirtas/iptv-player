import { Link } from 'react-router-dom';
import {
  usePlaylistMeta,
  useSeriesFilterOptions,
  useSeriesGroups,
  useSeriesList,
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

export function SeriesPage() {
  const filters = useCatalogFilters();
  const [view, setView] = useCatalogView();

  // Debounce the free-text search so we fetch once the user pauses typing.
  const debouncedQuery = useDebouncedValue(filters.query, 300);

  const seriesQuery = useSeriesList({
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
    subtitled: filters.subtitled || undefined,
    sort: filters.sort || undefined,
    page: filters.page,
    limit: PAGE_SIZE,
  });
  const groupsQuery = useSeriesGroups();
  const filterOptions = useSeriesFilterOptions();
  const meta = usePlaylistMeta();

  const items = seriesQuery.data?.items ?? [];
  const total = seriesQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showingFrom = total === 0 ? 0 : (filters.page - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(filters.page * PAGE_SIZE, total);
  const rows: CatalogRow[] = items.map((s) => ({
    id: s.id,
    title: s.name,
    to: `/series/${encodeURIComponent(s.id)}`,
    poster: s.cover ?? s.metadata?.posterUrl,
    group: s.group,
    year: s.metadata?.yearStart,
    rating: s.metadata?.rating,
    imdbScore: s.metadata?.imdbScore,
    genres: s.metadata?.genres.map((g) => g.genreName),
  }));

  const hasSeries = (meta.data?.seriesCount ?? 0) > 0;

  return (
    <section>
      <h1>Series</h1>

      {!hasSeries && !meta.isLoading && (
        <p role="status" className="empty-hint">
          No series loaded. Connect an Xtream account on the{' '}
          <Link to="/import">Import</Link> page.
        </p>
      )}

      <CatalogFilterBar
        kind="series"
        groups={sortGroups(groupsQuery.data)}
        filters={filters}
        options={filterOptions.data}
        loading={filterOptions.isLoading}
      />

      {seriesQuery.isError ? (
        <p role="alert" className="error">
          Failed to load series.
        </p>
      ) : (
        <>
          <CatalogToolbar
            idPrefix="series"
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
            busy={seriesQuery.isFetching}
          />
          {seriesQuery.isLoading ? (
            <p role="status">Loading series…</p>
          ) : items.length === 0 ? (
            <p role="status">No series match your search.</p>
          ) : (
            <CatalogResults rows={rows} view={view} label="Series" />
          )}
        </>
      )}
    </section>
  );
}
