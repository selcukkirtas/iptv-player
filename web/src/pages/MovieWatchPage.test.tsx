import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MovieWatchPage } from './MovieWatchPage';
import { renderWithProviders } from '../test/utils';
import * as hooks from '../api/hooks';

vi.mock('../api/hooks');
vi.mock('../components/VideoPlayer', () => ({
  VideoPlayer: () => <div>VideoPlayer</div>,
}));
vi.mock('../components/TrackPanel', () => ({
  TrackPanel: () => <div>TrackPanel</div>,
}));

beforeEach(() => {
  vi.mocked(hooks.useMovie).mockReturnValue({
    data: {
      id: 'm1',
      name: 'The Movie',
      url: 'http://x/m1',
      ext: 'mp4',
      group: 'Drama',
      metadata: {
        year: 2024,
        imdbScore: 8.1,
        rating: 7.5,
        plot: 'Plot',
        runtime: 120,
        cast: [{ actorName: 'Actor One' }],
        crew: [{ personName: 'Director One', role: 'Director' }],
        genres: [{ genreName: 'Drama' }],
      },
    },
    isLoading: false,
    isError: false,
  } as never);
  vi.mocked(hooks.useProgress).mockReturnValue({
    data: [],
    isLoading: false,
  } as never);
  vi.mocked(hooks.useSaveProgress).mockReturnValue({
    mutate: vi.fn(),
  } as never);
});

afterEach(() => vi.clearAllMocks());

describe('MovieWatchPage', () => {
  it('renders metadata chips that link back to movie filters', async () => {
    renderWithProviders(<MovieWatchPage />, { route: '/movies/m1' });

    expect(await screen.findByText('The Movie')).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'TMDB metadata' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Year 2024' })).toHaveAttribute(
      'href',
      '/movies?year=2024',
    );
    expect(
      screen.getByRole('link', { name: 'Director: Director One' }),
    ).toHaveAttribute('href', '/movies?director=Director+One');
    expect(
      screen.getByRole('link', { name: 'Actor: Actor One' }),
    ).toHaveAttribute('href', '/movies?actor=Actor+One');
    expect(screen.getByRole('link', { name: 'Genre: Drama' })).toHaveAttribute(
      'href',
      '/movies?genre=Drama',
    );
  });
});
