import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChannelsRepository } from '../channels/channels.repository';
import { FavoriteItem } from '../types/channel.types';
import { UsersService } from '../users/users.service';
import { FavoritesRepository } from './favorites.repository';

@Injectable()
export class FavoritesService {
  constructor(
    private readonly favorites: FavoritesRepository,
    private readonly channels: ChannelsRepository,
    private readonly users: UsersService,
  ) {}

  list(userId?: string): FavoriteItem[] {
    return this.favorites.findAll(userId);
  }

  async add(channelId: string, userId?: string): Promise<FavoriteItem> {
    const channel = this.channels.findById(channelId);
    // Same 404 for "missing" and "not yours to see", so a restricted profile
    // cannot probe for the existence of hidden channels.
    if (!channel || !this.users.isAllowed(userId, 'channels', channel.group)) {
      throw new NotFoundException(`Unknown channel: ${channelId}`);
    }
    if (this.favorites.has(channelId, userId)) {
      throw new ConflictException('Channel is already in favorites');
    }
    const item: FavoriteItem = {
      userId,
      channelId,
      addedAt: new Date().toISOString(),
      channel,
    };
    await this.favorites.add(item);
    return item;
  }

  async remove(channelId: string, userId?: string): Promise<void> {
    const removed = await this.favorites.remove(channelId, userId);
    if (!removed) {
      throw new NotFoundException(`Unknown favorite: ${channelId}`);
    }
  }
}
