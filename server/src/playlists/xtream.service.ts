import { Injectable } from '@nestjs/common';
import { UPSTREAM_USER_AGENT } from '../common/upstream';
import { Channel } from '../types/channel.types';
import {
  Episode,
  Movie,
  Series,
  SeriesSeason,
  XtreamAccount,
} from '../types/catalog.types';

const API_TIMEOUT_MS = 60_000;

interface XtreamCategory {
  category_id: string;
  category_name: string;
}

interface XtreamLiveStream {
  stream_id: number;
  name: string;
  stream_icon?: string;
  category_id?: string;
  epg_channel_id?: string | null;
}

interface XtreamVodStream {
  stream_id: number;
  name: string;
  stream_icon?: string;
  category_id?: string;
  container_extension?: string;
  rating_5based?: number;
}

interface XtreamSeries {
  series_id: number;
  name: string;
  cover?: string;
  plot?: string;
  genre?: string;
  category_id?: string;
}

interface XtreamEpisode {
  id: string | number;
  episode_num: number;
  title?: string;
  container_extension?: string;
}

interface XtreamSeriesInfo {
  episodes?: Record<string, XtreamEpisode[]>;
}

/**
 * Talks to an Xtream Codes panel via `player_api.php`. Pulls live channels, VOD
 * movies, and series metadata, and builds the matching stream URLs. Series
 * episodes are fetched per-series on demand (there can be 10k+ series).
 */
export function normalizeXtreamHost(host: string): string {
  const trimmed = host.trim();
  try {
    const url = new URL(trimmed);
    const pathname = url.pathname.replace(
      /\/+(xmltv|player_api|get)\.php$/i,
      '',
    );
    url.pathname = pathname === '/' ? '' : pathname.replace(/\/+$/, '');
    url.search = '';
    url.hash = '';
    return `${url.protocol}//${url.host}${url.pathname}`.replace(/\/+$/, '');
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
}

@Injectable()
export class XtreamService {
  async testConnection(
    host: string,
    username: string,
    password: string,
  ): Promise<{ ok: boolean; message: string }> {
    try {
      const base = this.normalizeHost(host);
      const accountInfo = await this.getJson<any>(
        this.api(base, username, password, 'get_account_info'),
      );
      if (!accountInfo) {
        return { ok: false, message: 'No account info returned' };
      }
      return { ok: true, message: 'Connection successful' };
    } catch (err) {
      return {
        ok: false,
        message: `Connection failed: ${(err as Error).message}`,
      };
    }
  }

  async fetchLiveChannels(
    host: string,
    username: string,
    password: string,
  ): Promise<Channel[]> {
    const base = this.normalizeHost(host);
    const categoryName = await this.categoryMap(
      base,
      username,
      password,
      'get_live_categories',
    );
    const streams = await this.getJson<XtreamLiveStream[]>(
      this.api(base, username, password, 'get_live_streams'),
    );

    return streams.map((s) => ({
      id: String(s.stream_id),
      name: s.name?.trim() || `Channel ${s.stream_id}`,
      url: `${base}/live/${this.creds(username, password)}/${s.stream_id}.m3u8`,
      logo: s.stream_icon || undefined,
      group: this.group(s.category_id, categoryName),
      tvgId: s.epg_channel_id || undefined,
    }));
  }

  async fetchMovies(
    host: string,
    username: string,
    password: string,
  ): Promise<Movie[]> {
    const base = this.normalizeHost(host);
    const categoryName = await this.categoryMap(
      base,
      username,
      password,
      'get_vod_categories',
    );
    const streams = await this.getJson<XtreamVodStream[]>(
      this.api(base, username, password, 'get_vod_streams'),
    );

    return streams.map((s) => {
      const ext = s.container_extension || 'mp4';
      return {
        id: String(s.stream_id),
        name: s.name?.trim() || `Movie ${s.stream_id}`,
        url: `${base}/movie/${this.creds(username, password)}/${s.stream_id}.${ext}`,
        ext,
        logo: s.stream_icon || undefined,
        group: this.group(s.category_id, categoryName),
        rating: s.rating_5based || undefined,
      };
    });
  }

  async fetchSeries(
    host: string,
    username: string,
    password: string,
  ): Promise<Series[]> {
    const base = this.normalizeHost(host);
    const categoryName = await this.categoryMap(
      base,
      username,
      password,
      'get_series_categories',
    );
    const series = await this.getJson<XtreamSeries[]>(
      this.api(base, username, password, 'get_series'),
    );

    return series.map((s) => ({
      id: String(s.series_id),
      name: s.name?.trim() || `Series ${s.series_id}`,
      cover: s.cover || undefined,
      group: this.group(s.category_id, categoryName),
      plot: s.plot || undefined,
      genre: s.genre || undefined,
    }));
  }

  /** Fetches one series' seasons + episodes (get_series_info). */
  async fetchSeriesEpisodes(
    account: XtreamAccount,
    seriesId: string,
  ): Promise<SeriesSeason[]> {
    const base = this.normalizeHost(account.host);
    const { username, password } = account;
    const info = await this.getJson<XtreamSeriesInfo>(
      `${this.api(base, username, password, 'get_series_info')}&series_id=${encodeURIComponent(seriesId)}`,
    );

    const bySeason = info.episodes ?? {};
    const seasons: SeriesSeason[] = Object.keys(bySeason)
      .map((key) => Number(key))
      .sort((a, b) => a - b)
      .map((seasonNum) => ({
        season: seasonNum,
        episodes: (bySeason[String(seasonNum)] ?? []).map((e) => {
          const ext = e.container_extension || 'mp4';
          return {
            id: String(e.id),
            title: e.title?.trim() || `Episode ${e.episode_num}`,
            season: seasonNum,
            episode: e.episode_num,
            url: `${base}/series/${this.creds(username, password)}/${e.id}.${ext}`,
            ext,
          } satisfies Episode;
        }),
      }));

    return seasons;
  }

  /**
   * The provider's own probe of a VOD's primary audio track (get_vod_info),
   * returning its language tag (e.g. 'tur') lowercased — no local ffprobe, just
   * one small JSON call. Returns null when the panel reports no language.
   */
  async fetchVodAudioLang(
    account: XtreamAccount,
    streamId: string,
  ): Promise<string | null> {
    const base = this.normalizeHost(account.host);
    const { username, password } = account;
    const data = await this.getJson<{
      info?: { audio?: { tags?: { language?: string } } };
    }>(
      `${this.api(base, username, password, 'get_vod_info')}&vod_id=${encodeURIComponent(streamId)}`,
    );
    const lang = data?.info?.audio?.tags?.language;
    return lang ? String(lang).toLowerCase().trim() : null;
  }

  private normalizeHost(host: string): string {
    return normalizeXtreamHost(host);
  }

  private creds(username: string, password: string): string {
    return `${encodeURIComponent(username)}/${encodeURIComponent(password)}`;
  }

  private api(
    base: string,
    username: string,
    password: string,
    action: string,
  ): string {
    return (
      `${base}/player_api.php?username=${encodeURIComponent(username)}` +
      `&password=${encodeURIComponent(password)}&action=${action}`
    );
  }

  private async categoryMap(
    base: string,
    username: string,
    password: string,
    action: string,
  ): Promise<Map<string, string>> {
    const categories = await this.getJson<XtreamCategory[]>(
      this.api(base, username, password, action),
    );
    return new Map(
      categories.map((c) => [String(c.category_id), c.category_name]),
    );
  }

  private group(
    categoryId: string | undefined,
    names: Map<string, string>,
  ): string | undefined {
    return categoryId ? names.get(String(categoryId)) : undefined;
  }

  private async getJson<T>(url: string): Promise<T> {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
      headers: { 'user-agent': UPSTREAM_USER_AGENT },
    });
    if (!resp.ok) {
      throw new Error(`Xtream API responded ${resp.status}`);
    }
    return (await resp.json()) as T;
  }
}
