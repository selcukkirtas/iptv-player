import { useMemo } from 'react';
import {
  useAddFavorite,
  useChannels,
  useFavorites,
  useGroups,
  usePlaylistMeta,
  useRemoveFavorite,
} from '../api/hooks';
import { ChannelCard } from '../components/ChannelCard';
import { useGridNavigation } from '../components/useGridNavigation';
import type { Channel } from '../api/types';
import { Link } from 'react-router-dom';
import { sortGroups, useCatalogFilters } from '../catalog';

export function ChannelsPage() {
  const { query, group, setQuery, setGroup, clear, active } =
    useCatalogFilters();
  // Which categories this viewer may see is settled by their profile on the
  // server; the listing simply shows what comes back.
  const channelsQuery = useChannels({
    query: query || undefined,
    group: group || undefined,
  });
  const groupsQuery = useGroups();
  const meta = usePlaylistMeta();
  const favoritesQuery = useFavorites();
  const addFavorite = useAddFavorite();
  const removeFavorite = useRemoveFavorite();
  const onGridKeyDown = useGridNavigation<HTMLUListElement>();

  // Carried to the player so prev/next zaps through this same filtered list.
  const linkSearch = useMemo(() => {
    const qs = new URLSearchParams();
    if (group) qs.set('group', group);
    if (query) qs.set('q', query);
    return qs.toString();
  }, [group, query]);

  const favoriteIds = useMemo(
    () => new Set(favoritesQuery.data?.map((f) => f.channelId)),
    [favoritesQuery.data],
  );

  const pendingId = addFavorite.isPending
    ? addFavorite.variables
    : removeFavorite.isPending
      ? removeFavorite.variables
      : undefined;

  function toggleFavorite(channel: Channel) {
    if (favoriteIds.has(channel.id)) {
      removeFavorite.mutate(channel.id);
    } else {
      addFavorite.mutate(channel.id);
    }
  }

  const channels = channelsQuery.data?.items ?? [];
  const hasPlaylist = (meta.data?.channelCount ?? 0) > 0;

  return (
    <section>
      <h1>Channels</h1>

      {!hasPlaylist && !meta.isLoading && (
        <p role="status" className="empty-hint">
          No playlist loaded yet. <Link to="/import">Import a playlist</Link> to
          get started.
        </p>
      )}

      <form
        className="controls"
        role="search"
        onSubmit={(e) => e.preventDefault()}
      >
        <div className="control">
          <label htmlFor="channel-search">Search</label>
          <input
            id="channel-search"
            type="text"
            placeholder="Search channels…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="control">
          <label htmlFor="channel-group">Category</label>
          <select
            id="channel-group"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          >
            <option value="">All categories</option>
            {sortGroups(groupsQuery.data).map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        {active && (
          <button
            type="button"
            className="secondary btn-sm clear-search"
            onClick={clear}
          >
            Clear
          </button>
        )}
      </form>

      {channelsQuery.isLoading ? (
        <p role="status">Loading channels…</p>
      ) : channelsQuery.isError ? (
        <p role="alert" className="error">
          Failed to load channels. Please try again.
        </p>
      ) : channels.length === 0 ? (
        <p role="status">No channels match your search.</p>
      ) : (
        <>
          {(channelsQuery.data?.total ?? 0) > channels.length && (
            <p role="status" className="count-note">
              Showing first {channels.length} of{' '}
              {channelsQuery.data?.total.toLocaleString()} — refine your search
              or pick a category to narrow results.
            </p>
          )}
          <ul
            className="channel-grid"
            aria-label="Channels"
            onKeyDown={onGridKeyDown}
          >
            {channels.map((channel) => (
              <ChannelCard
                key={channel.id}
                channel={channel}
                isFavorite={favoriteIds.has(channel.id)}
                favoritePending={pendingId === channel.id}
                onToggleFavorite={toggleFavorite}
                linkSearch={linkSearch}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
