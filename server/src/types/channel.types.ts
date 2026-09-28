export interface Channel {
  /** Stable id derived from tvg-id or a hash of the stream URL. */
  id: string;
  name: string;
  url: string;
  logo?: string;
  group?: string;
  tvgId?: string;
  tvgName?: string;
}

export interface PlaylistMeta {
  source: 'url' | 'file' | 'xtream' | 'none';
  /** For 'xtream' this is the host only. */
  url?: string;
  importedAt?: string;
  channelCount: number;
  movieCount?: number;
  seriesCount?: number;
}

export interface FavoriteItem {
  /** Owning profile id; favorites are only shown to their own profile. */
  userId?: string;
  channelId: string;
  addedAt: string;
  /** Snapshot so favorites survive a playlist that no longer lists the channel. */
  channel: Channel;
}
