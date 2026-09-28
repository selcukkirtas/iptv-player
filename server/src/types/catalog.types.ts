/** A VOD movie (single playable file). */
export interface Movie {
  id: string;
  name: string;
  logo?: string;
  group?: string;
  /** Direct stream URL incl. credentials, e.g. /movie/user/pass/<id>.mkv */
  url: string;
  /** Container extension (mkv, mp4, avi) — drives direct-play vs transcode. */
  ext: string;
  rating?: number;
}

/** Extended movie with metadata (cast, crew, genres) */
export interface MovieWithMetadata extends Movie {
  metadata?: {
    plot?: string;
    year?: number;
    runtime?: number;
    rating?: number; // TMDB rating (0-10)
    imdbScore?: number; // IMDB score (0-10)
    posterUrl?: string;
    /** Detail responses only — a listing omits these (see MetadataService). */
    cast?: Array<{ actorName: string; character?: string }>;
    crew?: Array<{ personName: string; role: string }>;
    genres: Array<{ genreName: string }>;
  };
}

/** A series (metadata only; episodes are fetched on demand). */
export interface Series {
  id: string;
  name: string;
  cover?: string;
  group?: string;
  plot?: string;
  genre?: string;
}

/** Extended series with metadata */
export interface SeriesWithMetadata extends Series {
  metadata?: {
    yearStart?: number;
    yearEnd?: number;
    rating?: number; // TMDB rating (0-10)
    imdbScore?: number; // IMDB score (0-10)
    posterUrl?: string;
    /** Detail responses only — a listing omits these (see MetadataService). */
    cast?: Array<{ actorName: string; character?: string }>;
    crew?: Array<{ personName: string; role: string }>;
    genres: Array<{ genreName: string }>;
  };
}

/** A single episode within a series season. */
export interface Episode {
  id: string;
  title: string;
  season: number;
  episode: number;
  url: string;
  ext: string;
}

export interface SeriesSeason {
  season: number;
  episodes: Episode[];
}

export interface SeriesDetail extends Series {
  seasons: SeriesSeason[];
}

export interface SeriesDetailWithMetadata extends SeriesWithMetadata {
  seasons: SeriesSeason[];
}

/** Xtream account, persisted so series episodes can be fetched on demand. */
export interface XtreamAccount {
  host: string;
  username: string;
  password: string;
}

/** One playable provider entry (a "version") behind a deduplicated title. */
export interface MovieVersion {
  /** Provider movie id — playable at /movies/:movieId. */
  movieId: string;
  /** Provider display name (carries quality/language/provider hints). */
  name: string;
  group?: string;
  ext?: string;
}

/** A unique film (by IMDb id) with all its provider versions collapsed under it. */
export interface GroupedMovie {
  /** Grouping key: imdb:<id> | tmdb:<id> | title:<title>|<year>. */
  key: string;
  imdbId?: string;
  tmdbId?: number;
  /** Display title — the (Turkish) provider name, cleaned. */
  title: string;
  /** Original TMDB title (often English), shown as secondary. */
  tmdbTitle?: string;
  year?: number;
  rating?: number;
  imdbScore?: number;
  posterUrl?: string;
  genres: string[];
  versionCount: number;
  versions: MovieVersion[];
}

/** One provider series entry (a "version"); opens at /series/:seriesId. */
export interface SeriesVersion {
  seriesId: string;
  name: string;
  group?: string;
}

/** A unique series (by IMDb id) with all its provider versions collapsed under it. */
export interface GroupedSeries {
  key: string;
  imdbId?: string;
  tmdbId?: number;
  /** Display title — the (Turkish) provider name, cleaned. */
  title: string;
  /** Original TMDB title (often English), shown as secondary. */
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
