import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FavoritesPage } from './FavoritesPage';
import { renderWithProviders } from '../test/utils';
import * as client from '../api/client';
import type { FavoriteItem } from '../api/types';

vi.mock('../api/client');

const FAVORITES: FavoriteItem[] = [
  {
    channelId: 'bbc',
    addedAt: 'now',
    channel: { id: 'bbc', name: 'BBC News' },
  },
  {
    channelId: 'espn',
    addedAt: 'now',
    channel: { id: 'espn', name: 'ESPN' },
  },
];

beforeEach(() => {
  vi.mocked(client.getFavorites).mockResolvedValue(FAVORITES);
  vi.mocked(client.removeFavorite).mockResolvedValue();
});

afterEach(() => vi.clearAllMocks());

describe('FavoritesPage', () => {
  it('displays favorites from the API', async () => {
    renderWithProviders(<FavoritesPage />);
    expect(await screen.findByText('BBC News')).toBeInTheDocument();
    expect(screen.getByText('ESPN')).toBeInTheDocument();
  });

  it('removes a favorite when its button is clicked', async () => {
    vi.mocked(client.getFavorites)
      .mockResolvedValueOnce(FAVORITES)
      .mockResolvedValue([FAVORITES[1]]);

    const user = userEvent.setup();
    renderWithProviders(<FavoritesPage />);
    await screen.findByText('BBC News');

    await user.click(
      screen.getByRole('button', { name: 'Remove BBC News from favorites' }),
    );

    expect(client.removeFavorite).toHaveBeenCalledWith('bbc');
    await waitFor(() =>
      expect(screen.queryByText('BBC News')).not.toBeInTheDocument(),
    );
  });

  it('filters favorites client-side by name', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FavoritesPage />);
    await screen.findByText('BBC News');

    await user.type(screen.getByLabelText('Search favorites'), 'espn');

    expect(screen.queryByText('BBC News')).not.toBeInTheDocument();
    expect(screen.getByText('ESPN')).toBeInTheDocument();
  });
});
