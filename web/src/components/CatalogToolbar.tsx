import type { CatalogView } from './CatalogResults';

/** Sort dropdown + grid/table view toggle + pagination for catalog pages. */
export function CatalogToolbar({
  sort,
  onSortChange,
  view,
  onViewChange,
  page,
  pageCount,
  total,
  showingFrom,
  showingTo,
  onPageChange,
  busy,
  idPrefix,
}: {
  sort: string;
  onSortChange: (value: string) => void;
  view: CatalogView;
  onViewChange: (value: CatalogView) => void;
  page: number;
  pageCount: number;
  total: number;
  showingFrom: number;
  showingTo: number;
  onPageChange: (page: number) => void;
  busy?: boolean;
  idPrefix: string;
}) {
  return (
    <div className="catalog-toolbar">
      <div className="control">
        <label htmlFor={`${idPrefix}-sort`}>Sort by</label>
        <select
          id={`${idPrefix}-sort`}
          value={sort}
          onChange={(e) => onSortChange(e.target.value)}
        >
          <option value="">Default order</option>
          <option value="rating">Rating (high→low)</option>
          <option value="year">Year (new→old)</option>
          <option value="title">Title (A→Z)</option>
          <option value="title_desc">Title (Z→A)</option>
        </select>
      </div>

      <div className="control">
        <span className="control-label">View</span>
        <div className="view-toggle" role="group" aria-label="View mode">
          <button
            type="button"
            className={view === 'grid' ? 'active' : ''}
            aria-pressed={view === 'grid'}
            onClick={() => onViewChange('grid')}
          >
            ▦ Grid
          </button>
          <button
            type="button"
            className={view === 'table' ? 'active' : ''}
            aria-pressed={view === 'table'}
            onClick={() => onViewChange('table')}
          >
            ☰ Table
          </button>
        </div>
      </div>

      <div className="toolbar-pager">
        <span className="count-note">
          {total === 0
            ? 'No results'
            : `${showingFrom.toLocaleString()}–${showingTo.toLocaleString()} of ${total.toLocaleString()}`}
        </span>
        <button
          type="button"
          className="secondary btn-sm"
          disabled={page <= 1 || busy}
          onClick={() => onPageChange(page - 1)}
        >
          ‹ Prev
        </button>
        <span className="count-note">
          {page} / {pageCount}
        </span>
        <button
          type="button"
          className="secondary btn-sm"
          disabled={page >= pageCount || busy}
          onClick={() => onPageChange(page + 1)}
        >
          Next ›
        </button>
      </div>
    </div>
  );
}
