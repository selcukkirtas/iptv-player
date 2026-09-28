import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as path from 'path';
import { MovieMetadata } from './entities/movie-metadata.entity';
import { MovieCast } from './entities/movie-cast.entity';
import { MovieCrew } from './entities/movie-crew.entity';
import { MovieGenre } from './entities/movie-genre.entity';
import { SeriesMetadata } from './entities/series-metadata.entity';
import { SeriesCast } from './entities/series-cast.entity';
import { SeriesCrew } from './entities/series-crew.entity';
import { SeriesGenre } from './entities/series-genre.entity';
import { MovieAudio } from './entities/movie-audio.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      // Persisted on the mounted volume (METADATA_DB_PATH) so TMDB enrichment
      // survives container rebuilds; falls back to a local dir for dev.
      database:
        process.env.METADATA_DB_PATH ??
        path.join(process.cwd(), 'data', 'metadata.db'),
      entities: [
        MovieMetadata,
        MovieCast,
        MovieCrew,
        MovieGenre,
        SeriesMetadata,
        SeriesCast,
        SeriesCrew,
        SeriesGenre,
        MovieAudio,
      ],
      synchronize: true,
      logging: process.env.NODE_ENV === 'development',
    }),
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
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
