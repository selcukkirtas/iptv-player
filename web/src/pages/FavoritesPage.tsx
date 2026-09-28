import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFavorites, useRemoveFavorite } from '../api/hooks';
import { useGridNavigation } from '../components/useGridNavigation';

export function FavoritesPage() {
  const favoritesQuery = useFavorites();
  const removeFavorite = useRemoveFavorite();
  const onGridKeyDown = useGridNavigation<HTMLUListElement>();
  const [query, setQuery] = useState('');

  const items = useMemo(() => {
    const all = favoritesQuery.data ?? [];
    if (!query) return all;
    const q = query.toLowerCase();
    return all.filter((f) => f.channel.name.toLowerCase().includes(q));
  }, [favoritesQuery.data, query]);

  if (favoritesQuery.isLoading) {
    return <p role="status">Loading favorites…</p>;
  }
  if (favoritesQuery.isError) {
    return (
      <p role="alert" className="error">
        Failed to load favorites.
      </p>
    );
  }

  const favorites = favoritesQuery.data ?? [];

  return (
    <section>
      <h1>Favorites</h1>

      {favorites.length === 0 ? (
        <p role="status" className="empty-hint">
          No favorites yet. Star a channel on the <Link to="/">Channels</Link>{' '}
          page.
        </p>
      ) : (
        <>
          <form
            className="controls"
            role="search"
            onSubmit={(e) => e.preventDefault()}
          >
            <div className="control">
              <label htmlFor="fav-search">Search favorites</label>
              <input
                id="fav-search"
                type="text"
                placeholder="Search favorites…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </form>

          {items.length === 0 ? (
            <p role="status">No favorites match your search.</p>
          ) : (
            <ul
              className="channel-grid"
              aria-label="Favorite channels"
              onKeyDown={onGridKeyDown}
            >
              {items.map((fav) => (
                <li key={fav.channelId} className="channel-card">
                  <Link
                    to={`/watch/${encodeURIComponent(fav.channelId)}`}
                    className="channel-link"
                    data-nav
                  >
                    {fav.channel.logo ? (
                      <img
                        src={fav.channel.logo}
                        alt=""
                        className="channel-logo"
                        loading="lazy"
                      />
                    ) : (
                      <div
                        className="channel-logo placeholder"
                        aria-hidden="true"
                      >
                        📺
                      </div>
                    )}
                    <span className="channel-name">{fav.channel.name}</span>
                  </Link>
                  <button
                    type="button"
                    className="fav-button"
                    aria-label={`Remove ${fav.channel.name} from favorites`}
                    disabled={
                      removeFavorite.isPending &&
                      removeFavorite.variables === fav.channelId
                    }
                    onClick={() => removeFavorite.mutate(fav.channelId)}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
