import Hls from 'hls.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { openLive, openVod, streamUrl } from '../api/client';
import type { MediaSource, SubtitleTrack } from '../api/types';

const CODEC_MSG =
  "This channel's video format isn't supported by your browser (often HEVC / H.265).";
const TRANSCODE_FAIL_MSG =
  'This channel could not be played, even after converting it.';
import {
  disambiguate,
  getPreferredAudioLang,
  getPreferredSubtitleLang,
  isSubtitleLangDefault,
  getVideoFit,
  setVideoFit,
  trackLabel,
  type VideoFit,
} from '../settings';

interface Props {
  /** What to play, as a catalog reference the server resolves and authorizes. */
  src: MediaSource;
  ext?: string;
  live?: boolean;
  startAt?: number;
  onProgress?: (position: number, duration: number) => void;
  onEnded?: () => void;
  /** Surfaces the current audio/subtitle tracks + selectors so a page can show
   *  a visible track panel outside the player's gear menu. */
  onTracks?: (tracks: TrackControls) => void;
  /** Default subtitles on for this content (a "subtitled" category) when the
   *  viewer hasn't set a subtitle-language preference. */
  autoSubtitle?: boolean;
  /** Preferred subtitle language hint used with `autoSubtitle` (e.g. "tr"). */
  autoSubtitleLang?: string;
}

export interface AudioOption {
  value: number;
  label: string;
}

/** Audio/subtitle tracks plus their change handlers, lifted out of the player. */
export interface TrackControls {
  audioOptions: AudioOption[];
  audioValue: number;
  onAudioChange: (value: number) => void;
  subTracks: SubtitleTrack[];
  activeSub: number;
  onSubtitleChange: (index: number) => void;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/**
 * Player with custom YouTube-style controls. VOD uses a continuous server-side
 * remux session (one read produces both video and inline subtitles, like a
 * native player). The session starts at a movie offset, so seeking and
 * audio/subtitle changes re-open the session at the current position. Subtitles
 * arrive as an HLS subtitle rendition and are painted above the control bar.
 */
export function VideoPlayer({
  src,
  live = false,
  startAt,
  onProgress,
  onEnded,
  onTracks,
  autoSubtitle,
  autoSubtitleLang,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | undefined>(undefined);
  const startPosRef = useRef(0);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const onTracksRef = useRef(onTracks);
  onTracksRef.current = onTracks;
  const autoSubtitleRef = useRef(autoSubtitle);
  autoSubtitleRef.current = autoSubtitle;
  const autoSubtitleLangRef = useRef(autoSubtitleLang);
  autoSubtitleLangRef.current = autoSubtitleLang;
  const hideTimer = useRef<number | undefined>(undefined);
  const menuOpenRef = useRef(false);
  const activeSubRef = useRef(-1);
  const audioValueRef = useRef(-1);
  // Guards the one-shot HEVC→H.264 transcode fallback so we never loop on it.
  const triedTranscodeRef = useRef(false);
  // True once we're playing the transcoded stream, so a late/duplicate codec
  // error from the original source can't flash an error over working playback.
  const transcodedRef = useRef(false);
  // Native-HLS watchdog: catches Safari decoding video but silently failing the
  // audio codec (MP2/AC3), where no clean 'error' event fires.
  const watchdogRef = useRef<number | undefined>(undefined);

  const [status, setStatus] = useState<'preparing' | 'ready' | 'error'>(
    'preparing',
  );
  const [message, setMessage] = useState<string | null>(null);
  /**
   * Seconds spent preparing. Opening a source means probing the file and
   * producing the first HLS segment; on a small server that is comfortably over
   * ten seconds, and a motionless "Preparing stream…" reads as a hang.
   */
  const [waited, setWaited] = useState(0);

  const [audioOptions, setAudioOptions] = useState<AudioOption[]>([]);
  const [audioValue, setAudioValue] = useState<number>(-1);
  const [subTracks, setSubTracks] = useState<SubtitleTrack[]>([]);
  const [activeSub, setActiveSub] = useState<number>(-1);

  const [playing, setPlaying] = useState(false);
  const [curTime, setCurTime] = useState(0);
  const [movieDur, setMovieDur] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [cueText, setCueText] = useState('');
  const [seeking, setSeeking] = useState<number | null>(null);
  // 'contain' = fit (no crop, may letterbox); 'cover' = fill (crops the bars).
  const [fit, setFit] = useState<VideoFit>(getVideoFit);

  /** Set (or toggle) how the picture fills the screen; choice is persisted. */
  const applyFit = useCallback((mode?: VideoFit) => {
    setFit((prev) => {
      const next = mode ?? (prev === 'cover' ? 'contain' : 'cover');
      setVideoFit(next);
      return next;
    });
  }, []);

  menuOpenRef.current = menuOpen;
  activeSubRef.current = activeSub;
  audioValueRef.current = audioValue;
  const moviePos = startPosRef.current + curTime;

  const destroyHls = useCallback(() => {
    hlsRef.current?.destroy();
    hlsRef.current = undefined;
    if (watchdogRef.current) {
      window.clearTimeout(watchdogRef.current);
      watchdogRef.current = undefined;
    }
  }, []);

  const attachHls = useCallback(
    (
      playlist: string,
      onParsed?: (hls: Hls) => void,
      onUnsupported?: () => void,
    ) => {
      const video = videoRef.current;
      if (!video) return;
      destroyHls();
      // Drop any text tracks left over from a previous session so we never read
      // stale cues from them.
      for (let i = 0; i < video.textTracks.length; i++) {
        video.textTracks[i].mode = 'disabled';
      }
      // Kick off playback explicitly — the `autoplay` attribute is unreliable
      // for MSE/blob sources. If the browser blocks autoplay with sound, retry
      // muted (always allowed) so the channel still starts; the user can unmute.
      const autoplay = () => {
        video.play().catch(() => {
          video.muted = true;
          setMuted(true);
          video.play().catch(() => {});
        });
      };
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        hlsRef.current = hls;
        // Many transient errors (a dropped segment, a brief upstream hiccup) are
        // recoverable — only give up after a few attempts. Codec errors (HEVC /
        // H.265 channels the browser can't decode) are terminal.
        const recover = { net: 0, media: 0 };
        const codecErrors = new Set<string>([
          Hls.ErrorDetails.MANIFEST_INCOMPATIBLE_CODECS_ERROR,
          Hls.ErrorDetails.BUFFER_INCOMPATIBLE_CODECS_ERROR,
          Hls.ErrorDetails.BUFFER_ADD_CODEC_ERROR,
        ]);
        const fail = (msg: string) => {
          hls.stopLoad();
          setStatus('error');
          setMessage(msg);
        };
        // Unsupported codec (e.g. HEVC): hand off to the transcode fallback when
        // one is provided (live), otherwise surface the codec message.
        const giveUp = () => {
          if (onUnsupported) onUnsupported();
          else fail(CODEC_MSG);
        };
        hls.loadSource(playlist);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (codecErrors.has(data.details)) {
            giveUp();
            return;
          }
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            if (recover.net++ < 3) {
              hls.startLoad();
              return;
            }
            fail('Channel is offline or unreachable. Try again later.');
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            if (recover.media++ < 2) {
              hls.recoverMediaError();
              return;
            }
            giveUp();
          } else {
            fail('This stream could not be played.');
          }
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          recover.net = 0;
          recover.media = 0;
          setStatus('ready');
          onParsed?.(hls);
          autoplay();
        });
        // Deliberately *not* marked ready here. Attaching only means the
        // request is on its way; a live channel that is offline would otherwise
        // show an idle black player with controls for several seconds, which
        // reads as "waiting for me to press play" rather than "still loading".
        setStatus('preparing');
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS (Safari, many TV browsers). There's no hls.js error hook
        // here, so watch the <video> for a codec failure and run the same
        // transcode fallback (e.g. Safari can't decode this channel's audio).
        const nativeGiveUp = () => {
          video.onerror = null;
          if (watchdogRef.current) window.clearTimeout(watchdogRef.current);
          if (onUnsupported) onUnsupported();
          else {
            setStatus('error');
            setMessage(CODEC_MSG);
          }
        };
        video.onerror = () => {
          const code = video.error?.code;
          // 3 = MEDIA_ERR_DECODE, 4 = MEDIA_ERR_SRC_NOT_SUPPORTED (codec).
          if (code === 3 || code === 4) {
            nativeGiveUp();
            return;
          }
          // Anything else (a dead channel, a network drop) has to surface too,
          // or the player sits on "Preparing stream…" indefinitely.
          if (watchdogRef.current) window.clearTimeout(watchdogRef.current);
          setStatus('error');
          setMessage('Channel is offline or unreachable. Try again later.');
        };
        // Safari may decode the video but silently fail an unsupported audio
        // codec (MP2/AC3): it keeps "playing" with video.error set but no event.
        // Check shortly after start and fall back to the transcode if so.
        watchdogRef.current = window.setTimeout(() => {
          const code = video.error?.code;
          if (code === 3 || code === 4) nativeGiveUp();
        }, 6000);
        video.addEventListener(
          'loadedmetadata',
          () => {
            setStatus('ready');
            autoplay();
          },
          { once: true },
        );
        video.src = playlist;
        setStatus('preparing');
      } else {
        setStatus('error');
        setMessage('HLS playback is not supported in this browser.');
      }
    },
    [destroyHls],
  );

  useEffect(() => {
    if (status !== 'preparing') {
      setWaited(0);
      return;
    }
    const started = Date.now();
    const id = window.setInterval(
      () => setWaited(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => window.clearInterval(id);
  }, [status]);

  /** (Re)start the VOD session at a movie position with chosen audio/subtitle. */
  const loadVod = useCallback(
    async (
      position: number,
      audioIndex: number | undefined,
      // `undefined` on the first load lets the server apply the saved subtitle
      // language preference; an explicit number (incl. -1 = off) is an in-player
      // choice the server must honour verbatim.
      subtitleIndex: number | undefined,
      initial: boolean,
    ) => {
      setMessage(null);
      setStatus('preparing');
      setCueText('');
      try {
        // Subtitles default to English where the film offers it. A "subtitled"
        // category additionally gets its first text track turned on when the
        // viewer has expressed no opinion — so a Turkish subtitled film with no
        // English track still shows its own subtitles rather than none.
        const subPref = getPreferredSubtitleLang();
        const autoOn =
          initial && isSubtitleLangDefault() && !!autoSubtitleRef.current;
        const session = await openVod(src, {
          position: Math.max(0, Math.floor(position)),
          audioIndex,
          subtitleIndex,
          preferLang: initial
            ? getPreferredAudioLang() || undefined
            : undefined,
          // Prefer the chosen (or default English) language; the category hint
          // is only a fallback for the "subtitled" case above.
          preferSubLang: initial
            ? subPref || (autoOn ? autoSubtitleLangRef.current : undefined)
            : undefined,
          forceSubtitle: autoOn || undefined,
        });
        startPosRef.current = session.startPos;
        setCurTime(0);
        setMovieDur(session.duration);
        const audioLabels = disambiguate(session.audioTracks.map(trackLabel));
        setAudioOptions(
          session.audioTracks.map((t, i) => ({
            value: t.index,
            label: audioLabels[i],
          })),
        );
        setAudioValue(session.audioIndex);
        setActiveSub(session.subtitleIndex);
        if (initial) {
          setSubTracks(session.subtitleTracks.filter((t) => t.textBased));
        }
        attachHls(session.playlist);
      } catch (err) {
        setStatus('error');
        setMessage((err as Error).message);
      }
    },
    [src, attachHls],
  );

  /**
   * Swap a live channel for its server-side H.264/AAC transcode. Runs once
   * automatically on a codec failure; `manual` (a user button) forces a retry,
   * which also covers browsers that "play" but silently drop unsupported audio.
   */
  const startLiveTranscode = useCallback(
    (manual = false) => {
      // Already on the transcoded stream — ignore stray errors from the
      // original source (unless the user explicitly asks to convert again).
      if (transcodedRef.current && !manual) return;
      if (manual) {
        triedTranscodeRef.current = false;
        transcodedRef.current = false;
      }
      if (triedTranscodeRef.current) {
        setStatus('error');
        setMessage(CODEC_MSG);
        return;
      }
      triedTranscodeRef.current = true;
      setStatus('preparing');
      setMessage(null);
      openLive(src)
        .then(({ playlist }) => {
          transcodedRef.current = true;
          attachHls(playlist);
        })
        .catch(() => {
          setStatus('error');
          setMessage(TRANSCODE_FAIL_MSG);
        });
    },
    [src, attachHls],
  );

  useEffect(() => {
    setAudioOptions([]);
    setAudioValue(-1);
    setSubTracks([]);
    setActiveSub(-1);
    setMenuOpen(false);
    setCueText('');

    if (live) {
      triedTranscodeRef.current = false;
      transcodedRef.current = false;
      const onParsed = (hls: Hls) => {
        const tracks = hls.audioTracks ?? [];
        if (tracks.length > 1) {
          const labels = disambiguate(
            tracks.map(
              (t) => t.name || t.lang?.toUpperCase() || `Audio ${t.id}`,
            ),
          );
          setAudioOptions(
            tracks.map((t, i) => ({ value: t.id, label: labels[i] })),
          );
          setAudioValue(hls.audioTrack);
        }
      };
      // Browser can't decode this channel (HEVC, …): transcode server-side.
      attachHls(streamUrl(src), onParsed, () => startLiveTranscode());
    } else {
      void loadVod(startAt ?? 0, undefined, undefined, true);
    }
    return () => destroyHls();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, live]);

  // Mirror <video> state, paint subtitles from the HLS text track, report progress.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onVol = () => {
      setMuted(v.muted);
      setVolume(v.volume);
    };
    const onTime = () => {
      setCurTime(v.currentTime);
      // No subtitle selected → nothing to paint (and don't read stale tracks).
      if (activeSubRef.current < 0) {
        setCueText('');
        return;
      }
      // Read cues from the current session's track: the most recently added
      // subtitles track. Keep it 'hidden' so hls.js loads it but the browser
      // doesn't draw it behind our controls (we paint it ourselves).
      let track: TextTrack | null = null;
      for (let i = v.textTracks.length - 1; i >= 0; i--) {
        const tt = v.textTracks[i];
        if (tt.kind === 'subtitles' || tt.kind === 'captions') {
          track = tt;
          break;
        }
      }
      if (!track) return;
      if (track.mode === 'disabled' || track.mode === 'showing') {
        track.mode = 'hidden';
      }
      let text = '';
      const cues = track.activeCues;
      if (cues) {
        for (let j = 0; j < cues.length; j++) {
          text +=
            (text ? '\n' : '') +
            (cues[j] as VTTCue).text.replace(/<[^>]+>/g, '');
        }
      }
      setCueText(text.trim());
    };
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('volumechange', onVol);
    return () => {
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('volumechange', onVol);
    };
  }, []);

  useEffect(() => {
    const onFs = () =>
      setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // Picture-fill shortcut (keyboard / TV remote D-pad): Left = fit, Right = fill.
  // Up/Down are reserved for channel zapping on the live player, so the aspect
  // toggle uses the horizontal arrows to avoid clashing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const left = e.key === 'ArrowLeft' || e.keyCode === 37;
      const right = e.key === 'ArrowRight' || e.keyCode === 39;
      if (!left && !right) return;
      e.preventDefault();
      applyFit(left ? 'contain' : 'cover');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [applyFit]);

  // Progress (VOD): report movie position every 10s, on pause, on unmount; end → next.
  useEffect(() => {
    if (live) return;
    const v = videoRef.current;
    if (!v) return;
    const report = () => {
      const cb = onProgressRef.current;
      const pos = startPosRef.current + v.currentTime;
      if (cb && movieDur > 0 && pos > 0) cb(pos, movieDur);
    };
    const onEndedEv = () => {
      report();
      // Re-opening the session (seek / track change) can fire a spurious
      // 'ended' on the old media — only advance when playback really reached
      // (near) the end of the movie.
      const pos = startPosRef.current + v.currentTime;
      if (movieDur > 0 && pos >= movieDur - 10) onEndedRef.current?.();
    };
    const interval = window.setInterval(() => {
      if (!v.paused) report();
    }, 10_000);
    v.addEventListener('pause', report);
    v.addEventListener('ended', onEndedEv);
    return () => {
      window.clearInterval(interval);
      v.removeEventListener('pause', report);
      v.removeEventListener('ended', onEndedEv);
      report();
    };
  }, [src, live, movieDur]);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (!videoRef.current?.paused && !menuOpenRef.current) {
        setControlsVisible(false);
      }
    }, 3500);
  }, []);

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
    revealControls();
  }

  /** Jump to a movie position: instant within the produced range, else re-open. */
  function seekToMoviePos(target: number) {
    const v = videoRef.current;
    if (!v || live) return;
    const clamped = Math.max(0, Math.min(target, movieDur || target));
    const sessionTime = clamped - startPosRef.current;
    const producedEnd = v.seekable.length
      ? v.seekable.end(v.seekable.length - 1)
      : v.currentTime;
    if (sessionTime >= 0 && sessionTime <= producedEnd + 0.5) {
      v.currentTime = sessionTime; // already buffered — no re-buffer
    } else {
      void loadVod(clamped, audioValue, activeSub, false);
    }
  }

  function skipBy(delta: number) {
    const v = videoRef.current;
    if (!v) return;
    if (live) v.currentTime = Math.max(0, v.currentTime + delta);
    else seekToMoviePos(moviePos + delta);
    revealControls();
  }

  function commitSeek() {
    if (seeking === null || live) return;
    const target = seeking;
    setSeeking(null);
    seekToMoviePos(target);
  }

  // Stable handlers (read the live position/selection from refs/DOM, not from a
  // closure) so they can be lifted to the page panel without going stale as the
  // movie position ticks on.
  const onAudioChange = useCallback(
    (value: number) => {
      setMenuOpen(false);
      if (live) {
        setAudioValue(value);
        if (hlsRef.current) hlsRef.current.audioTrack = value;
      } else {
        const pos = startPosRef.current + (videoRef.current?.currentTime ?? 0);
        void loadVod(pos, value, activeSubRef.current, false);
      }
    },
    [live, loadVod],
  );

  const onSubtitleChange = useCallback(
    (index: number) => {
      setMenuOpen(false);
      if (!live) {
        const pos = startPosRef.current + (videoRef.current?.currentTime ?? 0);
        void loadVod(pos, audioValueRef.current, index, false);
      }
    },
    [live, loadVod],
  );

  // Mirror the current tracks + selectors out to the page (movie/episode detail
  // renders a visible Audio/Subtitles panel from this).
  useEffect(() => {
    onTracksRef.current?.({
      audioOptions,
      audioValue,
      onAudioChange,
      subTracks,
      activeSub,
      onSubtitleChange,
    });
  }, [
    audioOptions,
    audioValue,
    subTracks,
    activeSub,
    onAudioChange,
    onSubtitleChange,
  ]);

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stageRef.current?.requestFullscreen?.();
  }

  const hasMenu = audioOptions.length > 1 || subTracks.length > 0;
  const subLabels = disambiguate(
    subTracks.map(
      (t) => t.title || t.language?.toUpperCase() || `Track ${t.index}`,
    ),
  );
  const seekVal = seeking !== null ? seeking : moviePos;
  const seekPct = movieDur > 0 ? (seekVal / movieDur) * 100 : 0;

  return (
    <div className="player">
      <div
        ref={stageRef}
        className={`player-stage${controlsVisible || !playing ? ' show-controls' : ''}`}
        onMouseMove={revealControls}
        onTouchStart={revealControls}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          onClick={togglePlay}
          style={{ objectFit: fit }}
        />

        {status === 'preparing' && (
          <div className="player-status" role="status">
            Preparing stream…
            {waited >= 3 && (
              <span className="player-status-wait"> {waited}s</span>
            )}
          </div>
        )}

        {cueText && (
          <div
            className={`vp-subtitles${
              controlsVisible || !playing ? ' raised' : ''
            }`}
          >
            {cueText.split('\n').map((line, i) => (
              <span key={i}>{line}</span>
            ))}
          </div>
        )}

        <div className="vp-controls" role="group" aria-label="Player controls">
          {!live && (
            <input
              className="vp-seek"
              type="range"
              min={0}
              max={movieDur || 0}
              step="any"
              value={seekVal}
              aria-label="Seek"
              style={{ '--pct': `${seekPct}%` } as React.CSSProperties}
              onChange={(e) => setSeeking(Number(e.target.value))}
              onMouseUp={commitSeek}
              onTouchEnd={commitSeek}
              onKeyUp={commitSeek}
            />
          )}

          <div className="vp-row">
            {!live && (
              <button
                type="button"
                className="vp-btn"
                aria-label="Back 10 seconds"
                onClick={() => skipBy(-10)}
              >
                ⏪
              </button>
            )}
            <button
              type="button"
              className="vp-btn"
              aria-label={playing ? 'Pause' : 'Play'}
              onClick={togglePlay}
            >
              {playing ? '⏸' : '▶'}
            </button>
            {!live && (
              <button
                type="button"
                className="vp-btn"
                aria-label="Forward 10 seconds"
                onClick={() => skipBy(10)}
              >
                ⏩
              </button>
            )}

            <button
              type="button"
              className="vp-btn"
              aria-label={muted ? 'Unmute' : 'Mute'}
              onClick={() => {
                const v = videoRef.current;
                if (v) v.muted = !v.muted;
              }}
            >
              {muted || volume === 0 ? '🔇' : '🔊'}
            </button>
            <input
              className="vp-volume"
              type="range"
              min={0}
              max={1}
              step="0.05"
              value={muted ? 0 : volume}
              aria-label="Volume"
              onChange={(e) => {
                const v = videoRef.current;
                if (v) {
                  v.volume = Number(e.target.value);
                  v.muted = Number(e.target.value) === 0;
                }
              }}
            />

            <span className="vp-time">
              {live
                ? '● LIVE'
                : `${formatTime(moviePos)} / ${formatTime(movieDur)}`}
            </span>

            <div className="vp-spacer" />

            {hasMenu && (
              <div className="vp-menu-wrap">
                <button
                  type="button"
                  className={`vp-btn${menuOpen ? ' active' : ''}`}
                  aria-label="Audio and subtitles"
                  aria-haspopup="true"
                  aria-expanded={menuOpen}
                  onClick={() => {
                    setMenuOpen((o) => !o);
                    revealControls();
                  }}
                >
                  ⚙
                </button>
                {menuOpen && (
                  <div className="vp-menu" role="menu">
                    {audioOptions.length > 1 && (
                      <div className="vp-menu-section">
                        <div className="vp-menu-title">Audio</div>
                        {audioOptions.map((o) => (
                          <button
                            key={o.value}
                            type="button"
                            role="menuitemradio"
                            aria-checked={o.value === audioValue}
                            className={`vp-menu-item${o.value === audioValue ? ' active' : ''}`}
                            onClick={() => onAudioChange(o.value)}
                          >
                            {o.value === audioValue ? '● ' : '○ '}
                            {o.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {subTracks.length > 0 && (
                      <div className="vp-menu-section">
                        <div className="vp-menu-title">Subtitles</div>
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={activeSub === -1}
                          className={`vp-menu-item${activeSub === -1 ? ' active' : ''}`}
                          onClick={() => onSubtitleChange(-1)}
                        >
                          {activeSub === -1 ? '● ' : '○ '}Off
                        </button>
                        {subTracks.map((t, i) => (
                          <button
                            key={t.index}
                            type="button"
                            role="menuitemradio"
                            aria-checked={activeSub === t.index}
                            className={`vp-menu-item${activeSub === t.index ? ' active' : ''}`}
                            onClick={() => onSubtitleChange(t.index)}
                          >
                            {activeSub === t.index ? '● ' : '○ '}
                            {subLabels[i]}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              className={`vp-btn vp-btn-aspect${fit === 'cover' ? ' active' : ''}`}
              aria-label={
                fit === 'cover'
                  ? 'Fit picture (no crop)'
                  : 'Fill screen (crop edges)'
              }
              aria-pressed={fit === 'cover'}
              title="Fit / Fill (← →)"
              onClick={() => applyFit()}
            >
              {fit === 'cover' ? 'FILL' : 'FIT'}
            </button>

            <button
              type="button"
              className="vp-btn"
              aria-label="Fullscreen"
              onClick={toggleFullscreen}
            >
              {fullscreen ? '⤡' : '⛶'}
            </button>
          </div>
        </div>
      </div>

      {status === 'error' && message && (
        <p role="alert" className="error">
          {message}{' '}
          {live && (
            <button
              type="button"
              className="linklike"
              onClick={() => startLiveTranscode(true)}
            >
              Convert &amp; retry
            </button>
          )}
        </p>
      )}

      {live && status === 'ready' && (
        <p className="player-aux">
          No sound or wrong picture?{' '}
          <button
            type="button"
            className="linklike"
            onClick={() => startLiveTranscode(true)}
          >
            Convert stream
          </button>
        </p>
      )}
    </div>
  );
}
