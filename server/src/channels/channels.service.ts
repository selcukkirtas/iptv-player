import { Injectable, NotFoundException } from '@nestjs/common';
import { foldedIncludes } from '../common/search-fold';
import { Channel } from '../types/channel.types';
import { UsersService } from '../users/users.service';
import { ChannelsRepository } from './channels.repository';
import { SearchChannelsDto } from './dto/search-channels.dto';

export interface ChannelSearchResult {
  items: Channel[];
  total: number;
}

/**
 * Cap on returned items. Provider playlists can hold 100k+ entries (live + VOD);
 * sending and rendering them all would freeze the browser, so we return a
 * capped page with the real `total` and let the UI prompt the user to refine.
 */
const MAX_RESULTS = Number(process.env.CHANNELS_PAGE_LIMIT ?? 500);

/** Business logic for browsing the imported channel catalog. */
@Injectable()
export class ChannelsService {
  constructor(
    private readonly repo: ChannelsRepository,
    private readonly users: UsersService,
  ) {}

  search(dto: SearchChannelsDto, userId?: string): ChannelSearchResult {
    let items = this.repo.findAll();

    // Restrict to the active profile's visible categories first.
    const visible = this.users.groupFilter(userId, 'channels');
    items = items.filter((c) => visible(c.group));

    if (dto.group) {
      items = items.filter((c) => c.group === dto.group);
    }

    if (dto.query) {
      const q = dto.query;
      items = items.filter((c) => foldedIncludes(c.name, q));
    }

    return { items: items.slice(0, MAX_RESULTS), total: items.length };
  }

  groups(userId?: string): string[] {
    return this.users.filterGroups(userId, 'channels', this.repo.groups());
  }

  getById(id: string, userId?: string): Channel {
    const channel = this.repo.findById(id);
    if (!channel || !this.users.isAllowed(userId, 'channels', channel.group)) {
      throw new NotFoundException(`Unknown channel: ${id}`);
    }
    return channel;
  }
}
