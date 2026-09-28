import { ConflictException, NotFoundException } from '@nestjs/common';
import { ChannelsRepository } from '../channels/channels.repository';
import { Channel, FavoriteItem } from '../types/channel.types';
import { UsersService } from '../users/users.service';
import { FavoritesRepository } from './favorites.repository';
import { FavoritesService } from './favorites.service';

const CHANNEL: Channel = { id: 'cnn', name: 'CNN', url: 'http://x/cnn' };

function makeService(
  initial: FavoriteItem[] = [],
  isAllowed: UsersService['isAllowed'] = () => true,
) {
  const store = [...initial];
  const favorites: Partial<FavoritesRepository> = {
    findAll: () => store,
    has: (id) => store.some((i) => i.channelId === id),
    add: async (item) => {
      store.push(item);
    },
    remove: async (id) => {
      const before = store.length;
      const next = store.filter((i) => i.channelId !== id);
      store.length = 0;
      store.push(...next);
      return next.length !== before;
    },
  };
  const channels: Partial<ChannelsRepository> = {
    findById: (id) => (id === CHANNEL.id ? CHANNEL : undefined),
  };
  const users: Partial<UsersService> = { isAllowed };
  const service = new FavoritesService(
    favorites as FavoritesRepository,
    channels as ChannelsRepository,
    users as UsersService,
  );
  return { service, store };
}

describe('FavoritesService', () => {
  it('adds a channel and snapshots it', async () => {
    const { service } = makeService();
    const item = await service.add('cnn');
    expect(item.channelId).toBe('cnn');
    expect(item.channel).toEqual(CHANNEL);
    expect(item.addedAt).toBeDefined();
  });

  it('throws NotFound for an unknown channel', async () => {
    const { service } = makeService();
    await expect(service.add('nope')).rejects.toThrow(NotFoundException);
  });

  it('throws Conflict when the channel is already a favorite', async () => {
    const { service } = makeService([
      { channelId: 'cnn', addedAt: 'now', channel: CHANNEL },
    ]);
    await expect(service.add('cnn')).rejects.toThrow(ConflictException);
  });

  it('removes an existing favorite', async () => {
    const { service, store } = makeService([
      { channelId: 'cnn', addedAt: 'now', channel: CHANNEL },
    ]);
    await service.remove('cnn');
    expect(store).toHaveLength(0);
  });

  it('throws NotFound when removing an unknown favorite', async () => {
    const { service } = makeService();
    await expect(service.remove('cnn')).rejects.toThrow(NotFoundException);
  });

  it('refuses to bookmark a channel the profile may not see', async () => {
    const { service, store } = makeService([], () => false);
    await expect(service.add('cnn', 'kid')).rejects.toThrow(NotFoundException);
    expect(store).toHaveLength(0);
  });
});
