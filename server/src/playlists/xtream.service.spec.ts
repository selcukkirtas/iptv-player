import { normalizeXtreamHost } from './xtream.service';

describe('normalizeXtreamHost', () => {
  it('strips xmltv.php query URLs down to the panel host', () => {
    expect(
      normalizeXtreamHost(
        'http://panel.example:8080/xmltv.php?username=demo&password=secret',
      ),
    ).toBe('http://panel.example:8080');
  });

  it('preserves a subpath panel root', () => {
    expect(
      normalizeXtreamHost('https://example.com/iptv/xmltv.php?foo=bar'),
    ).toBe('https://example.com/iptv');
  });

  it('leaves a plain host unchanged', () => {
    expect(normalizeXtreamHost('http://example.com:8080/')).toBe(
      'http://example.com:8080',
    );
  });
});
