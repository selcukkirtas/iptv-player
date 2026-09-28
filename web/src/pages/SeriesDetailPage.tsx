import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useProgress, useSaveProgress, useSeriesDetail } from '../api/hooks';
import { VideoPlayer, type TrackControls } from '../components/VideoPlayer';
import { MetadataPills } from '../components/MetadataPills';
import { TrackPanel } from '../components/TrackPanel';
import { subtitleHintFromGroup } from '../catalog';
import { getAutoplayNext } from '../settings';
import type { Episode, SeriesDetail } from '../api/types';
import { episodeSource } from '../api/types';

export function SeriesDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const resumeEpisodeId = searchParams.get('ep');

  const detailQuery = useSeriesDetail(id);
  const progressQuery = useProgress();
  const saveProgress = useSaveProgress();

  const [season, setSeason] = useState<number | null>(null);
  const [current, setCurrent] = useState<Episode | null>(null);
  const [tracks, setTracks] = useState<TrackControls | null>(null);

  const detail = detailQuery.data;

  // Default season, and auto-select the episode from a "continue watching" link.
  useEffect(() => {
    if (!detail || detail.seasons.length === 0) return;
    if (resumeEpisodeId && !current) {
      for (const s of detail.seasons) {
        const ep = s.episodes.find((e) => e.id === resumeEpisodeId);
        if (ep) {
          setSeason(s.season);
          setCurrent(ep);
          return;
        }
      }
    }
    if (season === null) setSeason(detail.seasons[0].season);
  }, [detail, season, resumeEpisodeId, current]);

  if (detailQuery.isLoading || progressQuery.isLoading) {
    return <p role="status">Loading series…</p>;
  }
  if (detailQuery.isError || !detail) {
    return (
      <section>
        <p role="alert" className="error">
          Series not found.
        </p>
        <Link to="/series">← Back to series</Link>
      </section>
    );
  }

  const activeSeason =
    detail.seasons.find((s) => s.season === season) ?? detail.seasons[0];
  const resume = current
    ? progressQuery.data?.find(
        (p) => p.kind === 'episode' && p.id === current.id,
      )
    : undefined;
  const nextEpisode = current ? findNextEpisode(detail, current) : null;
  const subHint = subtitleHintFromGroup(detail.group);
  const meta = detail.metadata;
  const pills = buildSeriesPills(meta);

  function playNext() {
    if (nextEpisode) {
      setSeason(nextEpisode.season);
      setCurrent(nextEpisode);
    }
  }

  return (
    <section className="series-detail">
      <Link to="/series" className="back-link">
        ← Back to series
      </Link>

      {current && (
        <div className="now-playing">
          <VideoPlayer
            key={current.id}
            src={episodeSource(id ?? '', current.id)}
            ext={current.ext}
            startAt={resume?.position}
            onProgress={(position, duration) =>
              saveProgress.mutate({
                kind: 'episode',
                id: current.id,
                title: current.title,
                poster: detail.cover,
                ext: current.ext,
                position,
                duration,
                seriesId: detail.id,
                seriesName: detail.name,
                season: current.season,
                episode: current.episode,
              })
            }
            onTracks={setTracks}
            autoSubtitle={subHint.on}
            autoSubtitleLang={subHint.lang}
            onEnded={() => {
              if (getAutoplayNext()) playNext();
            }}
          />
          <div className="now-playing-row">
            <p className="now-playing-label" role="status">
              ▶ S{current.season} E{current.episode} — {current.title}
            </p>
            {nextEpisode && (
              <button type="button" className="next-button" onClick={playNext}>
                Next: S{nextEpisode.season} E{nextEpisode.episode} ⏭
              </button>
            )}
          </div>
          <TrackPanel tracks={tracks} />
        </div>
      )}

      <div className="series-head">
        {detail.cover && (
          <img src={detail.cover} alt="" className="series-cover" />
        )}
        <div>
          <h1>{detail.name}</h1>
          {detail.genre && <p className="channel-group">{detail.genre}</p>}
          {detail.plot && <p className="series-plot">{detail.plot}</p>}
          <section aria-label="TMDB metadata">
            <p className="count-note">
              Tap a tag to find every matching series in the database.
            </p>
            <div className="watch-meta-stats">
              <div className="watch-meta-stat">
                <span className="watch-meta-icon" aria-hidden="true">
                  📅
                </span>
                <div>
                  <span className="watch-meta-label">Start</span>
                  <span className="watch-meta-value">
                    {meta?.yearStart || '—'}
                  </span>
                </div>
              </div>
              <div className="watch-meta-stat">
                <span className="watch-meta-icon" aria-hidden="true">
                  🗓
                </span>
                <div>
                  <span className="watch-meta-label">End</span>
                  <span className="watch-meta-value">
                    {meta?.yearEnd || '—'}
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
            {((meta?.crew?.length ?? 0) > 0 ||
              (meta?.cast?.length ?? 0) > 0) && (
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
        </div>
      </div>

      {detail.seasons.length === 0 ? (
        <p role="status">No episodes available for this series.</p>
      ) : (
        <>
          {detail.seasons.length > 1 && (
            <div className="season-tabs" role="tablist" aria-label="Seasons">
              {detail.seasons.map((s) => (
                <button
                  key={s.season}
                  type="button"
                  role="tab"
                  aria-selected={s.season === activeSeason.season}
                  className={
                    s.season === activeSeason.season
                      ? 'season-tab active'
                      : 'season-tab'
                  }
                  onClick={() => setSeason(s.season)}
                >
                  Season {s.season}
                </button>
              ))}
            </div>
          )}

          <ul className="episode-list" aria-label="Episodes">
            {activeSeason.episodes.map((ep) => {
              const p = progressQuery.data?.find(
                (x) => x.kind === 'episode' && x.id === ep.id,
              );
              const pct =
                p && p.duration > 0
                  ? Math.round((p.position / p.duration) * 100)
                  : 0;
              return (
                <li key={ep.id}>
                  <button
                    type="button"
                    className="episode-button"
                    aria-current={current?.id === ep.id || undefined}
                    onClick={() => setCurrent(ep)}
                  >
                    <span className="episode-num">E{ep.episode}</span>
                    <span className="episode-title">{ep.title}</span>
                    {pct > 0 && (
                      <span className="episode-progress">{pct}%</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

/** The next episode in the season, else the first of the next non-empty season. */
function findNextEpisode(
  detail: SeriesDetail,
  current: Episode,
): Episode | null {
  const seasonIdx = detail.seasons.findIndex(
    (s) => s.season === current.season,
  );
  if (seasonIdx === -1) return null;

  const episodes = detail.seasons[seasonIdx].episodes;
  const epIdx = episodes.findIndex((e) => e.id === current.id);
  if (epIdx !== -1 && epIdx + 1 < episodes.length) {
    return episodes[epIdx + 1];
  }
  for (let i = seasonIdx + 1; i < detail.seasons.length; i++) {
    if (detail.seasons[i].episodes.length > 0) {
      return detail.seasons[i].episodes[0];
    }
  }
  return null;
}

function buildSeriesPills(meta?: {
  yearStart?: number;
  yearEnd?: number;
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
    pills.push({ label, to: `/series?${qs.toString()}` });
  };

  if (meta.yearStart) add(`Start ${meta.yearStart}`, { year: meta.yearStart });
  if (meta.yearEnd) add(`End ${meta.yearEnd}`, { year: meta.yearEnd });
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
