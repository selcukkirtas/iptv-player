import { Injectable, NotFoundException } from '@nestjs/common';
import { CatalogRepository } from '../catalog/catalog.repository';
import { ChannelsRepository } from '../channels/channels.repository';
import { XtreamService } from '../playlists/xtream.service';
import { SeriesSeason } from '../types/catalog.types';
import { UsersService } from '../users/users.service';
import { MediaRef, ResolvedMedia, parseMediaRef } from './media-source';

/** Episodes come from a provider round-trip; cache them briefly per series. */
const EPISODE_TTL_MS = 5 * 60_000;

/**
 * Turns a client-supplied media reference into the upstream URL to fetch,
 * refusing anything the active profile is not allowed to watch. This is the
 * single place a playable URL enters the system: the stream proxy and the
 * ffmpeg sessions all go through it, so category permissions apply to playback
 * and not merely to browsing, and no caller can name an arbitrary URL.
 */
@Injectable()
export class MediaResolverService {
  private readonly episodeCache = new Map<
    string,
    { seasons: SeriesSeason[]; at: number }
  >();

  constructor(
    private readonly channels: ChannelsRepository,
    private readonly catalog: CatalogRepository,
    private readonly xtream: XtreamService,
    private readonly users: UsersService,
  ) {}

  /**
   * Parse and resolve in one step. Rejects with 400 on a malformed ref and 404
   * on one the profile may not play — async so callers have a single failure
   * channel to await rather than a sync throw plus a rejection.
   */
  async resolveSource(src: string, userId?: string): Promise<ResolvedMedia> {
    return this.resolve(parseMediaRef(src), userId);
  }

  async resolve(ref: MediaRef, userId?: string): Promise<ResolvedMedia> {
    switch (ref.kind) {
      case 'channel':
        return this.resolveChannel(ref, userId);
      case 'movie':
        return this.resolveMovie(ref, userId);
      case 'episode':
        return this.resolveEpisode(ref, userId);
    }
  }

  private resolveChannel(ref: MediaRef, userId?: string): ResolvedMedia {
    const channel = this.channels.findById(ref.id);
    if (!channel || !this.users.isAllowed(userId, 'channels', channel.group)) {
      throw new NotFoundException(`Unknown channel: ${ref.id}`);
    }
    return { ref, url: channel.url, group: channel.group };
  }

  private resolveMovie(ref: MediaRef, userId?: string): ResolvedMedia {
    const movie = this.catalog.findMovie(ref.id);
    if (!movie || !this.users.isAllowed(userId, 'movies', movie.group)) {
      throw new NotFoundException(`Unknown movie: ${ref.id}`);
    }
    return { ref, url: movie.url, ext: movie.ext, group: movie.group };
  }

  private async resolveEpisode(
    ref: MediaRef,
    userId?: string,
  ): Promise<ResolvedMedia> {
    const seriesId = ref.seriesId as string;
    const series = this.catalog.findSeries(seriesId);
    if (!series || !this.users.isAllowed(userId, 'series', series.group)) {
      throw new NotFoundException(`Unknown series: ${seriesId}`);
    }

    const seasons = await this.seasons(seriesId);
    for (const season of seasons) {
      const episode = season.episodes.find((e) => e.id === ref.id);
      if (episode) {
        return {
          ref,
          url: episode.url,
          ext: episode.ext,
          group: series.group,
        };
      }
    }
    throw new NotFoundException(`Unknown episode: ${ref.id}`);
  }

  private async seasons(seriesId: string): Promise<SeriesSeason[]> {
    const hit = this.episodeCache.get(seriesId);
    if (hit && Date.now() - hit.at < EPISODE_TTL_MS) return hit.seasons;

    const account = this.catalog.account();
    if (!account) {
      throw new NotFoundException('No Xtream account on record for episodes');
    }
    const seasons = await this.xtream.fetchSeriesEpisodes(account, seriesId);
    this.episodeCache.set(seriesId, { seasons, at: Date.now() });
    return seasons;
  }
}
