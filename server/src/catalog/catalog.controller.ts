import { Controller, Get, Param, Query } from '@nestjs/common';
import { AdminOnly } from '../auth/public.decorator';
import { publicMovie, publicSeriesDetail } from '../common/public-view';
import { ActiveUserId } from '../users/active-user.decorator';
import { CatalogService } from './catalog.service';
import { SearchCatalogDto } from './dto/search-catalog.dto';

@Controller()
export class CatalogController {
  constructor(private readonly service: CatalogService) {}

  @Get('movies')
  async searchMovies(
    @Query() dto: SearchCatalogDto,
    @ActiveUserId() userId?: string,
  ) {
    const { items, total } = await this.service.searchMovies(dto, userId);
    return { items: items.map(publicMovie), total };
  }

  @Get('movies/filter-options')
  movieFilterOptions() {
    return this.service.getMovieFilterOptions();
  }

  @Get('movies/groups')
  movieGroups(@ActiveUserId() userId?: string) {
    return this.service.movieGroups(userId);
  }

  /** Every VOD category, unfiltered — for the profile-permission editor. */
  @AdminOnly()
  @Get('movies/all-groups')
  allMovieGroups() {
    return this.service.movieGroups(undefined);
  }

  /** Movies deduplicated by IMDb id, each with its playable versions. */
  @Get('movies/grouped')
  groupedMovies(
    @Query() dto: SearchCatalogDto,
    @ActiveUserId() userId?: string,
  ) {
    return this.service.browseGroupedMovies(dto, userId);
  }

  @Get('movies/:id')
  async getMovie(@Param('id') id: string, @ActiveUserId() userId?: string) {
    return publicMovie(await this.service.getMovie(id, userId));
  }

  @Get('series')
  searchSeries(
    @Query() dto: SearchCatalogDto,
    @ActiveUserId() userId?: string,
  ) {
    return this.service.searchSeries(dto, userId);
  }

  @Get('series/filter-options')
  seriesFilterOptions() {
    return this.service.getSeriesFilterOptions();
  }

  @Get('series/groups')
  seriesGroups(@ActiveUserId() userId?: string) {
    return this.service.seriesGroups(userId);
  }

  /** Every series category, unfiltered — for the profile-permission editor. */
  @AdminOnly()
  @Get('series/all-groups')
  allSeriesGroups() {
    return this.service.seriesGroups(undefined);
  }

  /** Series deduplicated by IMDb id, each with its provider versions. */
  @Get('series/grouped')
  groupedSeries(
    @Query() dto: SearchCatalogDto,
    @ActiveUserId() userId?: string,
  ) {
    return this.service.browseGroupedSeries(dto, userId);
  }

  @Get('series/:id')
  async getSeries(@Param('id') id: string, @ActiveUserId() userId?: string) {
    return publicSeriesDetail(await this.service.getSeriesDetail(id, userId));
  }
}
