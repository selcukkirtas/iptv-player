import { CatalogRepository } from '../catalog/catalog.repository';
import { CatalogService } from '../catalog/catalog.service';
import { ChannelsRepository } from '../channels/channels.repository';
import { XtreamService } from './xtream.service';
import { PlaylistsService } from './playlists.service';

describe('PlaylistsService metadata refresh', () => {
  it('schedules a metadata refresh after Xtream imports', async () => {
    const channels: Partial<ChannelsRepository> = {
      getMeta: () => ({ source: 'xtream', url: 'http://x', channelCount: 0 }),
      replace: jest.fn(),
    };
    const catalog: Partial<CatalogRepository> = {
      replace: jest.fn().mockResolvedValue(undefined),
    };
    const catalogService: Partial<CatalogService> = {
      refreshMetadata: jest.fn().mockResolvedValue(undefined),
    };
    const xtream: Partial<XtreamService> = {
      fetchLiveChannels: jest
        .fn()
        .mockResolvedValue([
          { id: '1', name: 'One', url: 'http://x/1', group: 'News' },
        ]),
      fetchMovies: jest
        .fn()
        .mockResolvedValue([
          { id: 'm1', name: 'Movie One', url: 'http://x/m1', ext: 'mp4' },
        ]),
      fetchSeries: jest
        .fn()
        .mockResolvedValue([{ id: 's1', name: 'Series One', group: 'Drama' }]),
    };

    const service = new PlaylistsService(
      channels as ChannelsRepository,
      catalog as CatalogRepository,
      catalogService as CatalogService,
      xtream as XtreamService,
    );

    const result = await service.importFromXtream(
      'http://panel',
      'user',
      'pass',
    );

    expect(result.source).toBe('xtream');
    expect(catalog.replace).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Array),
      expect.objectContaining({
        host: 'http://panel',
        username: 'user',
        password: 'pass',
      }),
    );
    expect(catalogService.refreshMetadata).toHaveBeenCalled();
  });
});
