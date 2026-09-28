import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CatalogRepository } from '../catalog/catalog.repository';
import { ChannelsRepository } from '../channels/channels.repository';
import { XtreamService } from '../playlists/xtream.service';
import { UsersService } from '../users/users.service';
import { MediaResolverService } from './media-resolver.service';

const CHANNEL = {
  id: 'ch1',
  name: 'Kids TV',
  url: 'http://provider.tv/live/u/p/1.ts',
  group: 'Cizgi',
};
const ADULT_CHANNEL = {
  id: 'ch2',
  name: 'Adult TV',
  url: 'http://provider.tv/live/u/p/2.ts',
  group: 'Yetiskin',
};
const MOVIE = {
  id: 'm1',
  name: 'Film',
  url: 'http://provider.tv/movie/u/p/1.mkv',
  ext: 'mkv',
  group: 'Aksiyon',
};

describe('MediaResolverService', () => {
  let channels: jest.Mocked<Pick<ChannelsRepository, 'findById'>>;
  let catalog: jest.Mocked<
    Pick<CatalogRepository, 'findMovie' | 'findSeries' | 'account'>
  >;
  let xtream: jest.Mocked<Pick<XtreamService, 'fetchSeriesEpisodes'>>;
  let users: jest.Mocked<Pick<UsersService, 'isAllowed'>>;
  let service: MediaResolverService;

  beforeEach(() => {
    channels = {
      findById: jest.fn((id: string) =>
        id === CHANNEL.id
          ? CHANNEL
          : id === ADULT_CHANNEL.id
            ? ADULT_CHANNEL
            : undefined,
      ),
    } as never;
    catalog = {
      findMovie: jest.fn((id: string) => (id === MOVIE.id ? MOVIE : undefined)),
      findSeries: jest.fn((id: string) =>
        id === 's1' ? { id: 's1', name: 'Dizi', group: 'Drama' } : undefined,
      ),
      account: jest.fn(() => ({
        host: 'http://provider.tv',
        username: 'u',
        password: 'p',
      })),
    } as never;
    xtream = {
      fetchSeriesEpisodes: jest.fn().mockResolvedValue([
        {
          season: 1,
          episodes: [
            {
              id: 'e1',
              title: 'Bolum 1',
              season: 1,
              episode: 1,
              url: 'http://provider.tv/series/u/p/e1.mkv',
              ext: 'mkv',
            },
          ],
        },
      ]),
    } as never;
    users = { isAllowed: jest.fn(() => true) } as never;

    service = new MediaResolverService(
      channels as never,
      catalog as never,
      xtream as never,
      users as never,
    );
  });

  it('resolves a channel to its upstream URL', async () => {
    await expect(service.resolveSource('channel:ch1')).resolves.toMatchObject({
      url: CHANNEL.url,
      group: 'Cizgi',
    });
  });

  it('resolves a movie with its container extension', async () => {
    await expect(service.resolveSource('movie:m1')).resolves.toMatchObject({
      url: MOVIE.url,
      ext: 'mkv',
    });
  });

  it('resolves an episode through the series it belongs to', async () => {
    await expect(service.resolveSource('episode:s1:e1')).resolves.toMatchObject(
      { url: 'http://provider.tv/series/u/p/e1.mkv', ext: 'mkv' },
    );
  });

  it('caches a series lookup instead of re-querying the provider', async () => {
    await service.resolveSource('episode:s1:e1');
    await service.resolveSource('episode:s1:e1');
    expect(xtream.fetchSeriesEpisodes).toHaveBeenCalledTimes(1);
  });

  describe('permissions', () => {
    it('hides a channel the profile may not watch', async () => {
      users.isAllowed.mockImplementation(
        (_u, _section, group) => group !== 'Yetiskin',
      );
      await expect(service.resolveSource('channel:ch2', 'kid')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('hides a movie in a forbidden category', async () => {
      users.isAllowed.mockReturnValue(false);
      await expect(service.resolveSource('movie:m1', 'kid')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('hides an episode when its series is forbidden', async () => {
      users.isAllowed.mockReturnValue(false);
      await expect(
        service.resolveSource('episode:s1:e1', 'kid'),
      ).rejects.toThrow(NotFoundException);
      expect(xtream.fetchSeriesEpisodes).not.toHaveBeenCalled();
    });

    it('checks the section the entry actually belongs to', async () => {
      await service.resolveSource('movie:m1', 'u1');
      expect(users.isAllowed).toHaveBeenCalledWith('u1', 'movies', 'Aksiyon');
    });
  });

  describe('rejects anything that is not a catalog reference', () => {
    it.each([
      'http://evil.example/x.m3u8',
      'file:///etc/passwd',
      'channel',
      '',
    ])('%p', async (src) => {
      await expect(service.resolveSource(src)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('404s an unknown id rather than fetching it', async () => {
      await expect(service.resolveSource('channel:nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
