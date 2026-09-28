/**
 * Profile helpers. The *active* profile is no longer kept here: it lives in the
 * server-issued session cookie, so a viewer cannot promote themselves by
 * editing local storage.
 */

/** Avatar accent palette offered when creating a profile. */
export const PROFILE_COLORS = [
  '#4f8cff',
  '#ff6b6b',
  '#5fd38d',
  '#ffce54',
  '#b07cff',
  '#ff8f4f',
];
