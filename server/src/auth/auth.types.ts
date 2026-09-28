/** A logged-in viewer profile, as attached to the request by the session guard. */
export interface SessionUser {
  id: string;
  name: string;
}

/** Cookie carrying a viewer's session token. */
export const SESSION_COOKIE = 'iptv_sid';

/**
 * Cookie carrying an administrator session. Deliberately separate from the
 * viewer cookie: signing in to watch television must never confer the ability
 * to edit profiles or replace the playlist.
 */
export const ADMIN_COOKIE = 'iptv_admin';
