/**
 * Category-name patterns treated as age-restricted. Mirrors the frontend's
 * `isLockedGroup` patterns (web/src/settings.ts) so a "kids" profile hides the
 * same categories the parental PIN gate locks.
 */
const ADULT_PATTERNS = [/for adults/i, /adult/i, /\bxxx\b/i, /18\+/, /\+18/];

export function isAdultGroup(group: string | undefined): boolean {
  if (!group) return false;
  return ADULT_PATTERNS.some((re) => re.test(group));
}
