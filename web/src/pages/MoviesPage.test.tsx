import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MoviesPage } from './MoviesPage';
import { renderWithProviders } from '../test/utils';
import * as hooks from '../api/hooks';
import type { MovieWithMetadata } from '../api/types';

vi.mock('../api/hooks');

const MOVIES: MovieWithMetadata[] = [
  {
    id: 'm1',
    name: 'The Movie',
    ext: 'mp4',
    group: 'Drama',
    metadata: {
      year: 2024,
      imdbScore: 8.1,
      rating: 7.5,
      cast: [{ actorName: 'Actor One' }],
      crew: [{ personName: 'Director One', role: 'Director' }],
      genres: [{ genreName: 'Drama' }],
    },
  },
];

beforeEach(() => {
  vi.mocked(hooks.useMovieGroups).mockReturnValue({
    data: ['Drama'],
    isLoading: false,
  } as never);
  vi.mocked(hooks.useMovieFilterOptions).mockReturnValue({
    data: {
      years: [2024],
      genres: ['Drama'],
      actors: ['Actor One'],
      directors: ['Director One'],
      ratingRange: { min: 0, max: 10 },
      imdbScoreRange: { min: 0, max: 10 },
    },
    isLoading: false,
  } as never);
  vi.mocked(hooks.usePlaylistMeta).mockReturnValue({
    data: { source: 'xtream', channelCount: 0, movieCount: 1 },
    isLoading: false,
  } as never);
  vi.mocked(hooks.useMovies).mockReturnValue({
    data: { items: MOVIES, total: 1 },
    isLoading: false,
    isError: false,
  } as never);
});

afterEach(() => vi.clearAllMocks());

describe('MoviesPage', () => {
  it('shows metadata filters in the search UI', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MoviesPage />);

    expect(await screen.findByText('The Movie')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Year'), '2024');
    await user.selectOptions(screen.getByLabelText('Genre'), 'Drama');
    await user.type(screen.getByLabelText('Actor'), 'Actor One');

    await waitFor(() =>
      expect(screen.getByLabelText('Year')).toHaveValue('2024'),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Genre')).toHaveValue('Drama'),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Actor')).toHaveValue('Actor One'),
    );
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
  });
});
