import { NotFoundException } from '@nestjs/common';
import { Channel } from '../types/channel.types';
import { UsersService } from '../users/users.service';
import { ChannelsRepository } from './channels.repository';
import { ChannelsService } from './channels.service';

const CHANNELS: Channel[] = [
  { id: '1', name: 'BBC News', url: 'http://x/1', group: 'News' },
  { id: '2', name: 'CNN International', url: 'http://x/2', group: 'News' },
  { id: '3', name: 'ESPN', url: 'http://x/3', group: 'Sports' },
];

/** A UsersService stub that leaves every section unrestricted. */
const unrestrictedUsers: Partial<UsersService> = {
  groupFilter: () => () => true,
  filterGroups: (_id, _section, groups) => groups,
  isAllowed: () => true,
};

function makeService(channels = CHANNELS): ChannelsService {
  const repo: Partial<ChannelsRepository> = {
    findAll: () => channels,
    findById: (id) => channels.find((c) => c.id === id),
    groups: () =>
      Array.from(
        new Set(channels.map((c) => c.group).filter(Boolean)),
      ).sort() as string[],
  };
  return new ChannelsService(
    repo as ChannelsRepository,
    unrestrictedUsers as UsersService,
  );
}

describe('ChannelsService', () => {
  it('returns all channels with a total when no filter is given', () => {
    const result = makeService().search({});
    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(3);
  });

  it('filters by query case-insensitively on the name', () => {
    const result = makeService().search({ query: 'cnn' });
    expect(result.items.map((c) => c.id)).toEqual(['2']);
  });

  it('filters by exact group', () => {
    const result = makeService().search({ group: 'News' });
    expect(result.items.map((c) => c.id)).toEqual(['1', '2']);
  });

  it('combines query and group filters', () => {
    const result = makeService().search({ query: 'bbc', group: 'News' });
    expect(result.items.map((c) => c.id)).toEqual(['1']);
  });

  it('returns an empty result when nothing matches', () => {
    const result = makeService().search({ query: 'nope' });
    expect(result).toEqual({ items: [], total: 0 });
  });

  it('lists the distinct groups', () => {
    expect(makeService().groups()).toEqual(['News', 'Sports']);
  });

  it('getById returns the channel or throws NotFound', () => {
    const service = makeService();
    expect(service.getById('3').name).toBe('ESPN');
    expect(() => service.getById('missing')).toThrow(NotFoundException);
  });
});
