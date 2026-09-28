import { CatalogRepository } from './catalog.repository';
import { CatalogService } from './catalog.service';
import {
  MetadataService,
  type MovieMetadataDTO,
  type SeriesMetadataDTO,
} from '../metadata/metadata.service';
import { XtreamService } from '../playlists/xtream.service';
import { UsersService } from '../users/users.service';
import type { Movie, Series } from '../types/catalog.types';

const MOVIES: Movie[] = [
  {
    id: 'm1',
    name: 'The Alpha Movie',
    group: 'Drama',
    url: 'http://x/m1',
    ext: 'mp4',
  },
  {
    id: 'm2',
    name: 'Space Tale',
    group: 'Sci-Fi',
    url: 'http://x/m2',
    ext: 'mp4',
  },
];

const SERIES: Series[] = [
  {
    id: 's1',
    name: 'The Beta Series',
    group: 'Drama',
  },
  {
    id: 's2',
    name: 'Mystery Road',
    group: 'Thriller',
  },
];

const movieMetadata: Record<string, MovieMetadataDTO | undefined> = {
  m1: {
    id: 1,
    movieId: 'm1',
    title: 'The Alpha Movie',
    year: 2024,
    rating: 7.4,
    imdbScore: 8.2,
    cast: [{ actorName: 'Great Actor' }],
    crew: [{ personName: 'Great Director', role: 'Director' }],
    genres: [{ genreName: 'Drama' }],
  },
  m2: {
    id: 2,
    movieId: 'm2',
    title: 'Space Tale',
    year: 2022,
    rating: 6.1,
    imdbScore: 6.9,
    cast: [{ actorName: 'Space Lead' }],
    crew: [{ personName: 'Sci Director', role: 'Director' }],
    genres: [{ genreName: 'Sci-Fi' }],
  },
};

const seriesMetadata: Record<string, SeriesMetadataDTO | undefined> = {
  s1: {
    id: 3,
    seriesId: 's1',
    title: 'The Beta Series',
    yearStart: 2023,
    yearEnd: 2024,
    rating: 8.1,
    imdbScore: 8.4,
    cast: [{ actorName: 'Series Star' }],
    crew: [{ personName: 'Series Director', role: 'Director' }],
    genres: [{ genreName: 'Drama' }],
  },
  s2: {
    id: 4,
    seriesId: 's2',
    title: 'Mystery Road',
    yearStart: 2021,
    yearEnd: 2021,
    rating: 7.1,
    imdbScore: 7.2,
    cast: [{ actorName: 'Road Lead' }],
    crew: [{ personName: 'Thriller Director', role: 'Director' }],
    genres: [{ genreName: 'Thriller' }],
  },
};

const unrestrictedUsers: Partial<UsersService> = {
  groupFilter: () => () => true,
  isAllowed: () => true,
};

function makeService(): CatalogService {
  const repo: Partial<CatalogRepository> = {
    movies: () => MOVIES,
    series: () => SERIES,
    movieGroups: () => ['Drama', 'Sci-Fi'],
    seriesGroups: () => ['Drama', 'Thriller'],
  };
  const emptyRange = { min: 0, max: 10 };
  const metadata: Partial<MetadataService> = {
    getMovieMetadata: async (id: string) => movieMetadata[id] ?? null,
    getSeriesMetadata: async (id: string) => seriesMetadata[id] ?? null,
    // Listings fetch a whole page in one query; mirror that here.
    getMovieMetadataMany: async (ids: string[]) => {
      const out = new Map<string, MovieMetadataDTO>();
      for (const id of ids) {
        const meta = movieMetadata[id];
        if (meta) out.set(id, meta);
      }
      return out;
    },
    getSeriesMetadataMany: async (ids: string[]) => {
      const out = new Map<string, SeriesMetadataDTO>();
      for (const id of ids) {
        const meta = seriesMetadata[id];
        if (meta) out.set(id, meta);
      }
      return out;
    },
    // Filter options now come from aggregate DB queries in MetadataService;
    // at the CatalogService layer we just verify it delegates through.
    movieFilterOptions: async () => ({
      years: [2024, 2022],
      genres: ['Drama', 'Sci-Fi'],
      actors: [],
      directors: [],
      ratingRange: emptyRange,
      imdbScoreRange: emptyRange,
      audioLangs: [],
    }),
    seriesFilterOptions: async () => ({
      years: [],
      genres: ['Drama', 'Thriller'],
      actors: [],
      directors: [],
      ratingRange: emptyRange,
      imdbScoreRange: emptyRange,
      audioLangs: [],
    }),
  };
  return new CatalogService(
    repo as CatalogRepository,
    {} as XtreamService,
    unrestrictedUsers as UsersService,
    metadata as MetadataService,
  );
}

describe('CatalogService search and metadata options', () => {
  it('filters movie titles with contains matching', async () => {
    const service = makeService();
    const result = await service.searchMovies({ query: 'alpha' });
    expect(result.items.map((item) => item.id)).toEqual(['m1']);
  });

  it('filters movie actors and directors with contains matching', async () => {
    const service = makeService();
    const byActor = await service.searchMovies({ actor: 'great' });
    const byDirector = await service.searchMovies({ director: 'director' });

    expect(byActor.items.map((item) => item.id)).toEqual(['m1']);
    expect(byDirector.items.map((item) => item.id)).toEqual(['m1', 'm2']);
  });

  it('fills genre options from stored metadata', async () => {
    const service = makeService();
    const movieOptions = await service.getMovieFilterOptions();
    const seriesOptions = await service.getSeriesFilterOptions();

    expect(movieOptions.genres).toEqual(['Drama', 'Sci-Fi']);
    expect(seriesOptions.genres).toEqual(['Drama', 'Thriller']);
  });
});
