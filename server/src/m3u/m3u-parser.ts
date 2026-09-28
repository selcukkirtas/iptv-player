import { createHash } from 'crypto';
import { Channel } from '../types/channel.types';

type Attributes = Record<string, string>;

const EXTINF = '#EXTINF:';
const EXTGRP = '#EXTGRP:';

/**
 * Parses an M3U / M3U8 playlist into a list of channels.
 *
 * Handles the common extended-M3U directives:
 *   #EXTM3U                          header (ignored)
 *   #EXTINF:-1 tvg-id="..." ...,Name  channel metadata
 *   #EXTGRP:Group                     group fallback
 * Lines that are not directives are treated as the stream URL for the
 * preceding #EXTINF entry.
 */
export function parseM3U(content: string): Channel[] {
  const lines = content.split(/\r?\n/);
  const channels: Channel[] = [];
  const seenIds = new Set<string>();

  let pending: Omit<Channel, 'id' | 'url'> | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0) continue;

    if (line.startsWith('#EXTM3U')) {
      continue;
    }

    if (line.startsWith(EXTINF)) {
      pending = parseExtInf(line.slice(EXTINF.length));
      continue;
    }

    if (line.startsWith(EXTGRP)) {
      const group = line.slice(EXTGRP.length).trim();
      if (pending && !pending.group) {
        pending = { ...pending, group };
      }
      continue;
    }

    if (line.startsWith('#')) {
      // Other directives (e.g. #KODIPROP, #EXTVLCOPT) are not needed here.
      continue;
    }

    // A non-directive line is the stream URL for the pending entry.
    const meta = pending ?? { name: line };
    const id = makeId(meta.tvgId, line, seenIds);
    channels.push({ id, url: line, ...meta });
    pending = null;
  }

  return channels;
}

function parseExtInf(value: string): Omit<Channel, 'id' | 'url'> {
  const commaIndex = findNameSeparator(value);
  const attrsPart = commaIndex >= 0 ? value.slice(0, commaIndex) : value;
  const namePart = commaIndex >= 0 ? value.slice(commaIndex + 1).trim() : '';
  const attrs = parseAttributes(attrsPart);

  const name = namePart || attrs['tvg-name'] || 'Unknown channel';

  return {
    name,
    logo: attrs['tvg-logo'] || undefined,
    group: attrs['group-title'] || undefined,
    tvgId: attrs['tvg-id'] || undefined,
    tvgName: attrs['tvg-name'] || undefined,
  };
}

/** Finds the first comma that is outside quotes (separates attrs from name). */
function findNameSeparator(value: string): number {
  let inQuotes = false;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      return i;
    }
  }
  return -1;
}

function parseAttributes(text: string): Attributes {
  const attrs: Attributes = {};
  const regex = /([\w-]+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    attrs[match[1].toLowerCase()] = match[2];
  }
  return attrs;
}

/**
 * Produces a stable id, preferring tvg-id, falling back to a short hash of the
 * URL. Collisions get a numeric suffix so every channel id is unique.
 */
function makeId(
  tvgId: string | undefined,
  url: string,
  seen: Set<string>,
): string {
  const base =
    tvgId && tvgId.trim().length > 0
      ? tvgId.trim()
      : createHash('md5').update(url).digest('hex').slice(0, 12);

  let id = base;
  let suffix = 1;
  while (seen.has(id)) {
    id = `${base}-${suffix++}`;
  }
  seen.add(id);
  return id;
}
