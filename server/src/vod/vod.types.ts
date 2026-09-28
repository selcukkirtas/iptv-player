export interface AudioTrack {
  /** Index among audio streams → maps to ffmpeg `0:a:<index>`. */
  index: number;
  language?: string;
  title?: string;
  codec?: string;
  channels?: number;
}

export interface SubtitleTrack {
  index: number;
  language?: string;
  title?: string;
  codec?: string;
  /** True for text subs (subrip/ass/…); image subs (pgs) can't become WebVTT. */
  textBased: boolean;
}

export interface MediaProbe {
  duration: number;
  videoCodec?: string;
  audioTracks: AudioTrack[];
  subtitleTracks: SubtitleTrack[];
}

export interface VodOpenResult {
  id: string;
  playlist: string;
  duration: number;
  /** Movie-time offset this session starts at (segments/cues are relative to it). */
  startPos: number;
  audioIndex: number;
  /** Active subtitle stream index, or -1 if none. */
  subtitleIndex: number;
  audioTracks: AudioTrack[];
  subtitleTracks: SubtitleTrack[];
}
