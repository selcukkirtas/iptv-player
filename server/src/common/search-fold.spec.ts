import { foldForSearch, foldedEquals, foldedIncludes } from './search-fold';

describe('foldForSearch', () => {
  it('lowercases plain ASCII', () => {
    expect(foldForSearch('Matrix')).toBe('matrix');
    expect(foldForSearch('MATRIX')).toBe('matrix');
  });

  it('folds the Turkish dotted and dotless I to the same letter', () => {
    // The two cases that used to make search miss: 'İ'.toLowerCase() leaves a
    // combining dot, and 'I'.toLowerCase() is 'i' while the word uses 'ı'.
    expect(foldForSearch('İSTANBUL')).toBe(foldForSearch('istanbul'));
    expect(foldForSearch('KIZILCIK')).toBe(foldForSearch('kızılcık'));
    expect(foldForSearch('ŞERBETİ')).toBe(foldForSearch('şerbeti'));
  });

  it('folds the rest of the Turkish alphabet', () => {
    expect(foldForSearch('ŞĞÜÖÇ')).toBe('sguoc');
    expect(foldForSearch('şğüöç')).toBe('sguoc');
  });

  it('leaves no combining marks behind', () => {
    expect(foldForSearch('İ')).toBe('i');
    expect(foldForSearch('İ').length).toBe(1);
  });

  it('folds other European letters that do not decompose', () => {
    expect(foldForSearch('Straße')).toBe('strasse');
    expect(foldForSearch('Æon')).toBe('aeon');
    expect(foldForSearch('Łódź')).toBe('lodz');
  });

  it('folds accents generally', () => {
    expect(foldForSearch('Amélie')).toBe('amelie');
    expect(foldForSearch('CAFÉ')).toBe(foldForSearch('cafe'));
  });

  it('is a no-op on already-folded text', () => {
    expect(foldForSearch('serbeti')).toBe('serbeti');
  });
});

describe('foldedIncludes', () => {
  it.each([
    ['Kızılcık Şerbeti | 138. Bölüm', 'KIZILCIK'],
    ['Kızılcık Şerbeti | 138. Bölüm', 'şerbeti'],
    ['Kızılcık Şerbeti | 138. Bölüm', 'ŞERBETİ'],
    ['TR: TRT 1 HEVC', 'trt 1'],
    ['Uzak Şehir', 'sehir'],
    ['İstanbul', 'istanbul'],
    ['istanbul', 'İSTANBUL'],
  ])('finds %p with %p', (haystack, needle) => {
    expect(foldedIncludes(haystack, needle)).toBe(true);
  });

  it('still rejects genuine non-matches', () => {
    expect(foldedIncludes('Kızılcık Şerbeti', 'matrix')).toBe(false);
    expect(foldedIncludes('TRT 1', 'TRT 2')).toBe(false);
  });
});

describe('foldedEquals', () => {
  it('matches category and person names across case and accents', () => {
    expect(foldedEquals('Bilim Kurgu', 'bilim kurgu')).toBe(true);
    expect(foldedEquals('ÇİZGİ FİLM', 'çizgi film')).toBe(true);
    expect(foldedEquals('Drama', 'Comedy')).toBe(false);
  });
});
