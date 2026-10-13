import type {
  AdminStatus,
  ApiErrorBody,
  CatalogFilterOptions,
  CatalogSearchResult,
  Channel,
  ChannelSearchResult,
  CreateUserInput,
  FavoriteItem,
  GroupedMovieRow,
  GroupedSeriesRow,
  MediaSource,
  MetadataBrowseParams,
  MetadataListResult,
  MetadataMovieRow,
  MetadataSeriesRow,
  MetadataStats,
  MovieWithMetadata,
  PickerUser,
  PlaylistMeta,
  ProgressItem,
  SaveProgressInput,
  SearchChannelsParams,
  SeriesDetailWithMetadata,
  SeriesWithMetadata,
  SessionUser,
  UpdateUserInput,
  User,
  VodSession,
  XtreamCredentials,
} from './types';

const BASE = '/api';

/**
 * Thrown on a 401 so the app can drop back to the profile picker instead of
 * showing an error — the session simply expired or was revoked.
 */
export class UnauthenticatedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnauthenticatedError';
  }
}

/**
 * How long to wait per endpoint, in milliseconds.
 *
 * These have to clear the server's *own* budget for the same request, or the
 * browser gives up on work the server is still legitimately doing. Opening a
 * VOD source, for instance, allows ffprobe 30s and then waits up to 60s for the
 * first HLS segment — 90s in the worst case. A flat 30s here aborted that on
 * any host slow enough to use the full budget (a Raspberry Pi reaching a remote
 * provider does so routinely), and surfaced as an unexplained "Fetch is
 * aborted".
 *
 * Order matters: the first matching prefix wins.
 */
const TIMEOUTS: Array<{ match: (path: string) => boolean; ms: number }> = [
  // Importing a provider catalogue walks its whole API.
  {
    match: (p) => p.startsWith('/playlists/xtream') && !p.includes('/test'),
    ms: 300_000,
  },
  { match: (p) => p.startsWith('/playlists/'), ms: 300_000 },
  // ffprobe + ffmpeg start-up (server budget: ~90s VOD, ~75s live).
  { match: (p) => p === '/vod/open' || p === '/live/open', ms: 120_000 },
];

/** Everything else. Generous enough for a slow host, still a real ceiling. */
const DEFAULT_TIMEOUT_MS = 60_000;

function timeoutFor(path: string): number {
  return TIMEOUTS.find((t) => t.match(path))?.ms ?? DEFAULT_TIMEOUT_MS;
}

/** Subscribers notified when the server says we are no longer signed in. */
const authListeners = new Set<() => void>();

export function onUnauthenticated(fn: () => void): () => void {
  authListeners.add(fn);
  return () => authListeners.delete(fn);
}

/**
 * `AbortSignal.timeout` needs Safari 15.4, which rules out the older tablets
 * this is watched on, so build the equivalent by hand. `TimeoutError` is kept as
 * the reason so the caller below can tell a timeout from a cancellation exactly
 * as it would with the native version.
 */
function timeoutSignal(ms: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(
      typeof DOMException === 'function'
        ? new DOMException('Timed out', 'TimeoutError')
        : undefined,
    );
  }, ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const timeoutMs = timeoutFor(path);
  const { signal, done } = timeoutSignal(timeoutMs);

  let res: Response;
  try {
    // The session rides in an HttpOnly cookie, which same-origin requests send
    // automatically — there is nothing for script here to read or forge.
    res = await fetch(`${BASE}${path}`, { ...init, headers, signal });
  } catch (err) {
    done();
    // A timeout arrives as an AbortError whose message ("Fetch is aborted",
    // "signal is aborted without reason", …) varies by browser and explains
    // nothing. Say what actually happened instead.
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new Error(
        `The server did not respond within ${Math.round(timeoutMs / 1000)}s. ` +
          'It may be busy or the source may be unreachable — try again.',
      );
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('The request was cancelled.');
    }
    throw new Error('Could not reach the server. Check that it is running.');
  }
  done();

  if (res.status === 401) {
    const message = await errorMessage(res);
    for (const fn of authListeners) fn();
    throw new UnauthenticatedError(message);
  }
  if (!res.ok) {
    throw new Error(await errorMessage(res));
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ApiErrorBody;
    return body.message ?? res.statusText;
  } catch {
    return res.statusText || `Request failed (${res.status})`;
  }
}

export function searchChannels(
  params: SearchChannelsParams,
): Promise<ChannelSearchResult> {
  const qs = new URLSearchParams();
  if (params.query) qs.set('query', params.query);
  if (params.group) qs.set('group', params.group);
  const suffix = qs.toString() ? `?${qs}` : '';
  return request<ChannelSearchResult>(`/channels${suffix}`);
}

export function getGroups(): Promise<string[]> {
  return request<string[]>('/channels/groups');
}

/* ----- Sessions ----- */

/** The "who's watching?" list — public, and deliberately minimal. */
export function getProfiles(): Promise<PickerUser[]> {
  return request<PickerUser[]>('/auth/profiles');
}

/** Who we are signed in as, or `null`. */
export function getSession(): Promise<{ user: SessionUser | null }> {
  return request<{ user: SessionUser | null }>('/auth/session');
}

/** Exchange a profile's PIN for a session cookie. */
export function login(
  userId: string,
  pin: string,
): Promise<{ user: SessionUser }> {
  return request<{ user: SessionUser }>('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId, pin }),
  });
}

export function logout(): Promise<void> {
  return request<void>('/auth/logout', { method: 'POST' });
}

/* ----- Administrator console (/admin) ----- */

export function getAdminStatus(): Promise<AdminStatus> {
  return request<AdminStatus>('/admin/status');
}

/** First run: choose the administrator password and sign in with it. */
export function adminSetup(password: string): Promise<{ signedIn: boolean }> {
  return request<{ signedIn: boolean }>('/admin/setup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
}

export function adminLogin(password: string): Promise<{ signedIn: boolean }> {
  return request<{ signedIn: boolean }>('/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
}

export function adminLogout(): Promise<void> {
  return request<void>('/admin/logout', { method: 'POST' });
}

/** Changing it signs every console out, this one included. */
export function changeAdminPassword(
  current: string,
  next: string,
): Promise<void> {
  return request<void>('/admin/password', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ current, next }),
  });
}

/* ----- Users / profiles (administrator console only) ----- */

export function getUsers(): Promise<User[]> {
  return request<User[]>('/users');
}

export function createUser(input: CreateUserInput): Promise<User> {
  return request<User>('/users', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateUser(id: string, input: UpdateUserInput): Promise<User> {
  return request<User>(`/users/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function deleteUser(id: string): Promise<void> {
  return request<void>(`/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/** Full category lists (unfiltered) for the profile-management UI. */
export function getAllChannelGroups(): Promise<string[]> {
  return request<string[]>('/channels/all-groups');
}

export function getAllMovieGroups(): Promise<string[]> {
  return request<string[]>('/movies/all-groups');
}

export function getAllSeriesGroups(): Promise<string[]> {
  return request<string[]>('/series/all-groups');
}

export function getChannel(id: string): Promise<Channel> {
  return request<Channel>(`/channels/${encodeURIComponent(id)}`);
}

export function getPlaylistMeta(): Promise<PlaylistMeta> {
  return request<PlaylistMeta>('/playlists');
}

export function importPlaylistUrl(url: string): Promise<PlaylistMeta> {
  return request<PlaylistMeta>('/playlists/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  });
}

/** The stored Xtream account, or null if none has been imported yet. */
export function getXtreamAccount(): Promise<XtreamCredentials | null> {
  return request<XtreamCredentials | null>('/playlists/xtream');
}

export function importXtream(creds: XtreamCredentials): Promise<PlaylistMeta> {
  return request<PlaylistMeta>('/playlists/xtream', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(creds),
  });
}

export function testXtream(
  creds: XtreamCredentials,
): Promise<{ ok: boolean; message: string }> {
  return request<{ ok: boolean; message: string }>('/playlists/xtream/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(creds),
  });
}

export function uploadPlaylist(file: File): Promise<PlaylistMeta> {
  const form = new FormData();
  form.append('file', file);
  return request<PlaylistMeta>('/playlists/upload', {
    method: 'POST',
    body: form,
  });
}

export function refreshMetadata(): Promise<{ started: boolean }> {
  return request<{ started: boolean }>('/playlists/metadata-sync', {
    method: 'POST',
  });
}

/* ----- Persisted metadata DB browsing ----- */

export function getMetadataStats(): Promise<MetadataStats> {
  return request<MetadataStats>('/metadata/stats');
}

export function getMetadataGenres(type: 'movie' | 'series'): Promise<string[]> {
  return request<string[]>(`/metadata/genres?type=${type}`);
}

function metadataQuery(params: MetadataBrowseParams): string {
  const qs = new URLSearchParams();
  if (params.query) qs.set('query', params.query);
  if (params.genre) qs.set('genre', params.genre);
  if (params.year !== undefined) qs.set('year', String(params.year));
  if (params.minRating !== undefined)
    qs.set('minRating', String(params.minRating));
  if (params.actor) qs.set('actor', params.actor);
  if (params.director) qs.set('director', params.director);
  if (params.sort) qs.set('sort', params.sort);
  if (params.page !== undefined) qs.set('page', String(params.page));
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  if (params.audioLang) qs.set('audioLang', params.audioLang);
  if (params.subtitled) qs.set('subtitled', params.subtitled);
  return qs.toString() ? `?${qs}` : '';
}

export function getMetadataMovies(
  params: MetadataBrowseParams,
): Promise<MetadataListResult<MetadataMovieRow>> {
  return request<MetadataListResult<MetadataMovieRow>>(
    `/metadata/movies${metadataQuery(params)}`,
  );
}

/** Movies deduplicated by IMDb id, each with playable versions. */
export function getGroupedMovies(
  params: MetadataBrowseParams,
): Promise<MetadataListResult<GroupedMovieRow>> {
  return request<MetadataListResult<GroupedMovieRow>>(
    `/movies/grouped${metadataQuery(params)}`,
  );
}

/** Series deduplicated by IMDb id, each with its provider versions. */
export function getGroupedSeries(
  params: MetadataBrowseParams,
): Promise<MetadataListResult<GroupedSeriesRow>> {
  return request<MetadataListResult<GroupedSeriesRow>>(
    `/series/grouped${metadataQuery(params)}`,
  );
}

export function getMetadataSeries(
  params: MetadataBrowseParams,
): Promise<MetadataListResult<MetadataSeriesRow>> {
  return request<MetadataListResult<MetadataSeriesRow>>(
    `/metadata/series${metadataQuery(params)}`,
  );
}

export function getFavorites(): Promise<FavoriteItem[]> {
  return request<FavoriteItem[]>('/favorites');
}

export function addFavorite(channelId: string): Promise<FavoriteItem> {
  return request<FavoriteItem>('/favorites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ channelId }),
  });
}

export function removeFavorite(channelId: string): Promise<void> {
  return request<void>(`/favorites/${encodeURIComponent(channelId)}`, {
    method: 'DELETE',
  });
}

function catalogQuery(params: SearchChannelsParams): string {
  const qs = new URLSearchParams();
  if (params.query) qs.set('query', params.query);
  if (params.group) qs.set('group', params.group);
  if (params.year !== undefined) qs.set('year', String(params.year));
  if (params.genre) qs.set('genre', params.genre);
  if (params.actor) qs.set('actor', params.actor);
  if (params.director) qs.set('director', params.director);
  if (params.minRating !== undefined)
    qs.set('minRating', String(params.minRating));
  if (params.maxRating !== undefined)
    qs.set('maxRating', String(params.maxRating));
  if (params.minImdbScore !== undefined)
    qs.set('minImdbScore', String(params.minImdbScore));
  if (params.maxImdbScore !== undefined)
    qs.set('maxImdbScore', String(params.maxImdbScore));
  if (params.sort) qs.set('sort', params.sort);
  if (params.page !== undefined) qs.set('page', String(params.page));
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  if (params.audioLang) qs.set('audioLang', params.audioLang);
  if (params.subtitled) qs.set('subtitled', params.subtitled);
  return qs.toString() ? `?${qs}` : '';
}

export function getMovies(
  params: SearchChannelsParams,
): Promise<CatalogSearchResult<MovieWithMetadata>> {
  return request<CatalogSearchResult<MovieWithMetadata>>(
    `/movies${catalogQuery(params)}`,
  );
}

export function getMovieGroups(): Promise<string[]> {
  return request<string[]>('/movies/groups');
}

export function getMovie(id: string): Promise<MovieWithMetadata> {
  return request<MovieWithMetadata>(`/movies/${encodeURIComponent(id)}`);
}

export function getSeries(
  params: SearchChannelsParams,
): Promise<CatalogSearchResult<SeriesWithMetadata>> {
  return request<CatalogSearchResult<SeriesWithMetadata>>(
    `/series${catalogQuery(params)}`,
  );
}

export function getSeriesGroups(): Promise<string[]> {
  return request<string[]>('/series/groups');
}

export function getSeriesDetail(id: string): Promise<SeriesDetailWithMetadata> {
  return request<SeriesDetailWithMetadata>(`/series/${encodeURIComponent(id)}`);
}

export function getMovieFilterOptions(): Promise<CatalogFilterOptions> {
  return request<CatalogFilterOptions>('/movies/filter-options');
}

export function getSeriesFilterOptions(): Promise<CatalogFilterOptions> {
  return request<CatalogFilterOptions>('/series/filter-options');
}

/** Open a VOD source; starts a continuous remux session from `position`. */
export function openVod(
  src: MediaSource,
  opts: {
    position?: number;
    audioIndex?: number;
    subtitleIndex?: number;
    preferLang?: string;
    preferSubLang?: string;
    forceSubtitle?: boolean;
  } = {},
): Promise<VodSession> {
  return request<VodSession>('/vod/open', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ src, ...opts }),
  });
}

/**
 * Start (or reuse) a server-side live transcode for a channel the browser can't
 * decode natively (e.g. HEVC). Returns the H.264 HLS playlist path to play.
 */
export function openLive(
  src: MediaSource,
): Promise<{ id: string; playlist: string }> {
  return request<{ id: string; playlist: string }>('/live/open', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ src }),
  });
}

export function getProgress(): Promise<ProgressItem[]> {
  return request<ProgressItem[]>('/progress');
}

export function saveProgress(
  input: SaveProgressInput,
): Promise<ProgressItem | null> {
  return request<ProgressItem | null>('/progress', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function removeProgress(kind: string, id: string): Promise<void> {
  return request<void>(
    `/progress/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}

/** Build the proxied stream URL the <video>/hls.js should load. */
export function streamUrl(src: MediaSource): string {
  return `${BASE}/stream?src=${encodeURIComponent(src)}`;
}
