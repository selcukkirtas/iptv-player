import { Link } from 'react-router-dom';
import { PosterGrid, type PosterItem } from './PosterGrid';

export type CatalogView = 'grid' | 'table';

export interface CatalogRow {
  id: string;
  title: string;
  to: string;
  poster?: string;
  group?: string;
  year?: number;
  rating?: number;
  imdbScore?: number;
  genres?: string[];
}

function fmtRating(v?: number | null): string {
  return v == null ? '–' : v.toFixed(1);
}

/** Renders catalog results either as a poster grid or a compact metadata table. */
export function CatalogResults({
  rows,
  view,
  label,
}: {
  rows: CatalogRow[];
  view: CatalogView;
  label: string;
}) {
  if (view === 'grid') {
    const posters: PosterItem[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      poster: r.poster,
      subtitle: r.group,
      to: r.to,
    }));
    return <PosterGrid items={posters} label={label} />;
  }

  return (
    <div className="db-table-wrap">
      <table className="db-table" aria-label={label}>
        <thead>
          <tr>
            <th className="col-poster"></th>
            <th>Title</th>
            <th>Year</th>
            <th>TMDB</th>
            <th>IMDb</th>
            <th>Genres</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="col-poster">
                {r.poster ? (
                  <img
                    src={r.poster}
                    alt=""
                    loading="lazy"
                    className="db-poster"
                  />
                ) : (
                  <div className="db-poster db-poster-empty">🎬</div>
                )}
              </td>
              <td className="db-title-cell">
                <Link to={r.to}>{r.title}</Link>
                {r.group ? <div className="db-sub">{r.group}</div> : null}
              </td>
              <td>{r.year ?? '–'}</td>
              <td>{fmtRating(r.rating)}</td>
              <td>{fmtRating(r.imdbScore)}</td>
              <td className="db-genres">
                {(r.genres ?? []).map((g) => (
                  <span key={g} className="db-genre-pill">
                    {g}
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
