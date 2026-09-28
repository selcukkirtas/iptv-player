import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, ObjectLiteral, Repository } from 'typeorm';
import { foldForSearch } from '../common/search-fold';

/** The slice of the better-sqlite3 connection we need to register a function. */
interface SqliteFunctionHost {
  function(
    name: string,
    options: { deterministic?: boolean; varargs?: boolean },
    fn: (value: unknown) => unknown,
  ): unknown;
}
import { MovieMetadata } from '../database/entities/movie-metadata.entity';
import { MovieCast } from '../database/entities/movie-cast.entity';
import { MovieCrew } from '../database/entities/movie-crew.entity';
import { MovieGenre } from '../database/entities/movie-genre.entity';
import { SeriesMetadata } from '../database/entities/series-metadata.entity';
import { SeriesCast } from '../database/entities/series-cast.entity';
import { SeriesCrew } from '../database/entities/series-crew.entity';
import { SeriesGenre } from '../database/entities/series-genre.entity';
import { MovieAudio } from '../database/entities/movie-audio.entity';
import { TMDBClientService } from './tmdb-client.service';

export interface MovieMetadataDTO {
  id: number;
  movieId: string;
  title: string;
  plot?: string;
  year?: number;
  rating?: number; // TMDB rating
  imdbScore?: number; // IMDB score
  runtime?: number;
  posterUrl?: string;
  cast: Array<{ actorName: string; character?: string }>;
  crew: Array<{ personName: string; role: string }>;
  genres: Array<{ genreName: string }>;
}

/**
 * What a *listing* needs: everything a catalogue card draws, and nothing else.
 *
 * Cast and crew are only ever shown on a detail page, but loading them joined
 * hundreds of rows per page of results — on a Raspberry Pi reading a 157 MB
 * SQLite file off an SD card, that was the difference between a usable screen
 * and a ten-second wait.
 */
export type MovieListingMetadataDTO = Omit<MovieMetadataDTO, 'cast' | 'crew'>;
export type SeriesListingMetadataDTO = Omit<SeriesMetadataDTO, 'cast' | 'crew'>;

/** Options that populate the catalog filter bar dropdowns/datalists. */
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

/** Filters/pagination for browsing the persisted metadata DB. */
export interface MetadataBrowseQuery {
  query?: string;
  genre?: string;
  year?: number;
  minRating?: number;
  actor?: string;
  director?: string;
  sort?: 'title' | 'year' | 'rating';
  page?: number;
  limit?: number;
}

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

export interface SeriesMetadataDTO {
  id: number;
  seriesId: string;
  title: string;
  plot?: string;
  yearStart?: number;
  yearEnd?: number;
  rating?: number; // TMDB rating
  imdbScore?: number; // IMDB score
  posterUrl?: string;
  cast: Array<{ actorName: string; character?: string }>;
  crew: Array<{ personName: string; role: string }>;
  genres: Array<{ genreName: string }>;
}

/** Lightweight per-title values used to sort the whole catalog cheaply. */
export interface SortIndexEntry {
  year?: number;
  rating?: number;
}
export type SortIndex = Map<string, SortIndexEntry>;

/**
 * Name of the SQLite function that folds a column the same way
 * `foldForSearch` folds user input — see `registerSearchFold`.
 */
const SQL_FOLD = 'SEARCH_FOLD';

@Injectable()
export class MetadataService implements OnModuleInit {
  private readonly logger = new Logger(MetadataService.name);
  private movieSortCache?: { at: number; index: SortIndex };
  private seriesSortCache?: { at: number; index: SortIndex };
  private movieAudioCache?: { at: number; index: Map<string, string> };
  /**
   * Row sets for the grouped browse, keyed by the filter that produced them.
   *
   * The Database screen pages through one set repeatedly, and the query has no
   * LIMIT — it reads every matching row so titles can be grouped by IMDb id.
   * Re-reading 44k rows off an SD card for each page is what made that screen
   * take eight seconds on a Raspberry Pi. Small and short-lived: a handful of
   * filter combinations, dropped after five minutes so a fresh import shows up.
   */
  private groupingCache = new Map<string, { at: number; rows: unknown[] }>();
  private static readonly GROUPING_TTL_MS = 5 * 60_000;
  private static readonly GROUPING_CACHE_MAX = 8;
  private static readonly SORT_INDEX_TTL_MS = 30_000;

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(MovieMetadata)
    private movieMetadataRepo: Repository<MovieMetadata>,
    @InjectRepository(MovieCast)
    private movieCastRepo: Repository<MovieCast>,
    @InjectRepository(MovieCrew)
    private movieCrewRepo: Repository<MovieCrew>,
    @InjectRepository(MovieGenre)
    private movieGenreRepo: Repository<MovieGenre>,
    @InjectRepository(SeriesMetadata)
    private seriesMetadataRepo: Repository<SeriesMetadata>,
    @InjectRepository(SeriesCast)
    private seriesCastRepo: Repository<SeriesCast>,
    @InjectRepository(SeriesCrew)
    private seriesCrewRepo: Repository<SeriesCrew>,
    @InjectRepository(SeriesGenre)
    private seriesGenreRepo: Repository<SeriesGenre>,
    @InjectRepository(MovieAudio)
    private movieAudioRepo: Repository<MovieAudio>,
    private readonly tmdbClient: TMDBClientService,
  ) {}

  /**
   * Teach SQLite the same folding the JS side uses.
   *
   * `LIKE` in SQLite is only case-insensitive for ASCII, so `İSTANBUL` never
   * matched `istanbul` in a title search — and the catalogue is largely Turkish.
   * Registering the fold as a function lets the query compare folded column
   * against folded input, which matches what the in-memory searches do.
   */
  onModuleInit(): void {
    // `databaseConnection` is on the concrete SQLite driver, not the interface.
    const connection = (
      this.dataSource.driver as unknown as {
        databaseConnection?: SqliteFunctionHost;
      }
    ).databaseConnection;
    if (typeof connection?.function !== 'function') {
      this.logger.warn(
        `Could not register ${SQL_FOLD}(); title search will be ASCII-only ` +
          'case-insensitive.',
      );
      return;
    }
    connection.function(
      SQL_FOLD,
      { deterministic: true, varargs: false },
      (value: unknown) =>
        typeof value === 'string' ? foldForSearch(value) : value,
    );
  }

  /**
   * Enrich movie with TMDB metadata
   * Strategy: If metadata exists, return it as-is. If missing, fetch from TMDB.
   */
  async enrichMovie(movieId: string, title: string, year?: number) {
    const existing = await this.movieMetadataRepo.findOne({
      where: { movieId },
      relations: { cast: true, crew: true, genres: true },
    });

    // If metadata already exists, return it as-is (never modify existing data)
    if (existing) {
      return existing;
    }

    if (!this.tmdbClient.isConfigured()) {
      this.logger.debug('TMDB not configured, skipping enrichment');
      return null;
    }

    try {
      const searchResult = await this.tmdbClient.searchMovie(title, year);
      if (!searchResult) {
        this.logger.debug(`No TMDB result for movie: ${title}`);
        return null;
      }

      const details = await this.tmdbClient.getMovieDetails(searchResult.id);
      if (!details) {
        return null;
      }

      const metadata = this.movieMetadataRepo.create({
        movieId,
        tmdbId: details.id,
        title: details.title,
        plot: details.overview,
        year: details.release_date
          ? parseInt(details.release_date.split('-')[0])
          : undefined,
        rating: details.vote_average > 0 ? details.vote_average : undefined,
        imdbScore: details.vote_average > 0 ? details.vote_average : undefined,
        imdbId: details.external_ids?.imdb_id,
        runtime: details.runtime,
        posterUrl: this.tmdbClient.getPosterUrl(details.poster_path),
        releaseDate: details.release_date,
      });

      const saved = await this.movieMetadataRepo.save(metadata);
      await this.addMovieRelations(saved.id, details);

      return this.movieMetadataRepo.findOne({
        where: { id: saved.id },
        relations: { cast: true, crew: true, genres: true },
      });
    } catch (error) {
      this.logger.error(`Failed to enrich movie ${movieId}: ${error}`);
      return null;
    }
  }

  private async addMovieRelations(movieMetadataId: number, details: any) {
    if (details.credits?.cast) {
      const cast = details.credits.cast.slice(0, 20).map((c: any) =>
        this.movieCastRepo.create({
          movieMetadataId,
          actorName: c.name,
          character: c.character,
          tmdbPersonId: c.id,
        }),
      );
      await this.movieCastRepo.save(cast);
    }

    if (details.credits?.crew) {
      const targetRoles = ['Director', 'Writer', 'Producer', 'Screenplay'];
      const crew = details.credits.crew
        .filter((c: any) => targetRoles.includes(c.job))
        .slice(0, 20)
        .map((c: any) =>
          this.movieCrewRepo.create({
            movieMetadataId,
            personName: c.name,
            role: c.job,
            tmdbPersonId: c.id,
          }),
        );
      await this.movieCrewRepo.save(crew);
    }

    if (details.genres) {
      const genres = details.genres.map((g: any) =>
        this.movieGenreRepo.create({
          movieMetadataId,
          genreName: g.name,
        }),
      );
      await this.movieGenreRepo.save(genres);
    }
  }

  /**
   * Enrich series with TMDB metadata
   * Strategy: If metadata exists, return it as-is. If missing, fetch from TMDB.
   */
  async enrichSeries(seriesId: string, title: string, year?: number) {
    const existing = await this.seriesMetadataRepo.findOne({
      where: { seriesId },
      relations: { cast: true, crew: true, genres: true },
    });

    // If metadata already exists, return it as-is (never modify existing data)
    if (existing) {
      return existing;
    }

    if (!this.tmdbClient.isConfigured()) {
      this.logger.debug('TMDB not configured, skipping enrichment');
      return null;
    }

    try {
      const searchResult = await this.tmdbClient.searchSeries(title, year);
      if (!searchResult) {
        this.logger.debug(`No TMDB result for series: ${title}`);
        return null;
      }

      const details = await this.tmdbClient.getSeriesDetails(searchResult.id);
      if (!details) {
        return null;
      }

      const metadata = this.seriesMetadataRepo.create({
        seriesId,
        tmdbId: details.id,
        title: details.name,
        plot: details.overview,
        yearStart: details.first_air_date
          ? parseInt(details.first_air_date.split('-')[0])
          : undefined,
        yearEnd: details.last_air_date
          ? parseInt(details.last_air_date.split('-')[0])
          : undefined,
        rating: details.vote_average > 0 ? details.vote_average : undefined,
        imdbScore: details.vote_average > 0 ? details.vote_average : undefined,
        imdbId: details.external_ids?.imdb_id,
        posterUrl: this.tmdbClient.getPosterUrl(details.poster_path),
        firstAirDate: details.first_air_date,
        status: details.status,
      });

      const saved = await this.seriesMetadataRepo.save(metadata);
      await this.addSeriesRelations(saved.id, details);

      return this.seriesMetadataRepo.findOne({
        where: { id: saved.id },
        relations: { cast: true, crew: true, genres: true },
      });
    } catch (error) {
      this.logger.error(`Failed to enrich series ${seriesId}: ${error}`);
      return null;
    }
  }

  private async addSeriesRelations(seriesMetadataId: number, details: any) {
    if (details.aggregate_credits?.cast) {
      const cast = details.aggregate_credits.cast.slice(0, 20).map((c: any) =>
        this.seriesCastRepo.create({
          seriesMetadataId,
          actorName: c.name,
          character: c.roles?.[0]?.character,
          tmdbPersonId: c.id,
        }),
      );
      await this.seriesCastRepo.save(cast);
    }

    if (details.aggregate_credits?.crew) {
      const targetRoles = ['Director', 'Writer', 'Producer'];
      const crew = details.aggregate_credits.crew
        .filter((c: any) =>
          c.jobs?.some((j: any) => targetRoles.includes(j.job)),
        )
        .slice(0, 20)
        .map((c: any) =>
          this.seriesCrewRepo.create({
            seriesMetadataId,
            personName: c.name,
            role: c.jobs?.[0]?.job || 'Unknown',
            tmdbPersonId: c.id,
          }),
        );
      await this.seriesCrewRepo.save(crew);
    }

    if (details.genres) {
      const genres = details.genres.map((g: any) =>
        this.seriesGenreRepo.create({
          seriesMetadataId,
          genreName: g.name,
        }),
      );
      await this.seriesGenreRepo.save(genres);
    }
  }

  /**
   * Get movie metadata
   */
  /**
   * Metadata for a whole page of movies in one query, without cast or crew.
   *
   * A listing used to resolve each row on its own, and a relational lookup is
   * expensive enough (~140 ms on a Raspberry Pi-class CPU) that a 40-row page
   * spent over five seconds doing forty of them. One `In(...)` query costs about
   * the same as a single lookup did — and skipping the two biggest relations
   * (728k cast rows, 222k crew rows on a real catalogue) keeps it that way.
   */
  async getMovieMetadataMany(
    movieIds: string[],
  ): Promise<Map<string, MovieListingMetadataDTO>> {
    const byId = new Map<string, MovieListingMetadataDTO>();
    if (movieIds.length === 0) return byId;

    const rows = await this.movieMetadataRepo.find({
      where: { movieId: In(movieIds) },
      relations: { genres: true },
    });
    for (const m of rows) {
      byId.set(m.movieId, {
        id: m.id,
        movieId: m.movieId,
        title: m.title,
        plot: m.plot,
        year: m.year,
        rating: m.rating,
        imdbScore: m.imdbScore,
        runtime: m.runtime,
        posterUrl: m.posterUrl,
        genres: m.genres.map((g) => ({ genreName: g.genreName })),
      });
    }
    return byId;
  }

  /** As `getMovieMetadataMany`, for series. */
  async getSeriesMetadataMany(
    seriesIds: string[],
  ): Promise<Map<string, SeriesListingMetadataDTO>> {
    const byId = new Map<string, SeriesListingMetadataDTO>();
    if (seriesIds.length === 0) return byId;

    const rows = await this.seriesMetadataRepo.find({
      where: { seriesId: In(seriesIds) },
      relations: { genres: true },
    });
    for (const m of rows) {
      byId.set(m.seriesId, {
        id: m.id,
        seriesId: m.seriesId,
        title: m.title,
        plot: m.plot,
        yearStart: m.yearStart,
        yearEnd: m.yearEnd,
        rating: m.rating,
        imdbScore: m.imdbScore,
        posterUrl: m.posterUrl,
        genres: m.genres.map((g) => ({ genreName: g.genreName })),
      });
    }
    return byId;
  }

  async getMovieMetadata(movieId: string): Promise<MovieMetadataDTO | null> {
    const metadata = await this.movieMetadataRepo.findOne({
      where: { movieId },
      relations: { cast: true, crew: true, genres: true },
    });

    return metadata ? this.toMovieDto(metadata) : null;
  }

  private toMovieDto(metadata: MovieMetadata): MovieMetadataDTO {
    return {
      id: metadata.id,
      movieId: metadata.movieId,
      title: metadata.title,
      plot: metadata.plot,
      year: metadata.year,
      rating: metadata.rating,
      imdbScore: metadata.imdbScore,
      runtime: metadata.runtime,
      posterUrl: metadata.posterUrl,
      cast: metadata.cast.map((c) => ({
        actorName: c.actorName,
        character: c.character,
      })),
      crew: metadata.crew.map((c) => ({
        personName: c.personName,
        role: c.role,
      })),
      genres: metadata.genres.map((g) => ({ genreName: g.genreName })),
    };
  }

  /**
   * Get series metadata
   */
  async getSeriesMetadata(seriesId: string): Promise<SeriesMetadataDTO | null> {
    const metadata = await this.seriesMetadataRepo.findOne({
      where: { seriesId },
      relations: { cast: true, crew: true, genres: true },
    });

    return metadata ? this.toSeriesDto(metadata) : null;
  }

  private toSeriesDto(metadata: SeriesMetadata): SeriesMetadataDTO {
    return {
      id: metadata.id,
      seriesId: metadata.seriesId,
      title: metadata.title,
      plot: metadata.plot,
      yearStart: metadata.yearStart,
      yearEnd: metadata.yearEnd,
      rating: metadata.rating,
      imdbScore: metadata.imdbScore,
      posterUrl: metadata.posterUrl,
      cast: metadata.cast.map((c) => ({
        actorName: c.actorName,
        character: c.character,
      })),
      crew: metadata.crew.map((c) => ({
        personName: c.personName,
        role: c.role,
      })),
      genres: metadata.genres.map((g) => ({ genreName: g.genreName })),
    };
  }

  /**
   * Search movies by actor/director/genre
   */
  async searchMoviesByActor(actorName: string) {
    const cast = await this.movieCastRepo.find({
      where: {
        actorName: actorName,
      },
      relations: { metadata: true },
    });

    return cast.map((c) => c.metadata);
  }

  async searchMoviesByDirector(directorName: string) {
    const crew = await this.movieCrewRepo.find({
      where: {
        personName: directorName,
        role: 'Director',
      },
      relations: { metadata: true },
    });

    return crew.map((c) => c.metadata);
  }

  async searchMoviesByGenre(genreName: string) {
    const genres = await this.movieGenreRepo.find({
      where: {
        genreName: genreName,
      },
      relations: { metadata: true },
    });

    return genres.map((g) => g.metadata);
  }

  /**
   * Search series by actor/director/genre
   */
  async searchSeriesByActor(actorName: string) {
    const cast = await this.seriesCastRepo.find({
      where: {
        actorName: actorName,
      },
      relations: { metadata: true },
    });

    return cast.map((c) => c.metadata);
  }

  async searchSeriesByDirector(directorName: string) {
    const crew = await this.seriesCrewRepo.find({
      where: {
        personName: directorName,
        role: 'Director',
      },
      relations: { metadata: true },
    });

    return crew.map((c) => c.metadata);
  }

  async searchSeriesByGenre(genreName: string) {
    const genres = await this.seriesGenreRepo.find({
      where: {
        genreName: genreName,
      },
      relations: { metadata: true },
    });

    return genres.map((g) => g.metadata);
  }

  /* ----- Movie audio-track language (from Xtream get_vod_info) ----- */

  /** Whether this movie's audio has already been probed (row exists). */
  async hasMovieAudio(movieId: string): Promise<boolean> {
    const count = await this.movieAudioRepo.count({ where: { movieId } });
    return count > 0;
  }

  /** Record a movie's primary audio language (null = probed, none reported). */
  async setMovieAudio(movieId: string, lang: string | null): Promise<void> {
    await this.movieAudioRepo.upsert({ movieId, lang: lang ?? undefined }, [
      'movieId',
    ]);
    this.movieAudioCache = undefined; // invalidate filter index
  }

  /** Distinct audio languages present (non-null), sorted. */
  async movieAudioLangs(): Promise<string[]> {
    const rows = await this.movieAudioRepo
      .createQueryBuilder('a')
      .select('DISTINCT a.lang', 'lang')
      .where('a.lang IS NOT NULL')
      .orderBy('a.lang', 'ASC')
      .getRawMany<{ lang: string }>();
    return rows.map((r) => r.lang);
  }

  /** movieId → audio language map, cached, for whole-catalog filtering. */
  async movieAudioIndex(): Promise<Map<string, string>> {
    if (
      this.movieAudioCache &&
      Date.now() - this.movieAudioCache.at < MetadataService.SORT_INDEX_TTL_MS
    ) {
      return this.movieAudioCache.index;
    }
    const rows = await this.movieAudioRepo
      .createQueryBuilder('a')
      .select('a.movieId', 'movieId')
      .addSelect('a.lang', 'lang')
      .where('a.lang IS NOT NULL')
      .getRawMany<{ movieId: string; lang: string }>();
    const index = new Map<string, string>();
    for (const r of rows) index.set(r.movieId, r.lang);
    this.movieAudioCache = { at: Date.now(), index };
    return index;
  }

  /** Count of movies probed / with a known language (for progress display). */
  async movieAudioStats(): Promise<{ probed: number; withLang: number }> {
    const probed = await this.movieAudioRepo.count();
    const withLang = await this.movieAudioRepo
      .createQueryBuilder('a')
      .where('a.lang IS NOT NULL')
      .getCount();
    return { probed, withLang };
  }

  /* ----- Sort index: id → {year, rating}, cached, for whole-catalog sorting ----- */

  /**
   * A compact id→{year,rating} map so CatalogService can sort tens of thousands
   * of catalog items by year/rating with O(1) lookups instead of a DB read per
   * item. Cached briefly; rebuilt as enrichment adds rows.
   */
  async movieSortIndex(): Promise<SortIndex> {
    if (this.isFresh(this.movieSortCache)) return this.movieSortCache!.index;
    const rows = await this.movieMetadataRepo
      .createQueryBuilder('m')
      .select('m.movieId', 'id')
      .addSelect('m.year', 'year')
      .addSelect('m.imdbScore', 'rating')
      .getRawMany<{ id: string; year: number | null; rating: number | null }>();
    const index = this.toSortIndex(rows);
    this.movieSortCache = { at: Date.now(), index };
    return index;
  }

  async seriesSortIndex(): Promise<SortIndex> {
    if (this.isFresh(this.seriesSortCache)) return this.seriesSortCache!.index;
    const rows = await this.seriesMetadataRepo
      .createQueryBuilder('s')
      .select('s.seriesId', 'id')
      .addSelect('s.yearStart', 'year')
      .addSelect('s.imdbScore', 'rating')
      .getRawMany<{ id: string; year: number | null; rating: number | null }>();
    const index = this.toSortIndex(rows);
    this.seriesSortCache = { at: Date.now(), index };
    return index;
  }

  /** Serve a grouping row set from cache, or run `load` and remember it. */
  private async memoGrouping<T>(
    kind: string,
    q: MetadataBrowseQuery,
    load: () => Promise<T[]>,
  ): Promise<T[]> {
    const key = `${kind}|${JSON.stringify([
      q.query ?? '',
      q.year ?? '',
      q.minRating ?? '',
      q.genre ?? '',
      q.actor ?? '',
      q.director ?? '',
    ])}`;
    const hit = this.groupingCache.get(key);
    if (hit && Date.now() - hit.at < MetadataService.GROUPING_TTL_MS) {
      return hit.rows as T[];
    }
    const rows = await load();
    // Keep the map from growing without bound as filters are explored.
    if (this.groupingCache.size >= MetadataService.GROUPING_CACHE_MAX) {
      const oldest = [...this.groupingCache.entries()].sort(
        (a, b) => a[1].at - b[1].at,
      )[0];
      if (oldest) this.groupingCache.delete(oldest[0]);
    }
    this.groupingCache.set(key, { at: Date.now(), rows });
    return rows;
  }

  private isFresh(cache?: { at: number; index: SortIndex }): boolean {
    return !!cache && Date.now() - cache.at < MetadataService.SORT_INDEX_TTL_MS;
  }

  private toSortIndex(
    rows: Array<{ id: string; year: number | null; rating: number | null }>,
  ): SortIndex {
    const index: SortIndex = new Map();
    for (const r of rows) {
      index.set(r.id, {
        year: r.year != null ? Number(r.year) : undefined,
        rating: r.rating != null ? Number(r.rating) : undefined,
      });
    }
    return index;
  }

  /* ----- Filter dropdown options, computed straight from the metadata DB ----- */

  /**
   * Build the movies filter bar's options (years/genres/actors/directors +
   * rating ranges) with a handful of aggregate queries. The old approach
   * looped every catalog movie doing one DB read each (~64k reads, ~17s and
   * empty genres); these queries return in milliseconds.
   */
  async movieFilterOptions(): Promise<CatalogFilterOptions> {
    const [years, genres, actors, directors, rating, imdb, audioLangs] =
      await Promise.all([
        this.distinctYears(this.movieMetadataRepo, 'm', ['year']),
        this.movieGenreNames(),
        this.topNames(this.movieCastRepo, 'actorName'),
        this.topNames(this.movieCrewRepo, 'personName', 'Director'),
        this.scoreRange(this.movieMetadataRepo, 'rating'),
        this.scoreRange(this.movieMetadataRepo, 'imdbScore'),
        this.movieAudioLangs(),
      ]);
    return {
      years,
      genres,
      actors,
      directors,
      ratingRange: rating,
      imdbScoreRange: imdb,
      audioLangs,
    };
  }

  async seriesFilterOptions(): Promise<CatalogFilterOptions> {
    const [years, genres, actors, directors, rating, imdb] = await Promise.all([
      this.distinctYears(this.seriesMetadataRepo, 's', [
        'yearStart',
        'yearEnd',
      ]),
      this.seriesGenreNames(),
      this.topNames(this.seriesCastRepo, 'actorName'),
      this.topNames(this.seriesCrewRepo, 'personName', 'Director'),
      this.scoreRange(this.seriesMetadataRepo, 'rating'),
      this.scoreRange(this.seriesMetadataRepo, 'imdbScore'),
    ]);
    return {
      years,
      genres,
      actors,
      directors,
      ratingRange: rating,
      imdbScoreRange: imdb,
      audioLangs: [],
    };
  }

  /** Distinct years across one or more year columns, newest first. */
  private async distinctYears(
    repo: Repository<MovieMetadata | SeriesMetadata>,
    alias: string,
    columns: string[],
  ): Promise<number[]> {
    const set = new Set<number>();
    for (const col of columns) {
      const rows = await repo
        .createQueryBuilder(alias)
        .select(`${alias}.${col}`, 'year')
        .where(`${alias}.${col} IS NOT NULL`)
        .distinct(true)
        .getRawMany<{ year: number }>();
      for (const r of rows) if (r.year != null) set.add(Number(r.year));
    }
    return Array.from(set).sort((a, b) => b - a);
  }

  /** Most frequent names (actors, or crew filtered to a role), capped and A→Z. */
  private async topNames(
    repo: Repository<ObjectLiteral>,
    nameColumn: string,
    role?: string,
  ): Promise<string[]> {
    const NAME_LIMIT = 500;
    const qb = repo
      .createQueryBuilder('x')
      .select(`x.${nameColumn}`, 'name')
      .groupBy(`x.${nameColumn}`)
      .orderBy('COUNT(*)', 'DESC')
      .limit(NAME_LIMIT);
    if (role) qb.where('x.role = :role', { role });
    const rows = await qb.getRawMany<{ name: string }>();
    return rows
      .map((r) => r.name)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }

  /** Min/max of a 0–10 score column, with sane fallbacks when empty. */
  private async scoreRange(
    repo: Repository<MovieMetadata | SeriesMetadata>,
    column: 'rating' | 'imdbScore',
  ): Promise<{ min: number; max: number }> {
    const row = await repo
      .createQueryBuilder('m')
      .select(`MIN(m.${column})`, 'mn')
      .addSelect(`MAX(m.${column})`, 'mx')
      .where(`m.${column} IS NOT NULL`)
      .getRawOne<{ mn: number | null; mx: number | null }>();
    const min = row?.mn != null ? Number(row.mn) : 0;
    const max = row?.mx != null ? Number(row.mx) : 10;
    return { min, max };
  }

  /* ----- Persisted metadata DB browsing (admin/inspection screen) ----- */

  /** Row counts for the enrichment progress header. */
  async metadataStats(): Promise<{ movies: number; series: number }> {
    const [movies, series] = await Promise.all([
      this.movieMetadataRepo.count(),
      this.seriesMetadataRepo.count(),
    ]);
    return { movies, series };
  }

  /** Distinct genre names present in the movie/series metadata (for dropdowns). */
  async movieGenreNames(): Promise<string[]> {
    const rows = await this.movieGenreRepo
      .createQueryBuilder('g')
      .select('DISTINCT g.genreName', 'genreName')
      .orderBy('g.genreName', 'ASC')
      .getRawMany<{ genreName: string }>();
    return rows.map((r) => r.genreName);
  }

  async seriesGenreNames(): Promise<string[]> {
    const rows = await this.seriesGenreRepo
      .createQueryBuilder('g')
      .select('DISTINCT g.genreName', 'genreName')
      .orderBy('g.genreName', 'ASC')
      .getRawMany<{ genreName: string }>();
    return rows.map((r) => r.genreName);
  }

  async browseMovies(
    q: MetadataBrowseQuery,
  ): Promise<{ items: MetadataMovieRow[]; total: number }> {
    const page = Math.max(1, q.page ?? 1);
    const limit = Math.min(200, Math.max(1, q.limit ?? 50));

    const qb = this.movieMetadataRepo.createQueryBuilder('m');
    if (q.query) {
      qb.andWhere(`${SQL_FOLD}(m.title) LIKE :q`, {
        q: `%${foldForSearch(q.query)}%`,
      });
    }
    if (q.year !== undefined) qb.andWhere('m.year = :year', { year: q.year });
    if (q.minRating !== undefined)
      qb.andWhere('m.imdbScore >= :mr', { mr: q.minRating });
    if (q.genre) {
      // Subquery (not a JOIN) so pagination counts stay per-movie.
      qb.andWhere(
        'm.id IN ' +
          qb
            .subQuery()
            .select('mg.movieMetadataId')
            .from(MovieGenre, 'mg')
            .where('mg.genreName = :genre')
            .getQuery(),
      ).setParameter('genre', q.genre);
    }

    switch (q.sort ?? 'rating') {
      case 'title':
        qb.orderBy('m.title', 'ASC');
        break;
      case 'year':
        qb.orderBy('m.year', 'DESC').addOrderBy('m.title', 'ASC');
        break;
      default:
        qb.orderBy('m.imdbScore', 'DESC').addOrderBy('m.title', 'ASC');
    }

    const [rows, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const genresById = await this.genresFor(
      this.movieGenreRepo,
      'movieMetadataId',
      rows.map((r) => r.id),
    );

    return {
      total,
      items: rows.map((m) => ({
        movieId: m.movieId,
        tmdbId: m.tmdbId,
        title: m.title,
        year: m.year,
        rating: m.rating != null ? Number(m.rating) : undefined,
        imdbScore: m.imdbScore != null ? Number(m.imdbScore) : undefined,
        imdbId: m.imdbId,
        runtime: m.runtime,
        posterUrl: m.posterUrl,
        genres: genresById.get(m.id) ?? [],
        updatedAt: this.asIso(m.updatedAt),
      })),
    };
  }

  async browseSeries(
    q: MetadataBrowseQuery,
  ): Promise<{ items: MetadataSeriesRow[]; total: number }> {
    const page = Math.max(1, q.page ?? 1);
    const limit = Math.min(200, Math.max(1, q.limit ?? 50));

    const qb = this.seriesMetadataRepo.createQueryBuilder('s');
    if (q.query) {
      qb.andWhere(`${SQL_FOLD}(s.title) LIKE :q`, {
        q: `%${foldForSearch(q.query)}%`,
      });
    }
    if (q.year !== undefined)
      qb.andWhere(
        's.yearStart <= :year AND (s.yearEnd IS NULL OR s.yearEnd >= :year)',
        {
          year: q.year,
        },
      );
    if (q.minRating !== undefined)
      qb.andWhere('s.imdbScore >= :mr', { mr: q.minRating });
    if (q.genre) {
      qb.andWhere(
        's.id IN ' +
          qb
            .subQuery()
            .select('sg.seriesMetadataId')
            .from(SeriesGenre, 'sg')
            .where('sg.genreName = :genre')
            .getQuery(),
      ).setParameter('genre', q.genre);
    }

    switch (q.sort ?? 'rating') {
      case 'title':
        qb.orderBy('s.title', 'ASC');
        break;
      case 'year':
        qb.orderBy('s.yearStart', 'DESC').addOrderBy('s.title', 'ASC');
        break;
      default:
        qb.orderBy('s.imdbScore', 'DESC').addOrderBy('s.title', 'ASC');
    }

    const [rows, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const genresById = await this.genresFor(
      this.seriesGenreRepo,
      'seriesMetadataId',
      rows.map((r) => r.id),
    );

    return {
      total,
      items: rows.map((s) => ({
        seriesId: s.seriesId,
        tmdbId: s.tmdbId,
        title: s.title,
        yearStart: s.yearStart,
        yearEnd: s.yearEnd,
        rating: s.rating != null ? Number(s.rating) : undefined,
        imdbScore: s.imdbScore != null ? Number(s.imdbScore) : undefined,
        imdbId: s.imdbId,
        posterUrl: s.posterUrl,
        status: s.status,
        genres: genresById.get(s.id) ?? [],
        updatedAt: this.asIso(s.updatedAt),
      })),
    };
  }

  /**
   * Minimal movie rows (all matches, no pagination) for imdb-id grouping.
   * Memoised per filter — see `memoGrouping`.
   */
  async listMoviesForGrouping(q: MetadataBrowseQuery): Promise<
    Array<{
      movieId: string;
      imdbId?: string;
      tmdbId?: number;
      title: string;
      year?: number;
      rating?: number;
      imdbScore?: number;
      posterUrl?: string;
    }>
  > {
    return this.memoGrouping('movies', q, () => this.queryMoviesForGrouping(q));
  }

  private async queryMoviesForGrouping(q: MetadataBrowseQuery): Promise<
    Array<{
      movieId: string;
      imdbId?: string;
      tmdbId?: number;
      title: string;
      year?: number;
      rating?: number;
      imdbScore?: number;
      posterUrl?: string;
    }>
  > {
    const qb = this.movieMetadataRepo
      .createQueryBuilder('m')
      .select([
        'm.movieId',
        'm.imdbId',
        'm.tmdbId',
        'm.title',
        'm.year',
        'm.rating',
        'm.imdbScore',
        'm.posterUrl',
      ]);
    if (q.query) {
      qb.andWhere(`${SQL_FOLD}(m.title) LIKE :q`, {
        q: `%${foldForSearch(q.query)}%`,
      });
    }
    if (q.year !== undefined) qb.andWhere('m.year = :year', { year: q.year });
    if (q.minRating !== undefined)
      qb.andWhere('m.imdbScore >= :mr', { mr: q.minRating });
    if (q.genre) {
      qb.andWhere(
        'm.id IN ' +
          qb
            .subQuery()
            .select('mg.movieMetadataId')
            .from(MovieGenre, 'mg')
            .where('mg.genreName = :genre')
            .getQuery(),
      ).setParameter('genre', q.genre);
    }
    if (q.actor) {
      qb.andWhere(
        'm.id IN ' +
          qb
            .subQuery()
            .select('mc.movieMetadataId')
            .from(MovieCast, 'mc')
            .where(`${SQL_FOLD}(mc.actorName) LIKE :actor`)
            .getQuery(),
      ).setParameter('actor', `%${foldForSearch(q.actor)}%`);
    }
    if (q.director) {
      qb.andWhere(
        'm.id IN ' +
          qb
            .subQuery()
            .select('mcr.movieMetadataId')
            .from(MovieCrew, 'mcr')
            .where(
              `mcr.role = 'Director' AND ${SQL_FOLD}(mcr.personName) LIKE :director`,
            )
            .getQuery(),
      ).setParameter('director', `%${foldForSearch(q.director)}%`);
    }
    const rows = await qb.getMany();
    return rows.map((m) => ({
      movieId: m.movieId,
      imdbId: m.imdbId,
      tmdbId: m.tmdbId,
      title: m.title,
      year: m.year,
      rating: m.rating != null ? Number(m.rating) : undefined,
      imdbScore: m.imdbScore != null ? Number(m.imdbScore) : undefined,
      posterUrl: m.posterUrl,
    }));
  }

  /** Genre names keyed by provider movieId (for a small set of ids). */
  async movieGenresByMovieIds(
    movieIds: string[],
  ): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (movieIds.length === 0) return map;
    const rows = await this.movieGenreRepo
      .createQueryBuilder('g')
      .innerJoin(MovieMetadata, 'm', 'm.id = g.movieMetadataId')
      .select('m.movieId', 'movieId')
      .addSelect('g.genreName', 'genreName')
      .where('m.movieId IN (:...ids)', { ids: movieIds })
      .getRawMany<{ movieId: string; genreName: string }>();
    for (const r of rows) {
      const arr = map.get(r.movieId) ?? [];
      arr.push(r.genreName);
      map.set(r.movieId, arr);
    }
    return map;
  }

  /**
   * Minimal series rows (all matches, no pagination) for imdb-id grouping.
   * Memoised per filter — see `memoGrouping`.
   */
  async listSeriesForGrouping(q: MetadataBrowseQuery): Promise<
    Array<{
      seriesId: string;
      imdbId?: string;
      tmdbId?: number;
      title: string;
      yearStart?: number;
      yearEnd?: number;
      rating?: number;
      imdbScore?: number;
      posterUrl?: string;
      status?: string;
    }>
  > {
    return this.memoGrouping('series', q, () => this.querySeriesForGrouping(q));
  }

  private async querySeriesForGrouping(q: MetadataBrowseQuery): Promise<
    Array<{
      seriesId: string;
      imdbId?: string;
      tmdbId?: number;
      title: string;
      yearStart?: number;
      yearEnd?: number;
      rating?: number;
      imdbScore?: number;
      posterUrl?: string;
      status?: string;
    }>
  > {
    const qb = this.seriesMetadataRepo
      .createQueryBuilder('s')
      .select([
        's.seriesId',
        's.imdbId',
        's.tmdbId',
        's.title',
        's.yearStart',
        's.yearEnd',
        's.rating',
        's.imdbScore',
        's.posterUrl',
        's.status',
      ]);
    if (q.query) {
      qb.andWhere(`${SQL_FOLD}(s.title) LIKE :q`, {
        q: `%${foldForSearch(q.query)}%`,
      });
    }
    if (q.year !== undefined)
      qb.andWhere(
        's.yearStart <= :year AND (s.yearEnd IS NULL OR s.yearEnd >= :year)',
        { year: q.year },
      );
    if (q.minRating !== undefined)
      qb.andWhere('s.imdbScore >= :mr', { mr: q.minRating });
    if (q.genre) {
      qb.andWhere(
        's.id IN ' +
          qb
            .subQuery()
            .select('sg.seriesMetadataId')
            .from(SeriesGenre, 'sg')
            .where('sg.genreName = :genre')
            .getQuery(),
      ).setParameter('genre', q.genre);
    }
    if (q.actor) {
      qb.andWhere(
        's.id IN ' +
          qb
            .subQuery()
            .select('sc.seriesMetadataId')
            .from(SeriesCast, 'sc')
            .where(`${SQL_FOLD}(sc.actorName) LIKE :actor`)
            .getQuery(),
      ).setParameter('actor', `%${foldForSearch(q.actor)}%`);
    }
    if (q.director) {
      qb.andWhere(
        's.id IN ' +
          qb
            .subQuery()
            .select('scr.seriesMetadataId')
            .from(SeriesCrew, 'scr')
            .where(
              `scr.role = 'Director' AND ${SQL_FOLD}(scr.personName) LIKE :director`,
            )
            .getQuery(),
      ).setParameter('director', `%${foldForSearch(q.director)}%`);
    }
    const rows = await qb.getMany();
    return rows.map((s) => ({
      seriesId: s.seriesId,
      imdbId: s.imdbId,
      tmdbId: s.tmdbId,
      title: s.title,
      yearStart: s.yearStart,
      yearEnd: s.yearEnd,
      rating: s.rating != null ? Number(s.rating) : undefined,
      imdbScore: s.imdbScore != null ? Number(s.imdbScore) : undefined,
      posterUrl: s.posterUrl,
      status: s.status,
    }));
  }

  /** Genre names keyed by provider seriesId (for a small set of ids). */
  async seriesGenresBySeriesIds(
    seriesIds: string[],
  ): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (seriesIds.length === 0) return map;
    const rows = await this.seriesGenreRepo
      .createQueryBuilder('g')
      .innerJoin(SeriesMetadata, 's', 's.id = g.seriesMetadataId')
      .select('s.seriesId', 'seriesId')
      .addSelect('g.genreName', 'genreName')
      .where('s.seriesId IN (:...ids)', { ids: seriesIds })
      .getRawMany<{ seriesId: string; genreName: string }>();
    for (const r of rows) {
      const arr = map.get(r.seriesId) ?? [];
      arr.push(r.genreName);
      map.set(r.seriesId, arr);
    }
    return map;
  }

  /** Group genre names by their parent metadata id, in one query. */
  private async genresFor(
    repo: Repository<MovieGenre | SeriesGenre>,
    fkColumn: 'movieMetadataId' | 'seriesMetadataId',
    ids: number[],
  ): Promise<Map<number, string[]>> {
    const byId = new Map<number, string[]>();
    if (ids.length === 0) return byId;
    const rows = (await repo.find({
      where: { [fkColumn]: In(ids) } as never,
    })) as unknown as Array<Record<string, unknown>>;
    for (const g of rows) {
      const key = g[fkColumn] as number;
      const arr = byId.get(key) ?? [];
      arr.push(g.genreName as string);
      byId.set(key, arr);
    }
    return byId;
  }

  private asIso(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : String(value);
  }

  /**
   * Check if TMDB API is configured
   */
  isConfigured(): boolean {
    return this.tmdbClient.isConfigured();
  }
}
