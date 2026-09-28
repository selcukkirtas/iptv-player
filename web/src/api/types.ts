export interface Channel {
  id: string;
  name: string;
  logo?: string;
  group?: string;
  tvgId?: string;
  tvgName?: string;
}

export interface PlaylistMeta {
  source: 'url' | 'file' | 'xtream' | 'none';
  url?: string;
  importedAt?: string;
  channelCount: number;
  movieCount?: number;
  seriesCount?: number;
}

export interface XtreamCredentials {
  host: string;
  username: string;
  password: string;
}

export interface FavoriteItem {
  channelId: string;
  addedAt: string;
  channel: Channel;
}

export interface ChannelSearchResult {
  items: Channel[];
  total: number;
}

export interface Movie {
  id: string;
  name: string;
  logo?: string;
  group?: string;
  ext: string;
  rating?: number;
}

export interface MovieMetadata {
  plot?: string;
  year?: number;
  runtime?: number;
  rating?: number;
  imdbScore?: number;
  imdbId?: string;
  posterUrl?: string;
  cast: Array<{ actorName: string; character?: string }>;
  crew: Array<{ personName: string; role: string }>;
  genres: Array<{ genreName: string }>;
}

export interface MovieWithMetadata extends Movie {
  metadata?: MovieMetadata;
}

export interface Series {
  id: string;
  name: string;
  cover?: string;
  group?: string;
  plot?: string;
  genre?: string;
}

export interface SeriesMetadata {
  yearStart?: number;
  yearEnd?: number;
  rating?: number;
  imdbScore?: number;
  imdbId?: string;
  posterUrl?: string;
  cast: Array<{ actorName: string; character?: string }>;
  crew: Array<{ personName: string; role: string }>;
  genres: Array<{ genreName: string }>;
}

export interface SeriesWithMetadata extends Series {
  metadata?: SeriesMetadata;
}

export interface Episode {
  id: string;
  title: string;
  season: number;
  episode: number;
  ext: string;
}

export interface SeriesSeason {
  season: number;
  episodes: Episode[];
}

export interface SeriesDetail extends Series {
  seasons: SeriesSeason[];
}

export interface SeriesDetailWithMetadata extends SeriesDetail {
  metadata?: SeriesMetadata;
}

export interface CatalogSearchResult<T> {
  items: T[];
  total: number;
}

export interface CatalogFilterOptions {
  years: number[];
  genres: string[];
  actors: string[];
  directors: string[];
  ratingRange: { min: number; max: number };
  imdbScoreRange: { min: number; max: number };
  /** Audio-track languages available (movies only; empty for series). */
  audioLangs: string[];
}

/* ----- Persisted metadata DB browsing ("Database" screen) ----- */

export interface MetadataMovieRow {
  movieId: string;
  tmdbId?: number;
  title: string;
  year?: number;
  rating?: number;
  imdbScore?: number;
  imdbId?: string;
  runtime?: number;
  posterUrl?: string;
  genres: string[];
  updatedAt: string;
}

export interface MetadataSeriesRow {
  seriesId: string;
  tmdbId?: number;
  title: string;
  yearStart?: number;
  yearEnd?: number;
  rating?: number;
  imdbScore?: number;
  imdbId?: string;
  posterUrl?: string;
  status?: string;
  genres: string[];
  updatedAt: string;
}

export interface MetadataListResult<T> {
  items: T[];
  total: number;
}

export interface MovieVersion {
  movieId: string;
  name: string;
  group?: string;
  ext?: string;
}

/** A film deduplicated by IMDb id, with its playable provider versions. */
export interface GroupedMovieRow {
  key: string;
  imdbId?: string;
  tmdbId?: number;
  title: string;
  tmdbTitle?: string;
  year?: number;
  rating?: number;
  imdbScore?: number;
  posterUrl?: string;
  genres: string[];
  versionCount: number;
  versions: MovieVersion[];
}

export interface SeriesVersion {
  seriesId: string;
  name: string;
  group?: string;
}

/** A series deduplicated by IMDb id, with its provider versions. */
export interface GroupedSeriesRow {
  key: string;
  imdbId?: string;
  tmdbId?: number;
  title: string;
  tmdbTitle?: string;
  yearStart?: number;
  yearEnd?: number;
  rating?: number;
  imdbScore?: number;
  posterUrl?: string;
  status?: string;
  genres: string[];
  versionCount: number;
  versions: SeriesVersion[];
}

export interface MetadataStats {
  movies: number;
  series: number;
}

export interface MetadataBrowseParams {
  query?: string;
  genre?: string;
  year?: number;
  minRating?: number;
  sort?: 'title' | 'year' | 'rating';
  page?: number;
  limit?: number;
  actor?: string;
  director?: string;
  audioLang?: string;
  subtitled?: string;
}

export interface AudioTrack {
  index: number;
  language?: string;
  title?: string;
  codec?: string;
  channels?: number;
}

export interface SubtitleTrack {
  index: number;
  language?: string;
  title?: string;
  codec?: string;
  textBased: boolean;
}

export interface VodSession {
  id: string;
  playlist: string;
  duration: number;
  startPos: number;
  audioIndex: number;
  subtitleIndex: number;
  audioTracks: AudioTrack[];
  subtitleTracks: SubtitleTrack[];
}

export interface SearchChannelsParams {
  query?: string;
  group?: string;
  year?: number;
  genre?: string;
  actor?: string;
  director?: string;
  minRating?: number;
  maxRating?: number;
  minImdbScore?: number;
  maxImdbScore?: number;
  /** 'title' | 'title_desc' | 'year' | 'rating' */
  sort?: string;
  page?: number;
  limit?: number;
  /** Primary audio-track language code (movies only). */
  audioLang?: string;
  /** '1' to keep only subtitled (category/name heuristic). */
  subtitled?: string;
}

export interface ProgressItem {
  kind: 'movie' | 'episode';
  id: string;
  title: string;
  poster?: string;
  ext?: string;
  position: number;
  duration: number;
  updatedAt: string;
  seriesId?: string;
  seriesName?: string;
  season?: number;
  episode?: number;
}

export type SaveProgressInput = Omit<ProgressItem, 'updatedAt'>;

export interface ApiErrorBody {
  error: string;
  message: string;
}

export type Section = 'channels' | 'movies' | 'series';

/** `null` => unrestricted (all categories); array => only these categories. */
export interface AllowedGroups {
  channels: string[] | null;
  movies: string[] | null;
  series: string[] | null;
}

export interface User {
  id: string;
  name: string;
  color?: string;
  /** Kids profile: age-restricted categories are hidden on top of `allowed`. */
  kids?: boolean;
  /** Hide age-restricted categories without marking the profile as kids. */
  hideAdult?: boolean;
  /** Suspended: keeps its settings but cannot be signed into or picked. */
  disabled?: boolean;
  /** Whether this profile requires a PIN to sign in (the PIN itself is never sent). */
  hasPin?: boolean;
  allowed: AllowedGroups;
  createdAt: string;
}

export interface CreateUserInput {
  name: string;
  color?: string;
  kids?: boolean;
  hideAdult?: boolean;
  disabled?: boolean;
  /** 4–8 digit PIN; empty string clears it. */
  pin?: string;
  allowed?: Partial<AllowedGroups>;
}

export type UpdateUserInput = Partial<CreateUserInput>;

// Upstream stream URLs are deliberately absent from these shapes: they carry
// the provider account's credentials and the server keeps them to itself.
// Playback addresses content by `MediaSource` instead.

/** A logged-in viewer profile, as the server reports it. */
export interface SessionUser {
  id: string;
  name: string;
}

/** What the /admin screen needs before it can show anything. */
export interface AdminStatus {
  /** False on a fresh install: /admin offers to choose the password. */
  configured: boolean;
  signedIn: boolean;
  minPasswordLength: number;
}

/** The little the "who's watching?" picker is told about each profile. */
export interface PickerUser {
  id: string;
  name: string;
  color?: string;
  kids?: boolean;
  hasPin: boolean;
}

/**
 * A reference to something playable in the server's catalog. Playback endpoints
 * take one of these instead of an upstream URL: the server decides what the
 * active profile may watch, and provider credentials never reach the browser.
 */
export type MediaSource =
  | `channel:${string}`
  | `movie:${string}`
  | `episode:${string}`;

export const channelSource = (channelId: string): MediaSource =>
  `channel:${channelId}`;

export const movieSource = (movieId: string): MediaSource => `movie:${movieId}`;

export const episodeSource = (
  seriesId: string,
  episodeId: string,
): MediaSource => `episode:${seriesId}:${episodeId}`;
