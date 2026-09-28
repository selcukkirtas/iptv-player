/**
 * Folds text to a form suitable for comparing search input against catalogue
 * titles, names and categories.
 *
 * `toLowerCase()` alone is not enough for this catalogue. It is largely Turkish,
 * and Turkish breaks the naive assumption that case folding is a 1:1 letter
 * map:
 *
 *   - `'İ'.toLowerCase()` yields `i` plus a combining dot above, so `ŞERBETİ`
 *     never matched `şerbeti`.
 *   - `I` lowercases to `i`, but the Turkish word is spelled with the dotless
 *     `ı`, so `KIZILCIK` never matched `kızılcık`.
 *
 * So instead of case-folding, reduce both sides to unaccented ASCII-ish base
 * letters: decompose, drop the combining marks, and map the few letters that
 * have no decomposition. Searching then ignores case *and* diacritics, which is
 * what people actually expect — typing `sen` finds `Şen`, `istanbul` finds
 * `İstanbul`.
 */

/** Letters that NFD does not decompose, so they need an explicit base form. */
const NO_DECOMPOSITION: Record<string, string> = {
  ı: 'i',
  İ: 'i',
  ø: 'o',
  Ø: 'o',
  æ: 'ae',
  Æ: 'ae',
  œ: 'oe',
  Œ: 'oe',
  ß: 'ss',
  đ: 'd',
  Đ: 'd',
  ł: 'l',
  Ł: 'l',
  ð: 'd',
  Ð: 'd',
  þ: 'th',
  Þ: 'th',
};

const NO_DECOMPOSITION_RE = new RegExp(
  `[${Object.keys(NO_DECOMPOSITION).join('')}]`,
  'g',
);
/** Unicode combining marks left behind by NFD. */
const COMBINING_MARKS = /[̀-ͯ]/g;

export function foldForSearch(value: string): string {
  return value
    .replace(NO_DECOMPOSITION_RE, (ch) => NO_DECOMPOSITION[ch])
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase();
}

/** Whether `needle` occurs in `haystack`, ignoring case and diacritics. */
export function foldedIncludes(haystack: string, needle: string): boolean {
  return foldForSearch(haystack).includes(foldForSearch(needle));
}

/** Whether both sides are the same word, ignoring case and diacritics. */
export function foldedEquals(a: string, b: string): boolean {
  return foldForSearch(a) === foldForSearch(b);
}
