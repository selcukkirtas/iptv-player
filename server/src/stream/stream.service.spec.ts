import { StreamService } from './stream.service';

describe('StreamService', () => {
  const service = new StreamService();
  const base = '/api/stream';
  const ticket = 'TICKET123';
  const manifestUrl = 'http://host.tv/live/cnn/index.m3u8';

  /** The proxied form a child URI is expected to be rewritten into. */
  const proxied = (absolute: string) =>
    `/api/stream?t=${ticket}&u=${encodeURIComponent(absolute)}`;

  describe('isManifest', () => {
    it('detects by .m3u8 extension (ignoring query string)', () => {
      expect(service.isManifest('http://x/y.m3u8?token=1', '')).toBe(true);
    });
    it('detects by content-type', () => {
      expect(
        service.isManifest('http://x/y', 'application/vnd.apple.mpegurl'),
      ).toBe(true);
    });
    it('returns false for a segment', () => {
      expect(service.isManifest('http://x/seg1.ts', 'video/mp2t')).toBe(false);
    });
  });

  describe('rewriteManifest', () => {
    it('rewrites relative segment URIs through the proxy', () => {
      const body = ['#EXTM3U', '#EXTINF:6,', 'seg1.ts'].join('\n');
      const out = service.rewriteManifest(body, manifestUrl, base, ticket);
      expect(out).toContain(proxied('http://host.tv/live/cnn/seg1.ts'));
    });

    it('resolves absolute and root-relative URIs', () => {
      const body = ['/live/abs/seg.ts'].join('\n');
      const out = service.rewriteManifest(body, manifestUrl, base, ticket);
      expect(out).toContain(proxied('http://host.tv/live/abs/seg.ts'));
    });

    it('rewrites URI="..." inside #EXT-X-KEY tags', () => {
      const body = '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"';
      const out = service.rewriteManifest(body, manifestUrl, base, ticket);
      expect(out).toContain(
        `URI="${proxied('http://host.tv/live/cnn/key.bin')}"`,
      );
    });

    it('leaves comment/tag lines without URIs untouched', () => {
      const body = '#EXT-X-VERSION:3';
      expect(service.rewriteManifest(body, manifestUrl, base, ticket)).toBe(
        body,
      );
    });

    it('never emits a bare url= child the proxy would fetch unchecked', () => {
      const body = ['#EXTM3U', 'seg1.ts'].join('\n');
      const out = service.rewriteManifest(body, manifestUrl, base, ticket);
      expect(out).not.toContain('?url=');
    });
  });
});
