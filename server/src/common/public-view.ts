import { Channel, FavoriteItem } from '../types/channel.types';
import {
  Episode,
  Movie,
  SeriesDetailWithMetadata,
  SeriesSeason,
} from '../types/catalog.types';

/**
 * Strips upstream URLs out of anything sent to a browser.
 *
 * Provider stream URLs embed the account's username and password
 * (`/movie/<user>/<pass>/<id>.mkv`). They used to be handed to every device on
 * the LAN so the player could fetch them; since playback now goes through
 * catalog references, nothing client-side needs them — and shipping them would
 * hand the subscription to anyone who opens devtools.
 */
export type Public<T> = Omit<T, 'url'>;

function omitUrl<T extends { url: string }>(value: T): Public<T> {
  const copy: Record<string, unknown> = { ...value };
  delete copy.url;
  return copy as Public<T>;
}

export function publicChannel(channel: Channel): Public<Channel> {
  return omitUrl(channel);
}

export function publicMovie<T extends Movie>(movie: T): Public<T> {
  return omitUrl(movie);
}

export function publicEpisode(episode: Episode): Public<Episode> {
  return omitUrl(episode);
}

export function publicSeason(season: SeriesSeason) {
  return { ...season, episodes: season.episodes.map(publicEpisode) };
}

export function publicSeriesDetail(detail: SeriesDetailWithMetadata) {
  return { ...detail, seasons: detail.seasons.map(publicSeason) };
}

export function publicFavorite(item: FavoriteItem) {
  return { ...item, channel: publicChannel(item.channel) };
}
