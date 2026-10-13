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
  it('keeps the advanced filters behind a button, not on the page', async () => {
    renderWithProviders(<MoviesPage />);
    expect(await screen.findByText('The Movie')).toBeInTheDocument();

    // Search and Category stay inline; the other ten used to fill the screen.
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
    expect(screen.getByLabelText('Category')).toBeInTheDocument();
    expect(screen.queryByLabelText('Year')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Actor')).not.toBeInTheDocument();
  });

  it('applies metadata filters from the popup', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MoviesPage />);

    expect(await screen.findByText('The Movie')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

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
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeEnabled();

    // Closing keeps the filters applied and shows how many are set.
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Filters.*3 active/ }),
    ).toBeInTheDocument();
  });

  it('closes the popup with Escape', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MoviesPage />);
    await screen.findByText('The Movie');

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps a way out reachable however tall the filter list gets', async () => {
    // The dialog scrolls its *body*; the header and footer hold the only ways
    // to close it. When the body was not allowed to shrink, the panel grew past
    // its max-height and carried the footer off screen — on a tablet, with no
    // Escape key, that left the dialog impossible to close. Assert the
    // structure that keeps it reachable rather than the pixels, which jsdom
    // cannot measure.
    const user = userEvent.setup();
    renderWithProviders(<MoviesPage />);
    await screen.findByText('The Movie');
    await user.click(screen.getByRole('button', { name: /^Filters/ }));

    const dialog = await screen.findByRole('dialog');
    const scroller = dialog.querySelector('.filter-panel-body');
    const close = screen.getByRole('button', { name: 'Close filters' });
    const done = screen.getByRole('button', { name: 'Done' });

    expect(scroller).not.toBeNull();
    expect(scroller?.contains(close)).toBe(false);
    expect(scroller?.contains(done)).toBe(false);
    // Both live directly under the panel, as siblings of the scrolling body.
    expect(close.closest('.filter-panel')).toBe(dialog);
    expect(done.closest('.filter-panel')).toBe(dialog);
  });

  it('closes after a filter has been changed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MoviesPage />);
    await screen.findByText('The Movie');
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await screen.findByRole('dialog');

    // Changing a filter re-renders the page; closing must still work.
    await user.selectOptions(screen.getByLabelText('Year'), '2024');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
