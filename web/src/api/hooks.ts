import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import * as api from './client';
import type { MetadataBrowseParams, SearchChannelsParams } from './types';

export const queryKeys = {
  channels: (params: SearchChannelsParams) => ['channels', params] as const,
  groups: ['groups'] as const,
  channel: (id: string) => ['channel', id] as const,
  playlistMeta: ['playlist-meta'] as const,
  xtreamAccount: ['xtream-account'] as const,
  favorites: ['favorites'] as const,
  movies: (params: SearchChannelsParams) => ['movies', params] as const,
  movieGroups: ['movie-groups'] as const,
  movieFilterOptions: ['movie-filter-options'] as const,
  movie: (id: string) => ['movie', id] as const,
  series: (params: SearchChannelsParams) => ['series', params] as const,
  seriesGroups: ['series-groups'] as const,
  seriesFilterOptions: ['series-filter-options'] as const,
  seriesDetail: (id: string) => ['series-detail', id] as const,
  users: ['users'] as const,
};

export function useUsers() {
  return useQuery({ queryKey: queryKeys.users, queryFn: api.getUsers });
}

/** The public "who's watching?" list, shown before anyone signs in. */
export function useProfiles() {
  return useQuery({ queryKey: ['profiles'], queryFn: api.getProfiles });
}

/** Who we are signed in as; `null` sends the app to the picker. */
export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: api.getSession,
    retry: false,
    staleTime: 60_000,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof api.createUser>[0]) =>
      api.createUser(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.users }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Parameters<typeof api.updateUser>[1];
    }) => api.updateUser(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.users }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteUser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.users }),
  });
}

/**
 * Clear every profile-scoped query when switching profiles. We *remove* (not
 * just invalidate) so the previous profile's data — favorites, continue
 * watching, restricted listings — can never linger on screen during the
 * refetch; the new profile sees a clean load instead.
 */
export function invalidateForProfileSwitch(qc: QueryClient): void {
  for (const key of [
    'channels',
    'groups',
    'movies',
    'movie-groups',
    'series',
    'series-groups',
    'channel',
    'movie',
    'series-detail',
    'favorites',
    'progress',
  ]) {
    qc.removeQueries({ queryKey: [key] });
  }
}

export function useMovies(params: SearchChannelsParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.movies(params),
    queryFn: () => api.getMovies(params),
    enabled,
  });
}

export function useMovieGroups() {
  return useQuery({
    queryKey: queryKeys.movieGroups,
    queryFn: api.getMovieGroups,
  });
}

export function useMovieFilterOptions() {
  return useQuery({
    queryKey: queryKeys.movieFilterOptions,
    queryFn: api.getMovieFilterOptions,
  });
}

export function useMovie(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.movie(id ?? ''),
    queryFn: () => api.getMovie(id as string),
    enabled: Boolean(id),
  });
}

export function useSeriesList(params: SearchChannelsParams) {
  return useQuery({
    queryKey: queryKeys.series(params),
    queryFn: () => api.getSeries(params),
  });
}

export function useSeriesGroups() {
  return useQuery({
    queryKey: queryKeys.seriesGroups,
    queryFn: api.getSeriesGroups,
  });
}

export function useSeriesFilterOptions() {
  return useQuery({
    queryKey: queryKeys.seriesFilterOptions,
    queryFn: api.getSeriesFilterOptions,
  });
}

export function useSeriesDetail(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.seriesDetail(id ?? ''),
    queryFn: () => api.getSeriesDetail(id as string),
    enabled: Boolean(id),
  });
}

export function useProgress() {
  return useQuery({ queryKey: ['progress'], queryFn: api.getProgress });
}

export function useSaveProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof api.saveProgress>[0]) =>
      api.saveProgress(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['progress'] }),
  });
}

export function useRemoveProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, id }: { kind: string; id: string }) =>
      api.removeProgress(kind, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['progress'] }),
  });
}

export function useChannels(params: SearchChannelsParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.channels(params),
    queryFn: () => api.searchChannels(params),
    enabled,
  });
}

export function useGroups() {
  return useQuery({ queryKey: queryKeys.groups, queryFn: api.getGroups });
}

export function useChannel(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.channel(id ?? ''),
    queryFn: () => api.getChannel(id as string),
    enabled: Boolean(id),
  });
}

export function usePlaylistMeta() {
  return useQuery({
    queryKey: queryKeys.playlistMeta,
    queryFn: api.getPlaylistMeta,
  });
}

export function useXtreamAccount() {
  return useQuery({
    queryKey: queryKeys.xtreamAccount,
    queryFn: api.getXtreamAccount,
  });
}

export function useFavorites() {
  return useQuery({ queryKey: queryKeys.favorites, queryFn: api.getFavorites });
}

/* ----- Persisted metadata DB browsing ----- */

export function useMetadataStats() {
  return useQuery({
    queryKey: ['metadata-stats'],
    queryFn: api.getMetadataStats,
    // Keep the header counts live while an enrichment sync is running.
    refetchInterval: 15_000,
  });
}

export function useMetadataGenres(type: 'movie' | 'series') {
  return useQuery({
    queryKey: ['metadata-genres', type],
    queryFn: () => api.getMetadataGenres(type),
  });
}

export function useMetadataMovies(params: MetadataBrowseParams) {
  return useQuery({
    queryKey: ['metadata-movies', params],
    queryFn: () => api.getMetadataMovies(params),
  });
}

export function useGroupedMovies(params: MetadataBrowseParams) {
  return useQuery({
    queryKey: ['grouped-movies', params],
    queryFn: () => api.getGroupedMovies(params),
  });
}

export function useGroupedSeries(params: MetadataBrowseParams) {
  return useQuery({
    queryKey: ['grouped-series', params],
    queryFn: () => api.getGroupedSeries(params),
  });
}

export function useMetadataSeries(params: MetadataBrowseParams) {
  return useQuery({
    queryKey: ['metadata-series', params],
    queryFn: () => api.getMetadataSeries(params),
  });
}

function invalidateCatalog(qc: QueryClient): void {
  qc.invalidateQueries({ queryKey: ['channels'] });
  qc.invalidateQueries({ queryKey: ['groups'] });
  qc.invalidateQueries({ queryKey: ['movies'] });
  qc.invalidateQueries({ queryKey: ['movie-groups'] });
  qc.invalidateQueries({ queryKey: ['movie-filter-options'] });
  qc.invalidateQueries({ queryKey: ['movie'] });
  qc.invalidateQueries({ queryKey: ['series'] });
  qc.invalidateQueries({ queryKey: ['series-groups'] });
  qc.invalidateQueries({ queryKey: ['series-filter-options'] });
  qc.invalidateQueries({ queryKey: ['series-detail'] });
  qc.invalidateQueries({ queryKey: ['playlist-meta'] });
  qc.invalidateQueries({ queryKey: ['xtream-account'] });
}

export function useImportPlaylistUrl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (url: string) => api.importPlaylistUrl(url),
    onSuccess: () => invalidateCatalog(qc),
  });
}

export function useTestXtream() {
  return useMutation({
    mutationFn: (creds: Parameters<typeof api.testXtream>[0]) =>
      api.testXtream(creds),
  });
}

export function useImportXtream() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (creds: Parameters<typeof api.importXtream>[0]) =>
      api.importXtream(creds),
    onSuccess: () => invalidateCatalog(qc),
  });
}

export function useUploadPlaylist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api.uploadPlaylist(file),
    onSuccess: () => invalidateCatalog(qc),
  });
}

export function useMetadataSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.refreshMetadata(),
    onSuccess: () => invalidateCatalog(qc),
  });
}

export function useAddFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channelId: string) => api.addFavorite(channelId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.favorites }),
  });
}

export function useRemoveFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channelId: string) => api.removeFavorite(channelId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.favorites }),
  });
}
