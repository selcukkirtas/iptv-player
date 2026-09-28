import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelsPage } from './ChannelsPage';
import { renderWithProviders } from '../test/utils';
import * as client from '../api/client';
import type { Channel } from '../api/types';

vi.mock('../api/client');

const CHANNELS: Channel[] = [
  { id: 'bbc', name: 'BBC News', group: 'News' },
  { id: 'espn', name: 'ESPN', group: 'Sports' },
  {
    id: 'xxx1',
    name: 'Naughty Channel',
    group: 'FOR ADULTS',
  },
];

beforeEach(() => {
  sessionStorage.clear();
  vi.mocked(client.searchChannels).mockImplementation(async (params) => {
    let items = CHANNELS;
    if (params.group) items = items.filter((c) => c.group === params.group);
    if (params.query)
      items = items.filter((c) =>
        c.name.toLowerCase().includes(params.query!.toLowerCase()),
      );
    return { items, total: items.length };
  });
  vi.mocked(client.getGroups).mockResolvedValue([
    'News',
    'Sports',
    'FOR ADULTS',
  ]);
  vi.mocked(client.getPlaylistMeta).mockResolvedValue({
    source: 'url',
    channelCount: 2,
  });
  vi.mocked(client.getFavorites).mockResolvedValue([]);
  vi.mocked(client.addFavorite).mockResolvedValue({
    channelId: 'bbc',
    addedAt: 'now',
    channel: CHANNELS[0],
  });
});

afterEach(() => vi.clearAllMocks());

describe('ChannelsPage', () => {
  it('renders the channel list from the API', async () => {
    renderWithProviders(<ChannelsPage />);
    expect(await screen.findByText('BBC News')).toBeInTheDocument();
    expect(screen.getByText('ESPN')).toBeInTheDocument();
  });

  it('filters the list via the search box (server query)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ChannelsPage />);
    await screen.findByText('BBC News');

    await user.type(screen.getByLabelText('Search'), 'espn');

    await waitFor(() =>
      expect(client.searchChannels).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'espn' }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByText('BBC News')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('ESPN')).toBeInTheDocument();
  });

  it('shows exactly what the server returns, with no client-side gate', async () => {
    // Category visibility belongs to the profile, enforced server-side. The
    // page must not second-guess it: a browser-side filter here only ever hid
    // content the server had already agreed to send, which looked like parental
    // control while providing none.
    renderWithProviders(<ChannelsPage />);
    await screen.findByText('BBC News');
    expect(screen.getByText('Naughty Channel')).toBeInTheDocument();
    expect(screen.queryByLabelText('PIN')).not.toBeInTheDocument();
  });

  it('requests a restricted category like any other', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ChannelsPage />);
    await screen.findByText('BBC News');

    await user.selectOptions(screen.getByLabelText('Category'), 'FOR ADULTS');

    await waitFor(() =>
      expect(client.searchChannels).toHaveBeenCalledWith(
        expect.objectContaining({ group: 'FOR ADULTS' }),
      ),
    );
    expect(await screen.findByText('Naughty Channel')).toBeInTheDocument();
    expect(screen.queryByLabelText('PIN')).not.toBeInTheDocument();
  });

  it('adds a channel to favorites when its star is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ChannelsPage />);
    await screen.findByText('BBC News');

    await user.click(
      screen.getByRole('button', { name: 'Add BBC News to favorites' }),
    );

    expect(client.addFavorite).toHaveBeenCalledWith('bbc');
  });
});
