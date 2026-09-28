import { useEffect } from 'react';
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import {
  useAddFavorite,
  useChannel,
  useChannels,
  useFavorites,
  useRemoveFavorite,
} from '../api/hooks';
import type { Channel } from '../api/types';
import { channelSource } from '../api/types';
import { VideoPlayer } from '../components/VideoPlayer';

export function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const channelQuery = useChannel(id);
  const channel = channelQuery.data;

  // Siblings for prev/next zapping. If we arrived from a filtered channel list
  // (group / search carried in the URL) we walk exactly that filtered list;
  // otherwise we fall back to this channel's own category.
  const ctxGroup = params.get('group') ?? undefined;
  const ctxQuery = params.get('q') ?? undefined;
  const hasContext = ctxGroup !== undefined || ctxQuery !== undefined;
  const siblingsQuery = useChannels(
    hasContext
      ? { query: ctxQuery, group: ctxGroup }
      : { group: channel?.group || undefined },
    Boolean(channel),
  );
  const favoritesQuery = useFavorites();
  const addFavorite = useAddFavorite();
  const removeFavorite = useRemoveFavorite();

  // The server already scoped this list to the profile, so prev/next zaps
  // through exactly what the channel list showed.
  const siblings = siblingsQuery.data?.items ?? [];
  const navSearch = params.toString();
  const idx = channel ? siblings.findIndex((c) => c.id === channel.id) : -1;
  const prev = idx > 0 ? siblings[idx - 1] : undefined;
  const next =
    idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : undefined;

  // Zap with the keyboard / TV remote D-pad: Up = previous channel, Down = next.
  // A TV remote's directional pad arrives as the same Arrow* keydown events
  // (older smart-TV browsers report only `keyCode`, so we accept both). Works in
  // fullscreen too — zapping replaces the route in place, so the player element
  // stays mounted and the fullscreen session is preserved.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack arrows while a control (e.g. the volume slider) is focused.
      const tag = (document.activeElement?.tagName ?? '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const up = e.key === 'ArrowUp' || e.keyCode === 38;
      const down = e.key === 'ArrowDown' || e.keyCode === 40;
      const target = up ? prev : down ? next : undefined;
      if (!up && !down) return;
      // Swallow the key even at a list edge so the page doesn't scroll instead.
      e.preventDefault();
      if (!target) return;
      navigate(
        {
          pathname: `/watch/${encodeURIComponent(target.id)}`,
          search: navSearch ? `?${navSearch}` : '',
        },
        { replace: true },
      );
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, navSearch, navigate]);

  if (channelQuery.isLoading) {
    return <p role="status">Loading channel…</p>;
  }
  if (channelQuery.isError || !channel) {
    return (
      <section>
        <p role="alert" className="error">
          Channel not found.
        </p>
        <Link to="/">← Back to channels</Link>
      </section>
    );
  }

  const isFavorite = Boolean(
    favoritesQuery.data?.some((f) => f.channelId === channel.id),
  );
  const pending = addFavorite.isPending || removeFavorite.isPending;

  return (
    <section className="watch">
      <Link to="/" className="back-link">
        ← Back to channels
      </Link>

      <VideoPlayer src={channelSource(channel.id)} live />

      <nav className="channel-nav" aria-label="Channel navigation">
        <ChannelNavButton channel={prev} direction="prev" search={navSearch} />
        <span className="channel-nav-pos">
          {idx >= 0 ? `${idx + 1} / ${siblings.length}` : ''}
        </span>
        <ChannelNavButton channel={next} direction="next" search={navSearch} />
      </nav>

      <div className="watch-info">
        <h1>{channel.name}</h1>
        {channel.group && <p className="channel-group">{channel.group}</p>}
        <button
          type="button"
          className="fav-button-text"
          disabled={pending}
          aria-pressed={isFavorite}
          onClick={() =>
            isFavorite
              ? removeFavorite.mutate(channel.id)
              : addFavorite.mutate(channel.id)
          }
        >
          {isFavorite ? '★ Remove from favorites' : '☆ Add to favorites'}
        </button>
      </div>
    </section>
  );
}

function ChannelNavButton({
  channel,
  direction,
  search,
}: {
  channel: Channel | undefined;
  direction: 'prev' | 'next';
  search: string;
}) {
  const isPrev = direction === 'prev';
  const arrow = isPrev ? '‹' : '›';
  if (!channel) {
    return (
      <span className="next-button channel-nav-btn is-disabled" aria-hidden>
        {isPrev ? `${arrow} Previous` : `Next ${arrow}`}
      </span>
    );
  }
  return (
    <Link
      to={{
        pathname: `/watch/${encodeURIComponent(channel.id)}`,
        search: search ? `?${search}` : '',
      }}
      replace
      className="next-button channel-nav-btn"
      aria-label={`${isPrev ? 'Previous' : 'Next'} channel: ${channel.name}`}
    >
      {isPrev && <span className="channel-nav-arrow">{arrow}</span>}
      <span className="channel-nav-label">{channel.name}</span>
      {!isPrev && <span className="channel-nav-arrow">{arrow}</span>}
    </Link>
  );
}
