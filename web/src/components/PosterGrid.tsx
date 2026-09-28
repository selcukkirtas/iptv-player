import { Link } from 'react-router-dom';
import { useGridNavigation } from './useGridNavigation';

export interface PosterItem {
  id: string;
  title: string;
  poster?: string;
  subtitle?: string;
  to: string;
}

export function PosterGrid({
  items,
  label,
}: {
  items: PosterItem[];
  label: string;
}) {
  const onKeyDown = useGridNavigation<HTMLUListElement>();
  return (
    <ul className="poster-grid" aria-label={label} onKeyDown={onKeyDown}>
      {items.map((item) => (
        <li key={item.id} className="poster-card">
          <Link to={item.to} className="poster-link" data-nav>
            {item.poster ? (
              <img src={item.poster} alt="" className="poster" loading="lazy" />
            ) : (
              <div className="poster placeholder" aria-hidden="true">
                🎬
              </div>
            )}
            <span className="poster-title">{item.title}</span>
            {item.subtitle && (
              <span className="poster-sub">{item.subtitle}</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
