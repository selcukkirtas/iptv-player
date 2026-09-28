import { describe, expect, it } from 'vitest';
import { categoryGroupHeading, labelOf, prefixOf } from './category-labels';

describe('prefixOf / labelOf', () => {
  it('splits a provider category on its arrow', () => {
    expect(prefixOf('TR ➾ HEVC')).toBe('TR');
    expect(labelOf('TR ➾ HEVC')).toBe('HEVC');
  });

  it('handles the other separators providers use', () => {
    for (const sep of ['|', '>', '»', '→', '/']) {
      expect(prefixOf(`DE ${sep} Action`)).toBe('DE');
      expect(labelOf(`DE ${sep} Action`)).toBe('Action');
    }
  });

  it('falls back to the whole name when there is no prefix', () => {
    expect(prefixOf('Sports')).toBe('Sports');
    expect(labelOf('Sports')).toBe('Sports');
  });

  it('tolerates the stray leading space real playlists contain', () => {
    expect(prefixOf(' DE ➾ Classic')).toBe('DE');
  });
});

describe('categoryGroupHeading', () => {
  it('names the country in the viewer’s language when the code is one', () => {
    const heading = categoryGroupHeading('DE', ['DE ➾ Action', 'DE ➾ Drama']);
    // Locale-dependent (Germany / Almanya / Allemagne), but never the bare code
    // and never the contents.
    expect(heading).not.toBe('DE');
    expect(heading).not.toContain('Action');
  });

  it('keeps the playlist’s own meaning when it contradicts the code', () => {
    // ISO reads AF as Afghanistan, but this playlist means Africa — and lists
    // AFG ➾ AFGHANISTAN separately.
    expect(categoryGroupHeading('AF', ['AF ➾ AFRICA'])).toBe('AFRICA');
  });

  it('accepts a country whose own categories confirm it', () => {
    const heading = categoryGroupHeading('AL', [
      'AL ➾ ALBANIA',
      'AL ➾ CINEMA',
      'AL ➾ SPORTS',
    ]);
    expect(heading).not.toContain('CINEMA');
    expect(heading).not.toBe('AL');
  });

  it('does not guess a country for codes that mean something else here', () => {
    // AR is Arabic on IPTV panels, not Argentina.
    expect(categoryGroupHeading('AR', ['AR ➾ beIN SPORTS'])).toBe(
      'beIN SPORTS',
    );
    expect(categoryGroupHeading('EXYU', ['EXYU ➾ DOMACE SERIJE'])).toBe(
      'DOMACE SERIJE',
    );
  });

  it('summarises the contents when the prefix is not a code at all', () => {
    expect(
      categoryGroupHeading('FOR ADULTS', [
        'FOR ADULTS ➾ A',
        'FOR ADULTS ➾ B',
        'FOR ADULTS ➾ C',
        'FOR ADULTS ➾ D',
      ]),
    ).toBe('A, B, C +1');
  });

  it('lists at most three categories before counting the rest', () => {
    const groups = Array.from({ length: 22 }, (_, i) => `ZZ ➾ Cat${i}`);
    expect(categoryGroupHeading('ZZ', groups)).toBe('Cat0, Cat1, Cat2 +19');
  });
});
