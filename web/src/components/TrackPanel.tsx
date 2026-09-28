import { disambiguate } from '../settings';
import type { TrackControls } from './VideoPlayer';

/**
 * Visible audio/subtitle selector shown on the movie/episode detail screen,
 * mirroring the player's gear menu so the available languages are on the page
 * (not hidden) and can be switched without opening the overlay.
 */
export function TrackPanel({ tracks }: { tracks: TrackControls | null }) {
  if (!tracks) return null;
  const {
    audioOptions,
    audioValue,
    onAudioChange,
    subTracks,
    activeSub,
    onSubtitleChange,
  } = tracks;

  const hasAudio = audioOptions.length > 0;
  const hasSubs = subTracks.length > 0;
  if (!hasAudio && !hasSubs) return null;

  const subLabels = disambiguate(
    subTracks.map(
      (t) => t.title || t.language?.toUpperCase() || `Track ${t.index}`,
    ),
  );

  return (
    <div className="track-panel" aria-label="Audio and subtitles">
      {hasAudio && (
        <div className="control">
          <label htmlFor="track-audio">Audio</label>
          <select
            id="track-audio"
            value={audioValue}
            disabled={audioOptions.length < 2}
            onChange={(e) => onAudioChange(Number(e.target.value))}
          >
            {audioOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {hasSubs && (
        <div className="control">
          <label htmlFor="track-sub">Subtitles</label>
          <select
            id="track-sub"
            value={activeSub}
            onChange={(e) => onSubtitleChange(Number(e.target.value))}
          >
            <option value={-1}>Off</option>
            {subTracks.map((t, i) => (
              <option key={t.index} value={t.index}>
                {subLabels[i]}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
