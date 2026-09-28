import { Link } from 'react-router-dom';
import { useProgress, useRemoveProgress } from '../api/hooks';
import type { ProgressItem } from '../api/types';

export function ContinueWatchingPage() {
  const progressQuery = useProgress();
  const removeProgress = useRemoveProgress();

  if (progressQuery.isLoading) {
    return <p role="status">Loading…</p>;
  }
  if (progressQuery.isError) {
    return (
      <p role="alert" className="error">
        Failed to load your progress.
      </p>
    );
  }

  const items = progressQuery.data ?? [];

  return (
    <section>
      <h1>Continue Watching</h1>

      {items.length === 0 ? (
        <p role="status" className="empty-hint">
          Nothing in progress yet. Start a movie or episode and it will appear
          here so you can pick up where you left off.
        </p>
      ) : (
        <ul className="poster-grid" aria-label="Continue watching">
          {items.map((item) => (
            <li key={`${item.kind}-${item.id}`} className="poster-card">
              <Link to={resumeTo(item)} className="poster-link" data-nav>
                {item.poster ? (
                  <img
                    src={item.poster}
                    alt=""
                    className="poster"
                    loading="lazy"
                  />
                ) : (
                  <div className="poster placeholder" aria-hidden="true">
                    🎬
                  </div>
                )}
                <span className="poster-title">{item.title}</span>
                {item.kind === 'episode' && (
                  <span className="poster-sub">
                    {item.seriesName} · S{item.season} E{item.episode}
                  </span>
                )}
                <span className="progress-bar" aria-hidden="true">
                  <span
                    className="progress-fill"
                    style={{ width: `${percent(item)}%` }}
                  />
                </span>
              </Link>
              <button
                type="button"
                className="fav-button"
                aria-label={`Remove ${item.title} from continue watching`}
                disabled={
                  removeProgress.isPending &&
                  removeProgress.variables?.id === item.id
                }
                onClick={() =>
                  removeProgress.mutate({ kind: item.kind, id: item.id })
                }
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function resumeTo(item: ProgressItem): string {
  if (item.kind === 'movie') {
    return `/movies/${encodeURIComponent(item.id)}`;
  }
  return `/series/${encodeURIComponent(item.seriesId ?? '')}?ep=${encodeURIComponent(item.id)}`;
}

function percent(item: ProgressItem): number {
  if (item.duration <= 0) return 0;
  return Math.min(100, Math.round((item.position / item.duration) * 100));
}
