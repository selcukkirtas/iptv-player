import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { MovieCast } from './entities/movie-cast.entity';
import { MovieCrew } from './entities/movie-crew.entity';
import { MovieGenre } from './entities/movie-genre.entity';
import { MovieMetadata } from './entities/movie-metadata.entity';
import { SeriesCast } from './entities/series-cast.entity';
import { SeriesCrew } from './entities/series-crew.entity';
import { SeriesGenre } from './entities/series-genre.entity';
import { SeriesMetadata } from './entities/series-metadata.entity';

describe('database entities', () => {
  it('initialize TypeORM without entity metadata errors', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'iptv-metadata-'));
    const database = join(dir, 'metadata.db');
    const ds = new DataSource({
      type: 'better-sqlite3',
      database,
      entities: [
        MovieMetadata,
        MovieCast,
        MovieCrew,
        MovieGenre,
        SeriesMetadata,
        SeriesCast,
        SeriesCrew,
        SeriesGenre,
      ],
      synchronize: true,
    });

    await ds.initialize();
    await ds.destroy();
    await rm(dir, { recursive: true, force: true });
  });
});
