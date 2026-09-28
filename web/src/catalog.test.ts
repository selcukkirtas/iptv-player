import { describe, expect, it } from 'vitest';
import { sortGroups, subtitleHintFromGroup } from './catalog';

describe('sortGroups', () => {
  it('hoists TR-prefixed categories to the top, preserving order otherwise', () => {
    expect(
      sortGroups(['EN Movies', 'TR ➾ Filmler', 'DE Kino', 'TR ➾ Diziler']),
    ).toEqual(['TR ➾ Filmler', 'TR ➾ Diziler', 'EN Movies', 'DE Kino']);
  });

  it('does not treat words merely starting with "tr" as the TR prefix', () => {
    expect(sortGroups(['Trailers', 'TR Spor'])).toEqual([
      'TR Spor',
      'Trailers',
    ]);
  });
});

describe('subtitleHintFromGroup', () => {
  it('turns subtitles on for a subtitled category and reads the prefix language', () => {
    expect(subtitleHintFromGroup('TR ➾ Altyazılı Filmler')).toEqual({
      on: true,
      lang: 'tr',
    });
  });

  it('detects English "subtitle" wording', () => {
    expect(subtitleHintFromGroup('EN | Subtitled Movies')).toEqual({
      on: true,
      lang: 'en',
    });
  });

  it('leaves subtitles off for a non-subtitled category', () => {
    expect(subtitleHintFromGroup('TR ➾ Ulusal')).toEqual({ on: false });
  });

  it('omits the language hint when the prefix is not a code', () => {
    expect(subtitleHintFromGroup('4K Altyazılı')).toEqual({
      on: true,
      lang: undefined,
    });
  });

  it('handles a missing group', () => {
    expect(subtitleHintFromGroup(undefined)).toEqual({ on: false });
  });
});
