import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { CatalogRepository } from '../catalog/catalog.repository';
import { CatalogService } from '../catalog/catalog.service';
import { ChannelsRepository } from '../channels/channels.repository';
import { UPSTREAM_USER_AGENT } from '../common/upstream';
import { parseM3U } from '../m3u/m3u-parser';
import { Channel, PlaylistMeta } from '../types/channel.types';
import { XtreamAccount } from '../types/catalog.types';
import { XtreamService } from './xtream.service';

const FETCH_TIMEOUT_MS = 180_000;

/** Imports playlists (M3U URL, M3U file, or Xtream Codes) into the store. */
@Injectable()
export class PlaylistsService {
  private readonly logger = new Logger(PlaylistsService.name);

  constructor(
    private readonly channels: ChannelsRepository,
    private readonly catalog: CatalogRepository,
    private readonly catalogService: CatalogService,
    private readonly xtream: XtreamService,
  ) {}

  async refreshMetadata(): Promise<void> {
    return this.catalogService.refreshMetadata();
  }

  async testXtreamConnection(
    host: string,
    username: string,
    password: string,
  ): Promise<{ ok: boolean; message: string }> {
    return this.xtream.testConnection(host, username, password);
  }

  getMeta(): PlaylistMeta {
    return this.channels.getMeta();
  }

  /** The stored Xtream account, so the import form can be pre-filled. */
  getXtreamAccount(): XtreamAccount | null {
    return this.catalog.account() ?? null;
  }

  async importFromUrl(url: string): Promise<PlaylistMeta> {
    const content = await this.fetchPlaylist(url);
    return this.store(parseM3U(content), { source: 'url', url });
  }

  async importFromContent(content: string): Promise<PlaylistMeta> {
    return this.store(parseM3U(content), { source: 'file' });
  }

  /**
   * Imports live channels, VOD movies, and series from an Xtream Codes panel.
   * Live channels go to the channel store; movies + series (and the account,
   * for on-demand episode fetching) go to the catalog store.
   */
  async importFromXtream(
    host: string,
    username: string,
    password: string,
  ): Promise<PlaylistMeta> {
    try {
      this.logger.log(`Starting Xtream import from: ${host}`);

      // Sequential: the subscription may allow only one connection.
      this.logger.debug('Fetching live channels...');
      const channels = await this.xtream.fetchLiveChannels(
        host,
        username,
        password,
      );
      this.logger.debug(`✓ Fetched ${channels.length} live channels`);

      this.logger.debug('Fetching movies...');
      const movies = await this.xtream.fetchMovies(host, username, password);
      this.logger.debug(`✓ Fetched ${movies.length} movies`);

      this.logger.debug('Fetching series...');
      const series = await this.xtream.fetchSeries(host, username, password);
      this.logger.debug(`✓ Fetched ${series.length} series`);

      this.logger.debug('Saving catalog...');
      const saveStart = Date.now();
      await this.catalog.replace(movies, series, {
        host: host.replace(/\/+$/, ''),
        username,
        password,
      });
      const saveDuration = Date.now() - saveStart;
      this.logger.debug(`✓ Catalog saved in ${saveDuration}ms`);

      this.logger.debug(
        'Starting background metadata enrichment (non-blocking)...',
      );
      // Start metadata enrichment in background without waiting
      void this.catalogService
        .refreshMetadata()
        .then(() => {
          this.logger.log('✓ Background metadata enrichment completed');
        })
        .catch((err) => {
          this.logger.error(`Background metadata enrichment failed: ${err}`);
        });

      const result = this.store(
        channels,
        { source: 'xtream', url: host.replace(/\/+$/, '') },
        { movieCount: movies.length, seriesCount: series.length },
      );
      this.logger.debug(
        `Returning response before background tasks complete...`,
      );

      this.logger.log(
        `✓ Xtream import completed: ${channels.length} channels, ${movies.length} movies, ${series.length} series`,
      );
      return result;
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadGatewayException(
        `Could not reach the Xtream panel: ${(err as Error).message}`,
      );
    }
  }

  private async fetchPlaylist(url: string): Promise<string> {
    try {
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { 'user-agent': UPSTREAM_USER_AGENT },
      });
      if (!resp.ok) {
        throw new Error(`upstream responded ${resp.status}`);
      }
      return await resp.text();
    } catch (err) {
      throw new BadGatewayException(
        `Could not fetch playlist: ${(err as Error).message}`,
      );
    }
  }

  private async store(
    channels: Channel[],
    partial: Pick<PlaylistMeta, 'source' | 'url'>,
    extra: Pick<PlaylistMeta, 'movieCount' | 'seriesCount'> = {},
  ): Promise<PlaylistMeta> {
    if (channels.length === 0) {
      throw new BadRequestException(
        'No channels found — check the URL/credentials or playlist format.',
      );
    }
    const meta: PlaylistMeta = {
      ...partial,
      ...extra,
      importedAt: new Date().toISOString(),
      channelCount: channels.length,
    };
    await this.channels.replace(channels, meta);
    return meta;
  }
}
