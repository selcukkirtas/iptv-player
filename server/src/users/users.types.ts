/** A browsable catalog section that can be permission-scoped per user. */
export type Section = 'channels' | 'movies' | 'series';

export const SECTIONS: Section[] = ['channels', 'movies', 'series'];

/**
 * Per-section category permissions. `null` means unrestricted (every category
 * in that section); a string array means only those category names are allowed.
 */
export interface AllowedGroups {
  channels: string[] | null;
  movies: string[] | null;
  series: string[] | null;
}

/** A viewer profile. Logged into with its PIN; the session then carries it. */
export interface User {
  id: string;
  name: string;
  /** Avatar accent colour for the picker (hex). */
  color?: string;
  /** Kids profile: age-restricted categories are hidden on top of `allowed`. */
  kids?: boolean;
  /**
   * Hide age-restricted categories from this profile without calling it a kids
   * profile — what an adult who simply does not want that section listed needs.
   * Implied by `kids`.
   */
  hideAdult?: boolean;
  /**
   * Suspended profiles stay configured but cannot be signed into and are not
   * offered in the picker — the way to take someone's access away for a while
   * without deleting their favourites, history and category permissions.
   */
  disabled?: boolean;
  /** scrypt hash of the PIN (see `secret-hash.ts`); absent means no PIN. */
  pinHash?: string;
  allowed: AllowedGroups;
  createdAt: string;
}

/**
 * Profile as exposed over the API — the PIN hash is never serialized; callers
 * only learn whether one is set via `hasPin`.
 */
export type PublicUser = Omit<User, 'pinHash'> & { hasPin: boolean };

export function toPublicUser(user: User): PublicUser {
  const { pinHash, ...rest } = user;
  return { ...rest, hasPin: Boolean(pinHash) };
}

/**
 * The little a profile picker needs, and no more. The picker is reachable
 * before anyone logs in, so it must not disclose a profile's category
 * permissions.
 */
export interface PickerUser {
  id: string;
  name: string;
  color?: string;
  kids?: boolean;
  hasPin: boolean;
}

/** The picker never lists a disabled profile. */
export function isSelectable(user: User): boolean {
  return user.disabled !== true;
}

export function toPickerUser(user: User): PickerUser {
  return {
    id: user.id,
    name: user.name,
    color: user.color,
    kids: user.kids,
    hasPin: Boolean(user.pinHash),
  };
}
