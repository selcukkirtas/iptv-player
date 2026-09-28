import {
  Injectable,
  NotFoundException,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { XtreamService } from '../playlists/xtream.service';
import {
  foldForSearch,
  foldedEquals,
  foldedIncludes,
} from '../common/search-fold';
import { isAdultGroup } from '../users/adult';
import { UsersService } from '../users/users.service';
import { MetadataService, SortIndex } from '../metadata/metadata.service';
import {
  Movie,
  Series,
  MovieWithMetadata,
  SeriesWithMetadata,
  SeriesDetailWithMetadata,
  GroupedMovie,
  GroupedSeries,
} from '../types/catalog.types';
import { CatalogRepository } from './catalog.repository';
import { isSubtitled, parseCatalogName } from './catalog-name';
import { SearchCatalogDto } from './dto/search-catalog.dto';

const DEFAULT_PAGE_SIZE = Number(process.env.CATALOG_PAGE_LIMIT ?? 60);
const MAX_PAGE_SIZE = 200;

/**
 * Whether to start metadata work as soon as the server comes up.
 *
 * On a desktop this is convenient. On a small host — a Raspberry Pi serving the
 * house — it is the opposite: a 64k catalogue means tens of thousands of TMDB
 * lookups and one Xtream call per film, each with a pacing delay, all competing
 * with playback for CPU, network and SD-card writes for hours after every
 * restart. Set `AUTO_ENRICH_ON_BOOT=false` there and run the sync by hand from
 * the admin console (or enrich on a faster machine and copy the DB over).
 */
const AUTO_ENRICH_ON_BOOT = process.env.AUTO_ENRICH_ON_BOOT !== 'false';

interface SearchResult<T> {
  items: T[];
  total: number;
}

/** Whether the request carries any metadata-based filter (needs DB lookups). */
function hasMetadataFilter(dto: SearchCatalogDto): boolean {
  return (
    dto.year !== undefined ||
    !!dto.genre ||
    !!dto.actor ||
    !!dto.director ||
    dto.minRating !== undefined ||
    dto.maxRating !== undefined ||
    dto.minImdbScore !== undefined ||
    dto.maxImdbScore !== undefined
  );
}

@Injectable()
export class CatalogService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CatalogService.name);
  private enrichmentTask: Promise<void> | null = null;

  constructor(
    private readonly repo: CatalogRepository,
    private readonly xtream: XtreamService,
    private readonly users: UsersService,
    private readonly metadata: MetadataService,
  ) {}

  /**
   * On startup, enrich all movies and series with metadata in background.
   * Uses onApplicationBootstrap (not onModuleInit) so it runs *after* every
   * module's onModuleInit — importantly after CatalogRepository has hydrated
   * the catalog from vod.json; otherwise repo.movies() would be empty here.
   */
  onApplicationBootstrap(): void {
    if (!AUTO_ENRICH_ON_BOOT) {
      this.logger.log(
        'AUTO_ENRICH_ON_BOOT=false — skipping metadata enrichment and the ' +
          'audio-language probe. Trigger them from the admin console.',
      );
      return;
    }
    // Start background enrichment; don't block bootstrap on it.
    void this.refreshMetadata();
    // Independently probe VOD audio languages via the Xtream panel.
    void this.enrichAudioLanguagesInBackground().catch((err) =>
      this.logger.error(`Audio-language probe failed: ${err}`),
    );
  }

  /**
   * Populate each movie's primary audio-track language from the Xtream panel's
   * own probe (get_vod_info) — one light JSON call per movie, no ffprobe. Runs
   * in the background alongside TMDB enrichment; already-probed movies skip.
   */
  private async enrichAudioLanguagesInBackground(): Promise<void> {
    const account = this.repo.account();
    if (!account) {
      this.logger.debug('No Xtream account on record; skipping audio probe');
      return;
    }
    const movies = this.repo.movies();
    this.logger.log(
      `Probing audio languages for ${movies.length} movies (get_vod_info)...`,
    );
    let probed = 0;
    let withLang = 0;
    for (const movie of movies) {
      if (await this.metadata.hasMovieAudio(movie.id)) continue;
      let lang: string | null = null;
      try {
        lang = await this.xtream.fetchVodAudioLang(
          account,
          this.streamIdOf(movie),
        );
      } catch {
        lang = null;
      }
      await this.metadata.setMovieAudio(movie.id, lang);
      probed++;
      if (lang) withLang++;
      await this.rateLimitDelay();
    }
    this.logger.log(
      `Audio-language probe done: ${probed} probed, ${withLang} with a language`,
    );
  }

  /** Xtream stream id for a movie (from its URL, falling back to its id). */
  private streamIdOf(movie: Movie): string {
    const m = movie.url.match(/\/movie\/[^/]+\/[^/]+\/(\d+)\./);
    return m ? m[1] : movie.id;
  }

  refreshMetadata(): Promise<void> {
    if (this.enrichmentTask) {
      return this.enrichmentTask;
    }

    this.enrichmentTask = this.enrichAllMetadataInBackground().finally(() => {
      this.enrichmentTask = null;
    });
    return this.enrichmentTask;
  }

  /**
   * Background enrichment process - doesn't block server startup.
   *
   * Movies and series are enriched *interleaved* (round-robin) rather than all
   * movies first, so series metadata starts appearing early instead of only
   * after the (much larger) movie catalog finishes. Series, being far fewer,
   * complete well before the movie pass does.
   */
  private async enrichAllMetadataInBackground(): Promise<void> {
    if (!this.metadata.isConfigured()) {
      this.logger.debug('TMDB not configured, skipping metadata enrichment');
      return;
    }

    this.logger.log('Starting background metadata enrichment...');

    try {
      const movies = this.repo.movies();
      const series = this.repo.series();
      this.logger.log(
        `Found ${movies.length} movies and ${series.length} series, enriching (interleaved)...`,
      );

      let moviesEnriched = 0;
      let seriesEnriched = 0;
      let mi = 0;
      let si = 0;

      while (mi < movies.length || si < series.length) {
        if (mi < movies.length) {
          const r = await this.enrichCatalogItem('movie', movies[mi++]);
          if (r.enriched) moviesEnriched++;
          if (r.processed) await this.rateLimitDelay();
        }
        if (si < series.length) {
          const r = await this.enrichCatalogItem('series', series[si++]);
          if (r.enriched) seriesEnriched++;
          if (r.processed) await this.rateLimitDelay();
        }
      }

      this.logger.log(
        `Enrichment complete: ${moviesEnriched} movies, ${seriesEnriched} series enriched`,
      );
    } catch (error) {
      this.logger.error(`Error during background enrichment: ${error}`);
    }
  }

  /**
   * Enrich a single catalog item unless it already has metadata.
   * `processed` is false when skipped (so callers can avoid the rate-limit
   * delay for a no-op); `enriched` is true only on a fresh TMDB match.
   */
  private async enrichCatalogItem(
    kind: 'movie' | 'series',
    item: { id: string; name: string; group?: string },
  ): Promise<{ processed: boolean; enriched: boolean }> {
    // Age-restricted sections are deliberately left out of the metadata DB.
    // TMDB hides adult titles from search anyway, so every one of these would
    // be a request that cannot match — on a 64k catalogue that is thousands of
    // pointless calls (and rate-limit pauses) per sync.
    if (isAdultGroup(item.group)) return { processed: false, enriched: false };

    const existing =
      kind === 'movie'
        ? await this.metadata.getMovieMetadata(item.id)
        : await this.metadata.getSeriesMetadata(item.id);
    if (existing) return { processed: false, enriched: false };

    const { title, year } = parseCatalogName(item.name);
    const result =
      kind === 'movie'
        ? await this.metadata.enrichMovie(item.id, title, year)
        : await this.metadata.enrichSeries(item.id, title, year);

    if (result) {
      this.logger.debug(`✓ Enriched ${kind}: ${item.name}`);
      return { processed: true, enriched: true };
    }
    this.logger.debug(`⊘ Could not enrich ${kind}: ${item.name}`);
    return { processed: true, enriched: false };
  }

  /** TMDB request pacing between enrichment calls. */
  private rateLimitDelay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 200));
  }

  async searchMovies(
    dto: SearchCatalogDto,
    userId?: string,
  ): Promise<SearchResult<MovieWithMetadata>> {
    return this.searchMoviesWithMetadata(dto, userId);
  }

  async searchSeries(
    dto: SearchCatalogDto,
    userId?: string,
  ): Promise<SearchResult<SeriesWithMetadata>> {
    return this.searchSeriesWithMetadata(dto, userId);
  }

  movieGroups(userId?: string): string[] {
    return this.users.filterGroups(userId, 'movies', this.repo.movieGroups());
  }

  seriesGroups(userId?: string): string[] {
    return this.users.filterGroups(userId, 'series', this.repo.seriesGroups());
  }

  async getMovie(id: string, userId?: string): Promise<MovieWithMetadata> {
    const movie = this.repo.findMovie(id);
    if (!movie || !this.users.isAllowed(userId, 'movies', movie.group)) {
      throw new NotFoundException(`Unknown movie: ${id}`);
    }

    const movieWithMetadata: MovieWithMetadata = { ...movie };

    // Enrich with TMDB metadata if available
    const metaData = await this.metadata.getMovieMetadata(id);
    if (metaData) {
      movieWithMetadata.metadata = {
        plot: metaData.plot,
        year: metaData.year,
        runtime: metaData.runtime,
        rating: metaData.rating,
        imdbScore: metaData.imdbScore,
        posterUrl: metaData.posterUrl,
        cast: metaData.cast,
        crew: metaData.crew,
        genres: metaData.genres,
      };
    }

    return movieWithMetadata;
  }

  /** Series metadata + seasons/episodes fetched on demand from the panel. */
  async getSeriesDetail(
    id: string,
    userId?: string,
  ): Promise<SeriesDetailWithMetadata> {
    const series = this.repo.findSeries(id);
    if (!series || !this.users.isAllowed(userId, 'series', series.group)) {
      throw new NotFoundException(`Unknown series: ${id}`);
    }
    const account = this.repo.account();
    if (!account) {
      throw new NotFoundException('No Xtream account on record for episodes');
    }

    const seasons = await this.xtream.fetchSeriesEpisodes(account, id);
    const seriesWithMetadata: SeriesDetailWithMetadata = {
      ...series,
      seasons,
    };

    // Enrich with TMDB metadata if available
    const metaData = await this.metadata.getSeriesMetadata(id);
    if (metaData) {
      seriesWithMetadata.metadata = {
        yearStart: metaData.yearStart,
        yearEnd: metaData.yearEnd,
        rating: metaData.rating,
        imdbScore: metaData.imdbScore,
        posterUrl: metaData.posterUrl,
        cast: metaData.cast,
        crew: metaData.crew,
        genres: metaData.genres,
      };
    }

    return seriesWithMetadata;
  }

  /**
   * Get available filter options (for frontend dropdown). Computed with a few
   * aggregate queries against the metadata DB — see MetadataService.
   */
  getMovieFilterOptions() {
    return this.metadata.movieFilterOptions();
  }

  private async searchMoviesWithMetadata(
    dto: SearchCatalogDto,
    userId?: string,
  ): Promise<SearchResult<MovieWithMetadata>> {
    let items = this.repo.movies();

    // User permission filter
    const visible = this.users.groupFilter(userId, 'movies');
    items = items.filter((i) => visible(i.group));

    // Group filter
    if (dto.group) {
      items = items.filter((i) => i.group === dto.group);
    }

    // Text search
    if (dto.query) {
      const q = dto.query;
      items = items.filter((i) => foldedIncludes(i.name, q));
    }

    // Metadata filters (year/genre/actor/director/rating) need a DB lookup each.
    if (hasMetadataFilter(dto)) {
      const filtered: Movie[] = [];
      for (const item of items) {
        const meta = await this.metadata.getMovieMetadata(item.id);
        if (!meta) continue;
        if (dto.year !== undefined && meta.year !== dto.year) continue;
        if (
          dto.genre &&
          !meta.genres.some((g) => foldedEquals(g.genreName, dto.genre!))
        )
          continue;
        if (
          dto.actor &&
          !meta.cast.some((c) => foldedIncludes(c.actorName, dto.actor!))
        )
          continue;
        if (
          dto.director &&
          !meta.crew.some(
            (c) =>
              c.role === 'Director' &&
              foldedIncludes(c.personName, dto.director!),
          )
        )
          continue;
        if (
          dto.minRating !== undefined &&
          (meta.rating == null || meta.rating < dto.minRating)
        )
          continue;
        if (
          dto.maxRating !== undefined &&
          (meta.rating == null || meta.rating > dto.maxRating)
        )
          continue;
        if (
          dto.minImdbScore !== undefined &&
          (meta.imdbScore == null || meta.imdbScore < dto.minImdbScore)
        )
          continue;
        if (
          dto.maxImdbScore !== undefined &&
          (meta.imdbScore == null || meta.imdbScore > dto.maxImdbScore)
        )
          continue;
        filtered.push(item);
      }
      items = filtered;
    }

    // Subtitle (category/name heuristic) and audio-language (provider probe).
    if (dto.subtitled === 'true') {
      items = items.filter((i) => isSubtitled(i.group, i.name));
    }
    if (dto.audioLang) {
      const audioIndex = await this.metadata.movieAudioIndex();
      items = items.filter((i) => audioIndex.get(i.id) === dto.audioLang);
    }

    // Sort the whole result set, then paginate, then enrich just the page.
    await this.sortCatalog(items, dto.sort, () =>
      this.metadata.movieSortIndex(),
    );
    const total = items.length;
    const { start, limit } = this.pageWindow(dto);
    const pageItems = items.slice(start, start + limit);

    // One query for the whole page, not one per row.
    const metaById = await this.metadata.getMovieMetadataMany(
      pageItems.map((item) => item.id),
    );
    const enriched = pageItems.map((item): MovieWithMetadata => {
      const meta = metaById.get(item.id);
      if (!meta) return { ...item };
      return {
        ...item,
        metadata: {
          plot: meta.plot,
          year: meta.year,
          runtime: meta.runtime,
          rating: meta.rating,
          imdbScore: meta.imdbScore,
          posterUrl: meta.posterUrl,
          // Cast and crew are a detail-page concern; a listing card never shows
          // them, and joining them is what made these pages slow.
          genres: meta.genres,
        },
      };
    });
    return { items: enriched, total };
  }

  /**
   * Browse movies deduplicated by IMDb id: one entry per unique film, each
   * carrying its playable provider "versions". Powers the Database screen so
   * the same title isn't listed once per quality/language copy.
   */
  async browseGroupedMovies(
    dto: SearchCatalogDto,
    userId?: string,
  ): Promise<SearchResult<GroupedMovie>> {
    // Filter at the DB by genre/year/rating; title search is applied in JS
    // below so it matches the Turkish provider title too, not just TMDB's.
    const rows = await this.metadata.listMoviesForGrouping({
      genre: dto.genre,
      year: dto.year,
      minRating: dto.minRating,
      actor: dto.actor,
      director: dto.director,
    });

    const audioIndex = dto.audioLang
      ? await this.metadata.movieAudioIndex()
      : null;
    const wantSubtitled = dto.subtitled === 'true';
    // Grouped browsing is a listing like any other: a profile must not see
    // titles from categories it is not allowed into.
    const visible = this.users.groupFilter(userId, 'movies');

    const groups = new Map<string, GroupedMovie>();
    for (const r of rows) {
      const movie = this.repo.findMovie(r.movieId);
      const vname = movie?.name ?? r.title;
      const vgroup = movie?.group;
      if (!visible(vgroup)) continue;
      // Version-level audio/subtitle filters: a group only forms from, and
      // shows, its versions that pass.
      if (audioIndex && audioIndex.get(r.movieId) !== dto.audioLang) continue;
      if (wantSubtitled && !isSubtitled(vgroup, vname)) continue;

      const key = r.imdbId
        ? `imdb:${r.imdbId}`
        : r.tmdbId
          ? `tmdb:${r.tmdbId}`
          : `title:${foldForSearch(r.title)}|${r.year ?? ''}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          imdbId: r.imdbId,
          tmdbId: r.tmdbId,
          title: r.title,
          tmdbTitle: r.title,
          year: r.year,
          rating: r.rating,
          imdbScore: r.imdbScore,
          posterUrl: r.posterUrl,
          genres: [],
          versionCount: 0,
          versions: [],
        };
        groups.set(key, group);
      }
      group.versions.push({
        movieId: r.movieId,
        name: vname,
        group: vgroup,
        ext: movie?.ext,
      });
      group.versionCount++;
      if (!group.posterUrl && r.posterUrl) group.posterUrl = r.posterUrl;
    }

    let list = Array.from(groups.values());
    for (const g of list) {
      g.versions.sort((a, b) => a.name.localeCompare(b.name));
      // Prefer the provider (Turkish) title for display; keep TMDB as secondary.
      g.title =
        parseCatalogName(g.versions[0].name).title || g.tmdbTitle || g.title;
    }
    list = this.filterGroupsByQuery(list, dto.query);
    this.sortGroupedMovies(list, dto.sort);

    const total = list.length;
    const { start, limit } = this.pageWindow(dto);
    const pageGroups = list.slice(start, start + limit);

    // Genres for the visible page's representative entries only.
    const repIds = pageGroups.map((g) => g.versions[0].movieId);
    const genresByMovieId = await this.metadata.movieGenresByMovieIds(repIds);
    for (const g of pageGroups) {
      g.genres = genresByMovieId.get(g.versions[0].movieId) ?? [];
    }

    return { items: pageGroups, total };
  }

  private sortGroupedMovies(list: GroupedMovie[], sort?: string): void {
    this.sortGroupedList(list, sort, (g) => g.year);
  }

  /**
   * Browse series deduplicated by IMDb id: one entry per unique show, each
   * carrying its provider "versions" (which open at /series/:seriesId).
   */
  async browseGroupedSeries(
    dto: SearchCatalogDto,
    userId?: string,
  ): Promise<SearchResult<GroupedSeries>> {
    const rows = await this.metadata.listSeriesForGrouping({
      genre: dto.genre,
      year: dto.year,
      minRating: dto.minRating,
      actor: dto.actor,
      director: dto.director,
    });

    const wantSubtitled = dto.subtitled === 'true';
    const visible = this.users.groupFilter(userId, 'series');

    const groups = new Map<string, GroupedSeries>();
    for (const r of rows) {
      const series = this.repo.findSeries(r.seriesId);
      const vname = series?.name ?? r.title;
      const vgroup = series?.group;
      if (!visible(vgroup)) continue;
      if (wantSubtitled && !isSubtitled(vgroup, vname)) continue;

      const key = r.imdbId
        ? `imdb:${r.imdbId}`
        : r.tmdbId
          ? `tmdb:${r.tmdbId}`
          : `title:${foldForSearch(r.title)}|${r.yearStart ?? ''}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          imdbId: r.imdbId,
          tmdbId: r.tmdbId,
          title: r.title,
          tmdbTitle: r.title,
          yearStart: r.yearStart,
          yearEnd: r.yearEnd,
          rating: r.rating,
          imdbScore: r.imdbScore,
          posterUrl: r.posterUrl,
          status: r.status,
          genres: [],
          versionCount: 0,
          versions: [],
        };
        groups.set(key, group);
      }
      group.versions.push({
        seriesId: r.seriesId,
        name: vname,
        group: vgroup,
      });
      group.versionCount++;
      if (!group.posterUrl && r.posterUrl) group.posterUrl = r.posterUrl;
    }

    let list = Array.from(groups.values());
    for (const g of list) {
      g.versions.sort((a, b) => a.name.localeCompare(b.name));
      g.title =
        parseCatalogName(g.versions[0].name).title || g.tmdbTitle || g.title;
    }
    list = this.filterGroupsByQuery(list, dto.query);
    this.sortGroupedList(list, dto.sort, (g) => g.yearStart);

    const total = list.length;
    const { start, limit } = this.pageWindow(dto);
    const pageGroups = list.slice(start, start + limit);

    const repIds = pageGroups.map((g) => g.versions[0].seriesId);
    const genresBySeriesId =
      await this.metadata.seriesGenresBySeriesIds(repIds);
    for (const g of pageGroups) {
      g.genres = genresBySeriesId.get(g.versions[0].seriesId) ?? [];
    }

    return { items: pageGroups, total };
  }

  /** Case-insensitive title search over both the provider and TMDB titles. */
  private filterGroupsByQuery<T extends { title: string; tmdbTitle?: string }>(
    list: T[],
    query?: string,
  ): T[] {
    const q = query?.trim();
    if (!q) return list;
    return list.filter(
      (g) => foldedIncludes(g.title, q) || foldedIncludes(g.tmdbTitle ?? '', q),
    );
  }

  /** Sort a grouped list in place by title/year/rating (default: rating). */
  private sortGroupedList<T extends { title: string; imdbScore?: number }>(
    list: T[],
    sort: string | undefined,
    yearOf: (item: T) => number | undefined,
  ): void {
    switch (sort) {
      case 'title':
        list.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'title_desc':
        list.sort((a, b) => b.title.localeCompare(a.title));
        break;
      case 'year':
        list.sort((a, b) => (yearOf(b) ?? -1) - (yearOf(a) ?? -1));
        break;
      case 'rating':
      default:
        list.sort((a, b) => (b.imdbScore ?? -1) - (a.imdbScore ?? -1));
    }
  }

  /** Sort catalog items in place by title/year/rating (default: provider order). */
  private async sortCatalog(
    items: Array<{ id: string; name: string }>,
    sort: string | undefined,
    indexFn: () => Promise<SortIndex>,
  ): Promise<void> {
    switch (sort) {
      case 'title':
        items.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'title_desc':
        items.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'year':
      case 'rating': {
        const index = await indexFn();
        items.sort(
          (a, b) =>
            (index.get(b.id)?.[sort] ?? -1) - (index.get(a.id)?.[sort] ?? -1),
        );
        break;
      }
      default:
        break; // provider order
    }
  }

  private pageWindow(dto: SearchCatalogDto): { start: number; limit: number } {
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, dto.limit ?? DEFAULT_PAGE_SIZE),
    );
    const page = Math.max(1, dto.page ?? 1);
    return { start: (page - 1) * limit, limit };
  }

  private async searchSeriesWithMetadata(
    dto: SearchCatalogDto,
    userId?: string,
  ): Promise<SearchResult<SeriesWithMetadata>> {
    let items = this.repo.series();

    // User permission filter
    const visible = this.users.groupFilter(userId, 'series');
    items = items.filter((i) => visible(i.group));

    // Group filter
    if (dto.group) {
      items = items.filter((i) => i.group === dto.group);
    }

    // Text search
    if (dto.query) {
      const q = dto.query;
      items = items.filter((i) => foldedIncludes(i.name, q));
    }

    // Metadata filters (year/genre/actor/director/rating) need a DB lookup each.
    if (hasMetadataFilter(dto)) {
      const filtered: Series[] = [];
      for (const item of items) {
        const meta = await this.metadata.getSeriesMetadata(item.id);
        if (!meta) continue;
        if (dto.year !== undefined) {
          const yearInRange =
            (meta.yearStart && meta.yearStart <= dto.year) ||
            (meta.yearEnd && meta.yearEnd >= dto.year);
          if (!yearInRange) continue;
        }
        if (
          dto.genre &&
          !meta.genres.some((g) => foldedEquals(g.genreName, dto.genre!))
        )
          continue;
        if (
          dto.actor &&
          !meta.cast.some((c) => foldedIncludes(c.actorName, dto.actor!))
        )
          continue;
        if (
          dto.director &&
          !meta.crew.some(
            (c) =>
              c.role === 'Director' &&
              foldedIncludes(c.personName, dto.director!),
          )
        )
          continue;
        if (
          dto.minRating !== undefined &&
          (meta.rating == null || meta.rating < dto.minRating)
        )
          continue;
        if (
          dto.maxRating !== undefined &&
          (meta.rating == null || meta.rating > dto.maxRating)
        )
          continue;
        if (
          dto.minImdbScore !== undefined &&
          (meta.imdbScore == null || meta.imdbScore < dto.minImdbScore)
        )
          continue;
        if (
          dto.maxImdbScore !== undefined &&
          (meta.imdbScore == null || meta.imdbScore > dto.maxImdbScore)
        )
          continue;
        filtered.push(item);
      }
      items = filtered;
    }

    if (dto.subtitled === 'true') {
      items = items.filter((i) => isSubtitled(i.group, i.name));
    }

    // Sort the whole result set, then paginate, then enrich just the page.
    await this.sortCatalog(items, dto.sort, () =>
      this.metadata.seriesSortIndex(),
    );
    const total = items.length;
    const { start, limit } = this.pageWindow(dto);
    const pageItems = items.slice(start, start + limit);

    // One query for the whole page, not one per row.
    const metaById = await this.metadata.getSeriesMetadataMany(
      pageItems.map((item) => item.id),
    );
    const enriched = pageItems.map((item): SeriesWithMetadata => {
      const meta = metaById.get(item.id);
      if (!meta) return { ...item };
      return {
        ...item,
        metadata: {
          yearStart: meta.yearStart,
          yearEnd: meta.yearEnd,
          rating: meta.rating,
          imdbScore: meta.imdbScore,
          posterUrl: meta.posterUrl,
          genres: meta.genres,
        },
      };
    });
    return { items: enriched, total };
  }

  /**
   * Get available filter options for series (for frontend dropdown). Computed
   * with aggregate queries against the metadata DB — see MetadataService.
   */
  getSeriesFilterOptions() {
    return this.metadata.seriesFilterOptions();
  }
}
