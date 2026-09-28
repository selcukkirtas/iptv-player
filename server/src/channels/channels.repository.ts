import { Injectable, OnModuleInit } from '@nestjs/common';
import { join } from 'path';
import { readJson, writeJsonAtomic } from '../common/json-file';
import { Channel, PlaylistMeta } from '../types/channel.types';

interface ChannelStore {
  meta: PlaylistMeta;
  channels: Channel[];
}

const EMPTY: ChannelStore = {
  meta: { source: 'none', channelCount: 0 },
  channels: [],
};

/**
 * Persists the parsed channel catalog (and its playlist metadata) to a JSON
 * file. Reads come from an in-memory cache hydrated on startup; writes are
 * serialized and atomic.
 */
@Injectable()
export class ChannelsRepository implements OnModuleInit {
  private store: ChannelStore = EMPTY;
  private writeChain: Promise<void> = Promise.resolve();

  private get filePath(): string {
    return (
      process.env.CHANNELS_PATH ?? join(process.cwd(), 'data', 'channels.json')
    );
  }

  async onModuleInit(): Promise<void> {
    this.store = await readJson<ChannelStore>(this.filePath, EMPTY);
  }

  getMeta(): PlaylistMeta {
    return this.store.meta;
  }

  findAll(): Channel[] {
    return this.store.channels;
  }

  findById(id: string): Channel | undefined {
    return this.store.channels.find((c) => c.id === id);
  }

  groups(): string[] {
    const set = new Set<string>();
    for (const channel of this.store.channels) {
      if (channel.group) set.add(channel.group);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  async replace(channels: Channel[], meta: PlaylistMeta): Promise<void> {
    this.store = { channels, meta };
    await this.persist();
  }

  private persist(): Promise<void> {
    this.writeChain = this.writeChain.then(() =>
      writeJsonAtomic(this.filePath, this.store),
    );
    return this.writeChain;
  }
}
