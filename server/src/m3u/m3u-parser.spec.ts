import { parseM3U } from './m3u-parser';

describe('parseM3U', () => {
  it('parses extended attributes, name, and url', () => {
    const playlist = [
      '#EXTM3U',
      '#EXTINF:-1 tvg-id="cnn.us" tvg-logo="http://logo/cnn.png" group-title="News",CNN',
      'http://example.com/cnn/index.m3u8',
    ].join('\n');

    const channels = parseM3U(playlist);

    expect(channels).toHaveLength(1);
    expect(channels[0]).toMatchObject({
      id: 'cnn.us',
      name: 'CNN',
      url: 'http://example.com/cnn/index.m3u8',
      logo: 'http://logo/cnn.png',
      group: 'News',
      tvgId: 'cnn.us',
    });
  });

  it('handles a comma inside the attribute values', () => {
    const playlist =
      '#EXTINF:-1 tvg-name="Movies, Series",Big Movie\nhttp://x/m.ts';
    const [channel] = parseM3U(playlist);
    expect(channel.name).toBe('Big Movie');
    expect(channel.tvgName).toBe('Movies, Series');
  });

  it('falls back to #EXTGRP when group-title is absent', () => {
    const playlist = '#EXTINF:-1,Local\n#EXTGRP:Regional\nhttp://x/local.m3u8';
    const [channel] = parseM3U(playlist);
    expect(channel.group).toBe('Regional');
  });

  it('derives a hashed id when tvg-id is missing and keeps ids unique', () => {
    const playlist = [
      '#EXTINF:-1,One',
      'http://same/url.ts',
      '#EXTINF:-1,Two',
      'http://same/url.ts',
    ].join('\n');

    const channels = parseM3U(playlist);
    expect(channels).toHaveLength(2);
    expect(channels[0].id).not.toBe(channels[1].id);
  });

  it('ignores unknown directives and blank lines', () => {
    const playlist = [
      '#EXTM3U',
      '',
      '#EXTVLCOPT:network-caching=1000',
      '#EXTINF:-1,Channel',
      '#KODIPROP:inputstream=inputstream.adaptive',
      'http://x/ch.m3u8',
    ].join('\n');

    const channels = parseM3U(playlist);
    expect(channels).toHaveLength(1);
    expect(channels[0].name).toBe('Channel');
  });

  it('uses tvg-name when the display name is empty', () => {
    const playlist = '#EXTINF:-1 tvg-name="Fallback",\nhttp://x/y.ts';
    const [channel] = parseM3U(playlist);
    expect(channel.name).toBe('Fallback');
  });
});
