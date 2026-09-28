import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
import { MetadataService } from './metadata.service';
import { MetadataController } from './metadata.controller';
import { MetadataBrowseController } from './metadata-browse.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MovieMetadata,
      MovieCast,
      MovieCrew,
      MovieGenre,
      SeriesMetadata,
      SeriesCast,
      SeriesCrew,
      SeriesGenre,
      MovieAudio,
    ]),
  ],
  providers: [TMDBClientService, MetadataService],
  controllers: [MetadataController, MetadataBrowseController],
  exports: [MetadataService],
})
export class MetadataModule {}
