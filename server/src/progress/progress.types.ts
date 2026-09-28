/** A "continue watching" entry: where the user left off in a movie/episode. */
export interface ProgressItem {
  /** Owning profile id; entries are only shown to their own profile. */
  userId?: string;
  kind: 'movie' | 'episode';
  /** movieId or episodeId — unique together with `kind`. */
  id: string;
  title: string;
  poster?: string;
  ext?: string;
  position: number; // seconds watched
  duration: number; // total seconds
  updatedAt: string; // ISO timestamp
  // Episode context (for display + resume navigation):
  seriesId?: string;
  seriesName?: string;
  season?: number;
  episode?: number;
}
