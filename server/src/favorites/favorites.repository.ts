import { Injectable, OnModuleInit } from '@nestjs/common';
import { join } from 'path';
import { readJson, writeJsonAtomic } from '../common/json-file';
import { FavoriteItem } from '../types/channel.types';

/**
 * Persists favorite channels to a JSON file. Each favorite stores a snapshot of
 * its channel, so it survives re-importing a playlist that no longer lists it.
 * Reads come from an in-memory cache; writes are serialized and atomic.
 */
@Injectable()
export class FavoritesRepository implements OnModuleInit {
  private items: FavoriteItem[] = [];
  private writeChain: Promise<void> = Promise.resolve();

  private get filePath(): string {
    return (
      process.env.FAVORITES_PATH ??
      join(process.cwd(), 'data', 'favorites.json')
    );
  }

  async onModuleInit(): Promise<void> {
    this.items = await readJson<FavoriteItem[]>(this.filePath, []);
  }

  findAll(userId?: string): FavoriteItem[] {
    return this.items.filter((i) => i.userId === userId);
  }

  has(channelId: string, userId?: string): boolean {
    return this.items.some(
      (i) => i.userId === userId && i.channelId === channelId,
    );
  }

  async add(item: FavoriteItem): Promise<void> {
    this.items = [...this.items, item];
    await this.persist();
  }

  /** Returns true if an item was removed. */
  async remove(channelId: string, userId?: string): Promise<boolean> {
    const next = this.items.filter(
      (i) => !(i.userId === userId && i.channelId === channelId),
    );
    if (next.length === this.items.length) {
      return false;
    }
    this.items = next;
    await this.persist();
    return true;
  }

  private persist(): Promise<void> {
    this.writeChain = this.writeChain.then(() =>
      writeJsonAtomic(this.filePath, this.items),
    );
    return this.writeChain;
  }
}
