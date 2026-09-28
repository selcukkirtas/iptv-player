import { Link } from 'react-router-dom';
import type { Channel } from '../api/types';

interface Props {
  channel: Channel;
  isFavorite: boolean;
  favoritePending?: boolean;
  onToggleFavorite: (channel: Channel) => void;
  /** Current list filter (query string, no leading `?`) carried to the player
   *  so prev/next zaps through the same filtered list. */
  linkSearch?: string;
}

export function ChannelCard({
  channel,
  isFavorite,
  favoritePending,
  onToggleFavorite,
  linkSearch,
}: Props) {
  return (
    <li className="channel-card">
      <Link
        to={{
          pathname: `/watch/${encodeURIComponent(channel.id)}`,
          search: linkSearch ? `?${linkSearch}` : '',
        }}
        className="channel-link"
        data-nav
      >
        {channel.logo ? (
          <img
            src={channel.logo}
            alt=""
            className="channel-logo"
            loading="lazy"
          />
        ) : (
          <div className="channel-logo placeholder" aria-hidden="true">
            📺
          </div>
        )}
        <span className="channel-name">{channel.name}</span>
        {channel.group && (
          <span className="channel-group">{channel.group}</span>
        )}
      </Link>
      <button
        type="button"
        className="fav-button"
        aria-pressed={isFavorite}
        aria-label={
          isFavorite
            ? `Remove ${channel.name} from favorites`
            : `Add ${channel.name} to favorites`
        }
        disabled={favoritePending}
        onClick={() => onToggleFavorite(channel)}
      >
        {isFavorite ? '★' : '☆'}
      </button>
    </li>
  );
}
