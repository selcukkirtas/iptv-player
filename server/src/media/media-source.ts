import { BadRequestException } from '@nestjs/common';

/** What kind of catalog entry a playable source points at. */
export type MediaKind = 'channel' | 'movie' | 'episode';

/**
 * A reference to something playable in our own catalog. Clients send these
 * instead of upstream URLs, so the server — not the browser — decides what a
 * profile is allowed to play, and provider credentials never leave the host.
 *
 *   channel:<channelId>
 *   movie:<movieId>
 *   episode:<seriesId>:<episodeId>
 */
export interface MediaRef {
  kind: MediaKind;
  /** Channel / movie / episode id. */
  id: string;
  /** Owning series — set for `episode` only. */
  seriesId?: string;
}

/** Resolved playable source: the upstream URL plus what it came from. */
export interface ResolvedMedia {
  ref: MediaRef;
  url: string;
  /** Container extension for VOD (mkv, mp4, …); absent for live channels. */
  ext?: string;
  /** Category the entry belongs to — carried for logging/diagnostics. */
  group?: string;
}

export function formatMediaRef(ref: MediaRef): string {
  return ref.kind === 'episode'
    ? `episode:${ref.seriesId}:${ref.id}`
    : `${ref.kind}:${ref.id}`;
}

/**
 * Parses a `kind:id` source reference. Ids may themselves contain colons
 * (provider ids are not sanitized), so only the leading segments are split off.
 */
export function parseMediaRef(src: string): MediaRef {
  const raw = (src ?? '').trim();
  if (!raw) throw new BadRequestException('src is required');

  const firstColon = raw.indexOf(':');
  if (firstColon <= 0) {
    throw new BadRequestException(`Malformed media source: ${raw}`);
  }
  const kind = raw.slice(0, firstColon);
  const rest = raw.slice(firstColon + 1);
  if (!rest) throw new BadRequestException(`Malformed media source: ${raw}`);

  if (kind === 'channel' || kind === 'movie') {
    return { kind, id: rest };
  }
  if (kind === 'episode') {
    const sep = rest.indexOf(':');
    if (sep <= 0 || sep === rest.length - 1) {
      throw new BadRequestException(
        'An episode source needs the form episode:<seriesId>:<episodeId>',
      );
    }
    return {
      kind: 'episode',
      seriesId: rest.slice(0, sep),
      id: rest.slice(sep + 1),
    };
  }
  throw new BadRequestException(`Unknown media kind: ${kind}`);
}
