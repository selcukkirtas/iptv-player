import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SeriesDetailPage } from './SeriesDetailPage';
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
  vi.mocked(hooks.useSeriesDetail).mockReturnValue({
    data: {
      id: 's1',
      name: 'The Series',
      group: 'Drama',
      seasons: [],
      metadata: {
        yearStart: 2023,
        yearEnd: 2024,
        imdbScore: 7.8,
        plot: 'Plot',
        cast: [{ actorName: 'Lead Actor' }],
        crew: [{ personName: 'Lead Director', role: 'Director' }],
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

describe('SeriesDetailPage', () => {
  it('renders metadata chips that link back to series filters', async () => {
    renderWithProviders(<SeriesDetailPage />, { route: '/series/s1' });

    expect(await screen.findByText('The Series')).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'TMDB metadata' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start 2023' })).toHaveAttribute(
      'href',
      '/series?year=2023',
    );
    expect(
      screen.getByRole('link', { name: 'Director: Lead Director' }),
    ).toHaveAttribute('href', '/series?director=Lead+Director');
    expect(
      screen.getByRole('link', { name: 'Actor: Lead Actor' }),
    ).toHaveAttribute('href', '/series?actor=Lead+Actor');
    expect(screen.getByRole('link', { name: 'Genre: Drama' })).toHaveAttribute(
      'href',
      '/series?genre=Drama',
    );
  });
});
