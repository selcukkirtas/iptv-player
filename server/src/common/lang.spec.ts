import { langMatches } from './lang';

describe('langMatches', () => {
  it('matches identical tags', () => {
    expect(langMatches('tur', 'tur')).toBe(true);
  });

  it('matches ISO 639-1 against 639-2 (tr ↔ tur)', () => {
    expect(langMatches('tr', 'tur')).toBe(true);
    expect(langMatches('tur', 'tr')).toBe(true);
  });

  it('matches bibliographic/terminological variants (de/deu/ger)', () => {
    expect(langMatches('deu', 'ger')).toBe(true);
    expect(langMatches('de', 'ger')).toBe(true);
    expect(langMatches('fra', 'fre')).toBe(true);
  });

  it('matches via a prefix overlap (eng ↔ en)', () => {
    expect(langMatches('eng', 'en')).toBe(true);
  });

  it('does not match different languages', () => {
    expect(langMatches('eng', 'tur')).toBe(false);
    expect(langMatches('fra', 'spa')).toBe(false);
  });

  it('treats empty/missing tags as no match', () => {
    expect(langMatches(undefined, 'tur')).toBe(false);
    expect(langMatches('tur', '')).toBe(false);
  });
});
