import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportPage } from './ImportPage';
import { renderWithProviders } from '../test/utils';
import * as client from '../api/client';

vi.mock('../api/client');

beforeEach(() => {
  vi.mocked(client.getPlaylistMeta).mockResolvedValue({
    source: 'none',
    channelCount: 0,
  });
  vi.mocked(client.importPlaylistUrl).mockResolvedValue({
    source: 'url',
    url: 'http://x/list.m3u',
    channelCount: 42,
    importedAt: new Date().toISOString(),
  });
  vi.mocked(client.refreshMetadata).mockResolvedValue({ started: true });
});

afterEach(() => vi.clearAllMocks());

describe('ImportPage', () => {
  it('imports a playlist from a URL and shows the result', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ImportPage />);

    await user.type(
      screen.getByLabelText('M3U / M3U8 URL'),
      'http://x/list.m3u',
    );
    await user.click(screen.getByRole('button', { name: 'Import from URL' }));

    expect(client.importPlaylistUrl).toHaveBeenCalledWith('http://x/list.m3u');
    expect(
      await screen.findByText('Imported 42 channels.'),
    ).toBeInTheDocument();
  });

  it('disables the URL button until a URL is entered', async () => {
    renderWithProviders(<ImportPage />);
    expect(
      screen.getByRole('button', { name: 'Import from URL' }),
    ).toBeDisabled();
  });

  it('triggers a TMDB metadata sync from the import page', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ImportPage />);

    await user.click(
      screen.getByRole('button', { name: 'Sync TMDB metadata' }),
    );

    expect(client.refreshMetadata).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText('TMDB metadata sync started.'),
    ).toBeInTheDocument();
  });
});
