/**
 * User-Agent sent on every upstream IPTV request (playlist + stream proxy).
 *
 * Many providers (Xtream Codes panels especially) reject requests from unknown
 * or browser User-Agents as an anti-scraping measure, returning an empty reply.
 * Presenting a widely-whitelisted media-player UA makes those providers
 * respond. Override with the IPTV_USER_AGENT env var if a provider needs a
 * different one.
 */
export const UPSTREAM_USER_AGENT =
  process.env.IPTV_USER_AGENT ?? 'VLC/3.0.20 LibVLC/3.0.20';
