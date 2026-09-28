/**
 * Human labels for provider category prefixes.
 *
 * Providers prefix every category with a short code — "TR ➾ HEVC",
 * "AL ➾ CINEMA" — so the permission editor groups by that code. A screen of
 * bare codes (74 of them on a typical playlist) tells you nothing, so each
 * group also gets a heading.
 */

/** Providers separate the prefix from the category name with an arrow-ish glyph. */
export const CATEGORY_SEPARATOR = /\s*[➾➞→»>|/]\s*/;

export function prefixOf(name: string): string {
  return name.split(CATEGORY_SEPARATOR)[0].trim() || name.trim();
}

/** The category name without its prefix (falls back to the full name). */
export function labelOf(name: string): string {
  const parts = name.split(CATEGORY_SEPARATOR);
  return parts.length > 1 ? parts.slice(1).join(' › ').trim() : name.trim();
}

/**
 * Prefixes that look like ISO country codes but mean something else on IPTV
 * panels, where a wrong country name would be worse than none. Kept
 * deliberately short — anything detectable from the playlist itself is handled
 * by `contradictsRegion` instead of being listed here.
 */
const NOT_A_COUNTRY = new Set([
  'AR', // Arabic channels, not Argentina
  'EX-YU',
  'EXYU',
  'YU',
  'VIP',
  'PPV',
  'XXX',
]);

/**
 * CLDR's placeholder region. It resolves to a name ("Unknown Region"), so a
 * prefix like "ZZ" would otherwise be labelled with it instead of falling back
 * to the group's real contents.
 */
const UNKNOWN_REGION = 'ZZ';

/** UN M49 codes for continents/regions, so "AFRICA" is recognised as a place. */
const MACRO_REGIONS = ['001', '002', '005', '009', '019', '021', '142', '150'];

let englishRegions: Map<string, string> | null = null;

/**
 * Lowercased English region name → its code. Used to notice when a group's own
 * categories name a *different* place than its prefix would suggest: the
 * playlist that says "AF ➾ AFRICA" means Africa, even though ISO reads AF as
 * Afghanistan (and that same playlist lists "AFG ➾ AFGHANISTAN" separately).
 */
function regionIndex(): Map<string, string> {
  if (englishRegions) return englishRegions;
  const index = new Map<string, string>();
  try {
    // `fallback: 'none'` makes unassigned codes return undefined rather than
    // echoing themselves back, so only real regions land in the index.
    const names = new Intl.DisplayNames(['en'], {
      type: 'region',
      fallback: 'none',
    });
    const A = 'A'.charCodeAt(0);
    for (let i = 0; i < 26; i++) {
      for (let j = 0; j < 26; j++) {
        const code = String.fromCharCode(A + i, A + j);
        if (code === UNKNOWN_REGION) continue;
        const name = names.of(code);
        if (name && name !== code) index.set(name.toLowerCase(), code);
      }
    }
    for (const code of MACRO_REGIONS) {
      const name = names.of(code);
      if (name && name !== code) index.set(name.toLowerCase(), code);
    }
  } catch {
    // No Intl region data — every prefix simply falls back to its contents.
  }
  englishRegions = index;
  return index;
}

/** The prefix's region name in the viewer's own language, if it is one. */
function regionName(code: string): string | undefined {
  if (!/^[A-Za-z]{2}$/.test(code)) return undefined;
  const upper = code.toUpperCase();
  if (upper === UNKNOWN_REGION) return undefined;
  try {
    const name = new Intl.DisplayNames(undefined, {
      type: 'region',
      fallback: 'none',
    }).of(upper);
    return name && name.toUpperCase() !== upper ? name : undefined;
  } catch {
    return undefined;
  }
}

/** Whether the group's own categories name a different place than the prefix. */
function contradictsRegion(code: string, groups: string[]): boolean {
  const index = regionIndex();
  const upper = code.toUpperCase();
  return groups.some((g) => {
    const named = index.get(labelOf(g).toLowerCase());
    return named !== undefined && named !== upper;
  });
}

/** "HEVC, SPOR, BELGESEL +19" — what the group actually holds. */
function summarize(groups: string[], max = 3): string {
  const labels = groups.map(labelOf).filter(Boolean);
  if (labels.length === 0) return '';
  const shown = labels.slice(0, max).join(', ');
  const rest = labels.length - max;
  return rest > 0 ? `${shown} +${rest}` : shown;
}

/**
 * Heading shown next to a prefix. Prefers the country name in the viewer's
 * language, but only where that cannot be wrong: a prefix the playlist itself
 * contradicts, or one known to mean something other than a country, falls back
 * to listing what the group contains — always true, since it comes from the
 * playlist.
 */
export function categoryGroupHeading(prefix: string, groups: string[]): string {
  if (
    !NOT_A_COUNTRY.has(prefix.toUpperCase()) &&
    !contradictsRegion(prefix, groups)
  ) {
    const region = regionName(prefix);
    if (region) return region;
  }
  return summarize(groups);
}
