/**
 * Language-tag matching for audio/subtitle preferences. Stream tags are
 * inconsistent — a track may be labelled `tur`, `tr`, `ger`, `deu` or `de` for
 * the same language — so a plain prefix compare misses obvious matches. This
 * normalises both sides through a small alias table (ISO 639-1 ↔ 639-2/B ↔
 * 639-2/T) and also accepts a prefix overlap as a fallback.
 */
const LANG_ALIASES: string[][] = [
  ['tur', 'tr'],
  ['eng', 'en'],
  ['ger', 'deu', 'de'],
  ['fre', 'fra', 'fr'],
  ['spa', 'es'],
  ['ara', 'ar'],
  ['rus', 'ru'],
  ['ita', 'it'],
  ['por', 'pt'],
  ['dut', 'nld', 'nl'],
  ['gre', 'ell', 'el'],
];

/** True when a track's language tag refers to the same language as `want`. */
export function langMatches(
  trackLang: string | undefined,
  want: string,
): boolean {
  const a = (trackLang ?? '').toLowerCase().trim();
  const b = want.toLowerCase().trim();
  if (!a || !b) return false;
  if (a === b || a.startsWith(b) || b.startsWith(a)) return true;
  return LANG_ALIASES.some((group) => group.includes(a) && group.includes(b));
}
