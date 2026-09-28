import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMovie, useProgress, useSaveProgress } from '../api/hooks';
import { VideoPlayer, type TrackControls } from '../components/VideoPlayer';
import { MetadataPills } from '../components/MetadataPills';
import { TrackPanel } from '../components/TrackPanel';
import { subtitleHintFromGroup } from '../catalog';
import { movieSource } from '../api/types';

export function MovieWatchPage() {
  const { id } = useParams<{ id: string }>();
  const movieQuery = useMovie(id);
  const progressQuery = useProgress();
  const saveProgress = useSaveProgress();
  const [tracks, setTracks] = useState<TrackControls | null>(null);

  // Wait for both so the resume position is known before the player mounts.
  if (movieQuery.isLoading || progressQuery.isLoading) {
    return <p role="status">Loading movie…</p>;
  }
  if (movieQuery.isError || !movieQuery.data) {
    return (
      <section>
        <p role="alert" className="error">
          Movie not found.
        </p>
        <Link to="/movies">← Back to movies</Link>
      </section>
    );
  }

  const movie = movieQuery.data;
  const resume = progressQuery.data?.find(
    (p) => p.kind === 'movie' && p.id === movie.id,
  );
  const subHint = subtitleHintFromGroup(movie.group);
  const meta = movie.metadata;
  const pills = buildMoviePills(meta);

  return (
    <section className="watch">
      <Link to="/movies" className="back-link">
        ← Back to movies
      </Link>

      <VideoPlayer
        src={movieSource(movie.id)}
        ext={movie.ext}
        startAt={resume?.position}
        onTracks={setTracks}
        autoSubtitle={subHint.on}
        autoSubtitleLang={subHint.lang}
        onProgress={(position, duration) =>
          saveProgress.mutate({
            kind: 'movie',
            id: movie.id,
            title: movie.name,
            poster: movie.logo,
            ext: movie.ext,
            position,
            duration,
          })
        }
      />

      <div className="watch-info">
        <div className="watch-header">
          <p className="watch-kicker">Movie</p>
          <h1>{movie.name}</h1>
          {movie.group && <p className="channel-group">{movie.group}</p>}
        </div>
        {meta?.plot && <p className="watch-plot">{meta.plot}</p>}
        <section className="watch-meta" aria-label="TMDB metadata">
          <div className="watch-meta-head">
            <h2>TMDB metadata</h2>
            <p>Tap a tag to open a filtered movie list.</p>
          </div>
          <div className="watch-meta-stats">
            <div className="watch-meta-stat">
              <span className="watch-meta-icon" aria-hidden="true">
                📅
              </span>
              <div>
                <span className="watch-meta-label">Year</span>
                <span className="watch-meta-value">{meta?.year || '—'}</span>
              </div>
            </div>
            <div className="watch-meta-stat">
              <span className="watch-meta-icon" aria-hidden="true">
                ⏱
              </span>
              <div>
                <span className="watch-meta-label">Runtime</span>
                <span className="watch-meta-value">
                  {meta?.runtime ? `${meta.runtime} min` : '—'}
                </span>
              </div>
            </div>
            <div className="watch-meta-stat">
              <span className="watch-meta-icon" aria-hidden="true">
                ⭐
              </span>
              <div>
                <span className="watch-meta-label">TMDB</span>
                <span className="watch-meta-value">
                  {meta?.rating ? meta.rating.toFixed(1) : '—'}
                </span>
              </div>
            </div>
            {meta?.imdbScore && (
              <div className="watch-meta-stat">
                <span className="watch-meta-icon" aria-hidden="true">
                  🎬
                </span>
                <div>
                  <span className="watch-meta-label">IMDb</span>
                  <span className="watch-meta-value">
                    {meta.imdbScore.toFixed(1)}
                  </span>
                </div>
              </div>
            )}
          </div>
          {pills.length > 0 && <MetadataPills pills={pills} />}
          {((meta?.crew?.length ?? 0) > 0 || (meta?.cast?.length ?? 0) > 0) && (
            <div className="watch-meta-people">
              {meta?.crew && meta.crew.length > 0 && (
                <div className="people-group">
                  <h3>🎬 Directors</h3>
                  <ul>
                    {meta.crew
                      .filter((c) => c.role === 'Director')
                      .slice(0, 5)
                      .map((c, i) => (
                        <li key={i}>{c.personName}</li>
                      ))}
                  </ul>
                </div>
              )}
              {meta?.cast && meta.cast.length > 0 && (
                <div className="people-group">
                  <h3>🎭 Cast</h3>
                  <ul>
                    {meta.cast.slice(0, 8).map((c, i) => (
                      <li key={i}>
                        {c.actorName}
                        {c.character && (
                          <span className="character"> as {c.character}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
        <TrackPanel tracks={tracks} />
        {resume && (
          <p className="count-note">
            Resumed from {formatTime(resume.position)}.
          </p>
        )}
      </div>
    </section>
  );
}

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

function buildMoviePills(meta?: {
  year?: number;
  imdbScore?: number;
  genres?: Array<{ genreName: string }>;
  cast?: Array<{ actorName: string }>;
  crew?: Array<{ personName: string; role: string }>;
}) {
  if (!meta) return [];
  const pills: Array<{ label: string; to: string }> = [];
  const add = (label: string, params: Record<string, string | number>) => {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params))
      qs.set(key, String(value));
    if (
      !pills.some((pill) => pill.label === label && pill.to === `/movies?${qs}`)
    ) {
      pills.push({ label, to: `/movies?${qs.toString()}` });
    }
  };

  if (meta.year) add(`Year ${meta.year}`, { year: meta.year });
  if (meta.imdbScore)
    add(`IMDB ${meta.imdbScore.toFixed(1)}+`, { minImdbScore: meta.imdbScore });
  meta.genres?.forEach((g) =>
    add(`Genre: ${g.genreName}`, { genre: g.genreName }),
  );
  meta.crew
    ?.filter((c) => c.role === 'Director')
    .forEach((c) =>
      add(`Director: ${c.personName}`, { director: c.personName }),
    );
  meta.cast
    ?.slice(0, 8)
    .forEach((c) => add(`Actor: ${c.actorName}`, { actor: c.actorName }));
  return pills;
}
