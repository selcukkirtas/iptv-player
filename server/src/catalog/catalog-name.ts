/**
 * Provider playlists pack extra fields into the display name, pipe-separated:
 *   "Gerçek Sahtekâr | 2026 | 5.5 | NF"          (title | year | rating | provider)
 *   "Arka Sokaklar | 751. Bölüm | 05.06.2026 | Disney+"  (title | episode | date | tag)
 *
 * TMDB search only wants the bare title (plus a year when we can find one).
 * Passing the whole raw name pollutes the query and tanks the hit rate, so we
 * take the first segment as the title and dig a release year out of the rest.
 */
/** Category/name tokens that mark subtitled (rather than dubbed) content. */
const SUBTITLED_RE =
  /alt\s*yaz|subtitle|subbed|\bsub\b|\bsubs\b|vose|vostfr|legenda/i;

/**
 * Heuristic "is this subtitled?" from the provider category + display name
 * (e.g. "TR ➾ Altyazili Filmler", "... | Altyazılı"). Approximate — the real
 * track list is only known at play time — but cheap and useful for filtering.
 */
export function isSubtitled(group?: string, name?: string): boolean {
  return SUBTITLED_RE.test(`${group ?? ''} ${name ?? ''}`);
}

export function parseCatalogName(raw: string): {
  title: string;
  year?: number;
} {
  const segments = raw
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
  let title = segments[0] ?? raw.trim();
  let year: number | undefined;

  // Legacy "Title (2023)" form: pull the year and drop it from the title.
  const paren = title.match(/\((\d{4})\)\s*$/);
  if (paren) {
    year = Number(paren[1]);
    title = title.slice(0, paren.index).trim();
  }

  // Prefer a segment that is exactly a 4-digit year (real movies: title | year | …).
  if (year === undefined) {
    for (const seg of segments.slice(1)) {
      if (/^(19|20)\d{2}$/.test(seg)) {
        year = Number(seg);
        break;
      }
    }
  }

  // Fall back to a year embedded in a date like 05.06.2026.
  if (year === undefined) {
    for (const seg of segments.slice(1)) {
      const m = seg.match(/\b((?:19|20)\d{2})\b/);
      if (m) {
        year = Number(m[1]);
        break;
      }
    }
  }

  return { title, year };
}
