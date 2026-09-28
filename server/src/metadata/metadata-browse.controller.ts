import { Controller, Get, Query } from '@nestjs/common';
import { MetadataBrowseQuery, MetadataService } from './metadata.service';

/**
 * Read-only browse API over the persisted TMDB metadata DB, powering the
 * "Database" inspection screen (search + filters + pagination).
 *
 * NB: served at /api/metadata (the older MetadataController is mis-prefixed
 * as `api/metadata`, i.e. /api/api/metadata, and is unused by the frontend).
 */
@Controller('metadata')
export class MetadataBrowseController {
  constructor(private readonly svc: MetadataService) {}

  @Get('stats')
  stats() {
    return this.svc.metadataStats();
  }

  @Get('genres')
  genres(@Query('type') type?: string) {
    return type === 'series'
      ? this.svc.seriesGenreNames()
      : this.svc.movieGenreNames();
  }

  @Get('movies')
  movies(
    @Query('query') query?: string,
    @Query('genre') genre?: string,
    @Query('year') year?: string,
    @Query('minRating') minRating?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.browseMovies(
      parseBrowseQuery({ query, genre, year, minRating, sort, page, limit }),
    );
  }

  @Get('series')
  series(
    @Query('query') query?: string,
    @Query('genre') genre?: string,
    @Query('year') year?: string,
    @Query('minRating') minRating?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.browseSeries(
      parseBrowseQuery({ query, genre, year, minRating, sort, page, limit }),
    );
  }
}

function parseBrowseQuery(
  raw: Record<string, string | undefined>,
): MetadataBrowseQuery {
  const num = (v?: string): number | undefined => {
    if (v === undefined || v.trim() === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const sort =
    raw.sort === 'title' || raw.sort === 'year' || raw.sort === 'rating'
      ? raw.sort
      : undefined;
  return {
    query: raw.query?.trim() || undefined,
    genre: raw.genre?.trim() || undefined,
    year: num(raw.year),
    minRating: num(raw.minRating),
    sort,
    page: num(raw.page),
    limit: num(raw.limit),
  };
}
