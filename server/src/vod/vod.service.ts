import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ChildProcess, spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, readdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { langMatches } from '../common/lang';
import { UPSTREAM_USER_AGENT } from '../common/upstream';
import { AudioTrack, MediaProbe, VodOpenResult } from './vod.types';

/**
 * Where VOD segments are written.
 *
 * Unlike live, a VOD session writes an EVENT playlist with `hls_list_size 0`:
 * nothing is deleted until the session is reaped, so seeking backwards works.
 * That means a whole film accumulates — roughly 2.5 MB per 4-second segment, so
 * a two-hour 5 Mbps title is several gigabytes. This must therefore point at
 * real storage with room to spare, **not** at a small RAM disk.
 */
const ROOT = process.env.VOD_SCRATCH_DIR ?? join(tmpdir(), 'iptv-vod');
const PRESET = process.env.TRANSCODE_PRESET ?? 'veryfast';
const PROBE_TIMEOUT_MS = 30_000;
const READY_TIMEOUT_MS = 60_000;
const IDLE_MS = 5 * 60_000; // a streaming session is reaped 5 min after last access

const TEXT_SUB_CODECS = new Set([
  'subrip',
  'srt',
  'ass',
  'ssa',
  'mov_text',
  'webvtt',
  'text',
]);
/** Video codecs we can remux (copy) straight into HLS; others are transcoded. */
const HLS_COPY_VIDEO = new Set(['h264', 'avc1']);

interface StreamSession {
  id: string;
  dir: string;
  proc: ChildProcess;
  lastAccess: number;
  ready: Promise<void>;
}

interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  channels?: number;
  tags?: { language?: string; title?: string };
}

/**
 * VOD playback that mirrors how a native player works: one continuous ffmpeg
 * pass reads the source once and outputs both the playable video (remuxed to
 * HLS — H.264 is stream-copied, no re-encode) and, in the same pass, the
 * subtitle as WebVTT. Because the subtitle packets are encountered inline while
 * reading, subtitles appear immediately, with no second slow extraction. The
 * session starts at a movie offset; seeking / track changes restart it there.
 */
@Injectable()
export class VodService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VodService.name);
  private readonly sessions = new Map<string, StreamSession>();
  private readonly probeCache = new Map<string, MediaProbe>();
  private sweeper?: NodeJS.Timeout;

  async onModuleInit(): Promise<void> {
    await rm(ROOT, { recursive: true, force: true });
    await mkdir(ROOT, { recursive: true });
    this.sweeper = setInterval(() => void this.reapIdle(), 30_000);
    this.sweeper.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.sweeper) clearInterval(this.sweeper);
    for (const s of this.sessions.values()) s.proc.kill('SIGKILL');
    await rm(ROOT, { recursive: true, force: true });
  }

  async open(
    url: string,
    opts: {
      position?: number;
      audioIndex?: number;
      preferLang?: string;
      subtitleIndex?: number;
      preferSubLang?: string;
      forceSubtitle?: boolean;
    } = {},
  ): Promise<VodOpenResult> {
    const probe = await this.probe(url);
    const audioIndex = this.pickAudio(
      probe.audioTracks,
      opts.audioIndex,
      opts.preferLang,
    );
    const startPos = Math.max(0, Math.floor(opts.position ?? 0));
    const subtitleIndex = this.pickSubtitle(
      probe.subtitleTracks,
      opts.subtitleIndex,
      opts.preferSubLang,
      opts.forceSubtitle,
    );

    const id = randomUUID();
    const dir = join(ROOT, id);
    await mkdir(dir, { recursive: true });

    const proc = this.spawn(url, dir, {
      startPos,
      audioIndex,
      subtitleIndex,
      copyVideo: HLS_COPY_VIDEO.has(probe.videoCodec ?? ''),
    });
    const session: StreamSession = {
      id,
      dir,
      proc,
      lastAccess: Date.now(),
      ready: Promise.resolve(),
    };
    session.ready = this.waitForFirstSegment(session);
    this.sessions.set(id, session);
    proc.on('exit', (code) => {
      if (code && code !== 0 && code !== 255) {
        this.logger.warn(`ffmpeg exited ${code} for session ${id}`);
      }
    });

    await session.ready;
    return {
      id,
      playlist: `/api/vod/${id}/master.m3u8`,
      duration: probe.duration,
      startPos,
      audioIndex,
      subtitleIndex,
      audioTracks: probe.audioTracks,
      subtitleTracks: probe.subtitleTracks,
    };
  }

  /** Absolute path of a session file (playlist, segment, or subs.vtt). */
  resolveFile(id: string, file: string): string | null {
    if (!/^[\w.-]+$/.test(file) || file.includes('..')) return null;
    const session = this.sessions.get(id);
    if (!session) return null;
    session.lastAccess = Date.now();
    const path = join(session.dir, file);
    return existsSync(path) ? path : null;
  }

  private spawn(
    url: string,
    dir: string,
    o: {
      startPos: number;
      audioIndex: number;
      subtitleIndex: number;
      copyVideo: boolean;
    },
  ): ChildProcess {
    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-user_agent',
      UPSTREAM_USER_AGENT,
    ];
    if (o.startPos > 0) args.push('-ss', String(o.startPos));
    args.push('-i', url);

    // Video: copy H.264 (no re-encode), else transcode.
    args.push('-map', '0:v:0');
    if (o.copyVideo) {
      args.push('-c:v', 'copy');
    } else {
      args.push('-c:v', 'libx264', '-preset', PRESET, '-crf', '23');
    }
    // Audio → stereo AAC.
    args.push(
      '-map',
      `0:a:${o.audioIndex}?`,
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-ac',
      '2',
    );
    // Subtitle (inline, same read) → an HLS subtitle rendition. Its WebVTT
    // segments are written incrementally as ffmpeg reads, so subtitles appear
    // straight away (a single webvtt file would only flush at the very end).
    let varMap = 'v:0,a:0';
    if (o.subtitleIndex >= 0) {
      args.push('-map', `0:s:${o.subtitleIndex}`, '-c:s', 'webvtt');
      varMap = 'v:0,a:0,s:0,sgroup:sub';
    }
    // HLS master + variant(s), growing EVENT playlists.
    args.push(
      '-f',
      'hls',
      '-hls_time',
      '4',
      '-hls_list_size',
      '0',
      '-hls_playlist_type',
      'event',
      '-hls_flags',
      'independent_segments',
      '-hls_segment_filename',
      join(dir, 'seg_%v_%05d.ts'),
      '-master_pl_name',
      'master.m3u8',
      '-var_stream_map',
      varMap,
      join(dir, 'stream_%v.m3u8'),
    );

    return spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
  }

  private async waitForFirstSegment(session: StreamSession): Promise<void> {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    const master = join(session.dir, 'master.m3u8');
    while (Date.now() < deadline) {
      if (session.proc.exitCode !== null && session.proc.exitCode !== 0) {
        throw new Error('Playback failed to start (ffmpeg exited).');
      }
      if (existsSync(master)) {
        const segs = (await readdir(session.dir)).filter((f) =>
          f.endsWith('.ts'),
        );
        if (segs.length > 0) return;
      }
      await delay(250);
    }
    session.proc.kill('SIGKILL');
    throw new Error('Playback timed out while starting.');
  }

  private pickAudio(
    tracks: AudioTrack[],
    explicit?: number,
    preferLang?: string,
  ): number {
    if (tracks.length === 0) return 0;
    if (explicit !== undefined && tracks.some((t) => t.index === explicit)) {
      return explicit;
    }
    if (preferLang) {
      const match = tracks.find((t) => langMatches(t.language, preferLang));
      if (match) return match.index;
    }
    return tracks[0].index;
  }

  private pickSubtitle(
    tracks: { index: number; language?: string; textBased: boolean }[],
    explicit?: number,
    preferLang?: string,
    forceOn?: boolean,
  ): number {
    const text = tracks.filter((t) => t.textBased);
    if (explicit !== undefined) {
      return text.some((t) => t.index === explicit) ? explicit : -1;
    }
    if (preferLang) {
      const match = text.find((t) => langMatches(t.language, preferLang));
      if (match) return match.index;
    }
    // "Subtitled" category with no language match: turn on the first text track
    // rather than leaving the viewer without subtitles.
    if (forceOn && text.length > 0) return text[0].index;
    return -1; // subtitles off by default
  }

  private async probe(url: string): Promise<MediaProbe> {
    const cached = this.probeCache.get(url);
    if (cached) return cached;

    const json = await this.runFfprobe(url);
    const data = JSON.parse(json) as {
      format?: { duration?: string };
      streams?: ProbeStream[];
    };
    const duration = parseFloat(data.format?.duration ?? '');
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('Could not determine media duration');
    }

    const audioTracks: AudioTrack[] = [];
    const subtitleTracks = [];
    let videoCodec: string | undefined;
    let ai = 0;
    let si = 0;
    for (const s of data.streams ?? []) {
      if (s.codec_type === 'video' && !videoCodec) {
        videoCodec = s.codec_name;
      } else if (s.codec_type === 'audio') {
        audioTracks.push({
          index: ai++,
          language: s.tags?.language,
          title: s.tags?.title,
          codec: s.codec_name,
          channels: s.channels,
        });
      } else if (s.codec_type === 'subtitle') {
        subtitleTracks.push({
          index: si++,
          language: s.tags?.language,
          title: s.tags?.title,
          codec: s.codec_name,
          textBased: TEXT_SUB_CODECS.has(s.codec_name ?? ''),
        });
      }
    }

    const probe: MediaProbe = {
      duration,
      videoCodec,
      audioTracks,
      subtitleTracks,
    };
    this.probeCache.set(url, probe);
    return probe;
  }

  private runFfprobe(url: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const proc = spawn(
        'ffprobe',
        [
          '-v',
          'error',
          '-user_agent',
          UPSTREAM_USER_AGENT,
          '-show_entries',
          'format=duration:stream=index,codec_type,codec_name,channels:stream_tags=language,title',
          '-of',
          'json',
          url,
        ],
        { stdio: ['ignore', 'pipe', 'ignore'] },
      );
      let out = '';
      proc.stdout?.on('data', (c: Buffer) => (out += c.toString()));
      const timer = setTimeout(() => proc.kill('SIGKILL'), PROBE_TIMEOUT_MS);
      proc.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      proc.on('exit', () => {
        clearTimeout(timer);
        if (out.trim()) resolve(out);
        else reject(new Error('ffprobe returned nothing'));
      });
    });
  }

  private async reapIdle(): Promise<void> {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastAccess > IDLE_MS) {
        session.proc.kill('SIGKILL');
        this.sessions.delete(id);
        await rm(session.dir, { recursive: true, force: true });
      }
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
