import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { MetadataService } from './metadata.service';

@Controller('api/metadata')
export class MetadataController {
  constructor(private readonly metadataService: MetadataService) {}

  /**
   * Get movie metadata by ID
   */
  @Get('movies/:movieId')
  async getMovieMetadata(@Param('movieId') movieId: string) {
    return this.metadataService.getMovieMetadata(movieId);
  }

  /**
   * Enrich movie with TMDB data (on-demand)
   */
  @Post('movies/:movieId/enrich')
  async enrichMovie(
    @Param('movieId') movieId: string,
    @Body() body: { title: string; year?: number },
  ) {
    if (!body.title) {
      throw new BadRequestException('title is required');
    }

    return this.metadataService.enrichMovie(movieId, body.title, body.year);
  }

  /**
   * Get series metadata by ID
   */
  @Get('series/:seriesId')
  async getSeriesMetadata(@Param('seriesId') seriesId: string) {
    return this.metadataService.getSeriesMetadata(seriesId);
  }

  /**
   * Enrich series with TMDB data (on-demand)
   */
  @Post('series/:seriesId/enrich')
  async enrichSeries(
    @Param('seriesId') seriesId: string,
    @Body() body: { title: string; year?: number },
  ) {
    if (!body.title) {
      throw new BadRequestException('title is required');
    }

    return this.metadataService.enrichSeries(seriesId, body.title, body.year);
  }

  /**
   * Search movies by actor name
   */
  @Get('search/movies/actor')
  async searchMoviesByActor(@Query('name') name: string) {
    if (!name) {
      throw new BadRequestException('name query param required');
    }

    return this.metadataService.searchMoviesByActor(name);
  }

  /**
   * Search movies by director name
   */
  @Get('search/movies/director')
  async searchMoviesByDirector(@Query('name') name: string) {
    if (!name) {
      throw new BadRequestException('name query param required');
    }

    return this.metadataService.searchMoviesByDirector(name);
  }

  /**
   * Search movies by genre
   */
  @Get('search/movies/genre')
  async searchMoviesByGenre(@Query('name') name: string) {
    if (!name) {
      throw new BadRequestException('name query param required');
    }

    return this.metadataService.searchMoviesByGenre(name);
  }

  /**
   * Search series by actor name
   */
  @Get('search/series/actor')
  async searchSeriesByActor(@Query('name') name: string) {
    if (!name) {
      throw new BadRequestException('name query param required');
    }

    return this.metadataService.searchSeriesByActor(name);
  }

  /**
   * Search series by director name
   */
  @Get('search/series/director')
  async searchSeriesByDirector(@Query('name') name: string) {
    if (!name) {
      throw new BadRequestException('name query param required');
    }

    return this.metadataService.searchSeriesByDirector(name);
  }

  /**
   * Search series by genre
   */
  @Get('search/series/genre')
  async searchSeriesByGenre(@Query('name') name: string) {
    if (!name) {
      throw new BadRequestException('name query param required');
    }

    return this.metadataService.searchSeriesByGenre(name);
  }
}
