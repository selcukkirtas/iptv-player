import { Injectable } from '@nestjs/common';

const M3U8_CONTENT_TYPES = [
  'application/vnd.apple.mpegurl',
  'application/x-mpegurl',
  'audio/mpegurl',
  'application/mpegurl',
  'audio/x-mpegurl',
];

@Injectable()
export class StreamService {
  /** True when the response is an HLS manifest that needs URL rewriting. */
  isManifest(url: string, contentType: string): boolean {
    if (url.toLowerCase().split('?')[0].endsWith('.m3u8')) return true;
    const ct = contentType.toLowerCase();
    return M3U8_CONTENT_TYPES.some((t) => ct.includes(t));
  }

  /**
   * Rewrites every URI in an HLS manifest so the browser fetches segments,
   * keys, and nested playlists back through our proxy. Without this, segment
   * URLs point straight at the upstream host and fail on CORS (and break on
   * TV browsers). Relative URIs are first resolved against the manifest URL.
   *
   * Children are addressed by a ticket rather than a bare URL, so the proxy
   * only ever fetches sub-resources of a manifest it served itself.
   *
   * @param proxyBase e.g. "/api/stream" — the proxy endpoint to route through.
   * @param ticket    capability minted for this manifest's sub-resources.
   */
  rewriteManifest(
    body: string,
    manifestUrl: string,
    proxyBase: string,
    ticket: string,
  ): string {
    return body
      .split(/\r?\n/)
      .map((line) => this.rewriteLine(line, manifestUrl, proxyBase, ticket))
      .join('\n');
  }

  private rewriteLine(
    line: string,
    manifestUrl: string,
    proxyBase: string,
    ticket: string,
  ): string {
    const trimmed = line.trim();
    if (trimmed.length === 0) return line;

    if (trimmed.startsWith('#')) {
      // Tags can embed a URI (#EXT-X-KEY, #EXT-X-MEDIA, #EXT-X-MAP).
      return line.replace(
        /URI="([^"]+)"/g,
        (_m, uri: string) =>
          `URI="${this.proxify(uri, manifestUrl, proxyBase, ticket)}"`,
      );
    }

    // A bare line is a segment or nested-playlist URI.
    return this.proxify(trimmed, manifestUrl, proxyBase, ticket);
  }

  private proxify(
    uri: string,
    manifestUrl: string,
    proxyBase: string,
    ticket: string,
  ): string {
    try {
      const absolute = new URL(uri, manifestUrl).toString();
      return `${proxyBase}?t=${encodeURIComponent(ticket)}&u=${encodeURIComponent(absolute)}`;
    } catch {
      // Leave anything we can't resolve untouched.
      return uri;
    }
  }
}
