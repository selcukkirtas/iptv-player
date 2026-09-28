import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SeriesPage } from './SeriesPage';
import { renderWithProviders } from '../test/utils';
import * as hooks from '../api/hooks';
import type { SeriesWithMetadata } from '../api/types';

vi.mock('../api/hooks');

const SERIES: SeriesWithMetadata[] = [
  {
    id: 's1',
    name: 'The Series',
    group: 'Drama',
    metadata: {
      yearStart: 2023,
      imdbScore: 7.8,
      cast: [{ actorName: 'Lead Actor' }],
      crew: [{ personName: 'Lead Director', role: 'Director' }],
      genres: [{ genreName: 'Drama' }],
    },
  },
];

beforeEach(() => {
  vi.mocked(hooks.useSeriesGroups).mockReturnValue({
    data: ['Drama'],
    isLoading: false,
  } as never);
  vi.mocked(hooks.useSeriesFilterOptions).mockReturnValue({
    data: {
      years: [2023],
      genres: ['Drama'],
      actors: ['Lead Actor'],
      directors: ['Lead Director'],
      ratingRange: { min: 0, max: 10 },
      imdbScoreRange: { min: 0, max: 10 },
    },
    isLoading: false,
  } as never);
  vi.mocked(hooks.usePlaylistMeta).mockReturnValue({
    data: { source: 'xtream', channelCount: 0, seriesCount: 1 },
    isLoading: false,
  } as never);
  vi.mocked(hooks.useSeriesList).mockReturnValue({
    data: { items: SERIES, total: 1 },
    isLoading: false,
    isError: false,
  } as never);
});

afterEach(() => vi.clearAllMocks());

describe('SeriesPage', () => {
  it('shows metadata filters in the search UI', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SeriesPage />);

    expect(await screen.findByText('The Series')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Year'), '2023');
    await user.selectOptions(screen.getByLabelText('Genre'), 'Drama');
    await user.type(screen.getByLabelText('Director'), 'Lead Director');

    await waitFor(() =>
      expect(screen.getByLabelText('Year')).toHaveValue('2023'),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Genre')).toHaveValue('Drama'),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Director')).toHaveValue('Lead Director'),
    );
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
  });
});
