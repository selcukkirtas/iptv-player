import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'auth:public';

/**
 * Opens a route to callers without a session. Only the handful needed to get
 * one in the first place — the profile picker and the login exchange — may
 * carry this; everything else is closed by default.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const IS_ADMIN = 'auth:admin';

/**
 * Restricts a route to administrator profiles: managing profiles and importing
 * playlists. Without it, any viewer could simply widen their own permissions.
 */
export const AdminOnly = () => SetMetadata(IS_ADMIN, true);
