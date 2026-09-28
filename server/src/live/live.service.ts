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
import { UPSTREAM_USER_AGENT } from '../common/upstream';

/**
 * Where live segments are written. A live session keeps a sliding window of six
 * segments (~15 MB), so this is cheap to put on a RAM disk — worth doing on a
 * host that boots from an SD card, since the window is rewritten continuously
 * for as long as anyone is watching.
 */
const ROOT = process.env.LIVE_SCRATCH_DIR ?? join(tmpdir(), 'iptv-live');
/**
 * x264 preset. `veryfast` keeps a comfortable real-time margin so the live edge
 * never falls behind (which is what causes periodic playback stalls). Bump to
 * `faster`/`fast` for more quality only if the CPU has plenty of headroom.
 */
const PRESET = process.env.TRANSCODE_PRESET ?? 'veryfast';
const CRF = process.env.LIVE_CRF ?? '23';
/** Bitrate ceiling + buffer: smooths keyframe spikes so the client never starves. */
const MAXRATE = process.env.LIVE_MAXRATE ?? '6M';
const BUFSIZE = process.env.LIVE_BUFSIZE ?? '12M';
/** Swap to e.g. `h264_qsv` / `h264_vaapi` when a GPU is passed into the container. */
const VIDEO_ENCODER = process.env.LIVE_VIDEO_ENCODER ?? 'libx264';
/** HLS segment length (s); keyframes are forced to land on segment boundaries. */
const HLS_TIME = Number(process.env.LIVE_HLS_TIME ?? 4);
/**
 * Manual A/V sync trim (seconds) for streams with a stubborn fixed offset that
 * the automatic `aresample` alignment can't fully absorb. Positive = audio is
 * ahead of the picture, so delay the audio; negative = audio lags, so advance
 * it by trimming its head. Leave at 0 for the automatic path only.
 */
const AUDIO_OFFSET = Number(process.env.LIVE_AUDIO_OFFSET ?? 0);
/** Cap on simultaneous transcodes so a burst of viewers can't overwhelm the host. */
const MAX_SESSIONS = Number(process.env.LIVE_MAX_SESSIONS ?? 6);
const READY_TIMEOUT_MS = 60_000;
const PROBE_TIMEOUT_MS = 15_000;
/** A live transcode is reaped this long after the last segment request. */
const IDLE_MS = 60_000;

/** Codecs the browser can play as-is, so we stream-copy instead of re-encoding. */
const COPY_VIDEO = new Set(['h264', 'avc1']);
const COPY_AUDIO = new Set(['aac', 'mp3', 'mp4a']);

interface LiveSession {
  id: string;
  url: string;
  dir: string;
  proc: ChildProcess;
  lastAccess: number;
  ready: Promise<void>;
}

/**
 * On-the-fly live transcoding for channels the browser can't decode natively —
 * chiefly HEVC/H.265. One ffmpeg process per upstream URL re-encodes video to
 * H.264 (audio to AAC) and writes a sliding-window HLS playlist; viewers of the
 * same channel share the session, which is reaped once nobody is watching.
 */
@Injectable()
export class LiveService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LiveService.name);
  private readonly sessions = new Map<string, LiveSession>();
  private readonly byUrl = new Map<string, string>();
  private sweeper?: NodeJS.Timeout;

  async onModuleInit(): Promise<void> {
    await rm(ROOT, { recursive: true, force: true });
    await mkdir(ROOT, { recursive: true });
    this.sweeper = setInterval(() => void this.reapIdle(), 15_000);
    this.sweeper.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.sweeper) clearInterval(this.sweeper);
    for (const s of this.sessions.values()) s.proc.kill('SIGKILL');
    await rm(ROOT, { recursive: true, force: true });
  }

  /** Start (or reuse) a transcode for `url`; returns its HLS playlist path. */
  async open(url: string): Promise<{ id: string; playlist: string }> {
    const existingId = this.byUrl.get(url);
    const existing = existingId ? this.sessions.get(existingId) : undefined;
    if (existing && existing.proc.exitCode === null) {
      existing.lastAccess = Date.now();
      await existing.ready;
      return { id: existing.id, playlist: this.playlistPath(existing.id) };
    }

    if (this.sessions.size >= MAX_SESSIONS) {
      throw new Error(
        `Too many live transcodes in progress (max ${MAX_SESSIONS}). Try again shortly.`,
      );
    }

    const id = randomUUID();
    const dir = join(ROOT, id);
    await mkdir(dir, { recursive: true });
    // Re-encode only what the browser can't play: keep H.264 video / AAC audio
    // as-is (cheap stream copy), transcode HEVC video and MP2/AC3 audio.
    const probe = await this.probe(url).catch(() => undefined);
    const proc = this.spawn(url, dir, {
      copyVideo: COPY_VIDEO.has(probe?.video ?? ''),
      copyAudio: COPY_AUDIO.has(probe?.audio ?? ''),
    });
    const session: LiveSession = {
      id,
      url,
      dir,
      proc,
      lastAccess: Date.now(),
      ready: Promise.resolve(),
    };
    session.ready = this.waitForFirstSegment(session);
    this.sessions.set(id, session);
    this.byUrl.set(url, id);
    proc.on('exit', (code) => {
      if (code && code !== 0 && code !== 255) {
        this.logger.warn(`ffmpeg(live) exited ${code} for ${id}`);
      }
    });

    await session.ready;
    return { id, playlist: this.playlistPath(id) };
  }

  /** Absolute path of a session file (playlist or segment). */
  resolveFile(id: string, file: string): string | null {
    if (!/^[\w.-]+$/.test(file) || file.includes('..')) return null;
    const session = this.sessions.get(id);
    if (!session) return null;
    session.lastAccess = Date.now();
    const path = join(session.dir, file);
    return existsSync(path) ? path : null;
  }

  private playlistPath(id: string): string {
    return `/api/live/${id}/index.m3u8`;
  }

  private spawn(
    url: string,
    dir: string,
    o: { copyVideo: boolean; copyAudio: boolean },
  ): ChildProcess {
    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-user_agent',
      UPSTREAM_USER_AGENT,
      '-fflags',
      '+genpts+discardcorrupt',
      '-i',
      url,
      '-map',
      '0:v:0',
    ];
    // Video: copy H.264 (no re-encode), else transcode HEVC/… to H.264.
    if (o.copyVideo) {
      args.push('-c:v', 'copy');
    } else {
      args.push('-c:v', VIDEO_ENCODER);
      if (VIDEO_ENCODER === 'libx264') {
        args.push(
          '-preset',
          PRESET,
          // Low-latency live encoding: no frame reordering/lookahead, so the
          // encoder stays at (or above) real time and the live edge never
          // stalls — the cause of periodic mid-playback pauses.
          '-tune',
          'zerolatency',
          '-crf',
          CRF,
          // Cap the bitrate (incl. keyframe spikes) so the client buffer can't
          // starve on a sudden burst.
          '-maxrate',
          MAXRATE,
          '-bufsize',
          BUFSIZE,
          '-profile:v',
          'high',
          '-pix_fmt',
          'yuv420p',
          // Force a keyframe at every segment boundary so each HLS segment is
          // independently decodable — cleaner joins, no per-segment artifacts.
          '-force_key_frames',
          `expr:gte(t,n_forced*${HLS_TIME})`,
          '-sc_threshold',
          '0',
        );
      } else {
        // A hardware encoder (h264_v4l2m2m on a Raspberry Pi, h264_qsv/vaapi on
        // a GPU) ignores x264's preset/CRF knobs and needs an explicit bitrate:
        // without one it falls back to the driver default, which is far too low
        // and looks broken. Keyframes are still pinned to segment boundaries so
        // every HLS segment decodes on its own.
        args.push(
          '-b:v',
          MAXRATE,
          '-maxrate',
          MAXRATE,
          '-bufsize',
          BUFSIZE,
          '-g',
          String(Math.max(1, Math.round(HLS_TIME * 25))),
          '-pix_fmt',
          'yuv420p',
        );
      }
    }
    // Audio: copy AAC/MP3, else transcode (MP2/AC3/…) to stereo AAC.
    args.push('-map', '0:a:0?');
    if (o.copyAudio) {
      args.push('-c:a', 'copy');
    } else {
      // `aresample=async=1:first_pts=0` pins the audio to the video clock:
      // first_pts=0 forces it to begin on the same zeroed timeline (kills the
      // constant lip-sync offset that comes from differing start timestamps and
      // the AAC encoder's priming delay), and async=1 inserts/drops samples to
      // correct any drift. An optional manual trim handles a residual offset.
      const filters = ['aresample=async=1:first_pts=0'];
      if (AUDIO_OFFSET > 0) {
        // Audio ahead → delay it (ms, applied to every channel).
        filters.push(`adelay=${Math.round(AUDIO_OFFSET * 1000)}:all=1`);
      } else if (AUDIO_OFFSET < 0) {
        // Audio behind → advance it by trimming its head, then rebase PTS.
        filters.push(`atrim=start=${-AUDIO_OFFSET}`, 'asetpts=PTS-STARTPTS');
      }
      args.push(
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-ac',
        '2',
        '-af',
        filters.join(','),
      );
    }
    // Sliding-window live HLS.
    args.push(
      '-f',
      'hls',
      '-hls_time',
      String(HLS_TIME),
      '-hls_list_size',
      '6',
      '-hls_flags',
      'delete_segments+independent_segments+omit_endlist',
      '-hls_segment_filename',
      join(dir, 'seg_%05d.ts'),
      join(dir, 'index.m3u8'),
    );
    return spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
  }

  private async waitForFirstSegment(session: LiveSession): Promise<void> {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    const playlist = join(session.dir, 'index.m3u8');
    while (Date.now() < deadline) {
      if (session.proc.exitCode !== null && session.proc.exitCode !== 0) {
        throw new Error('Live transcode failed to start (ffmpeg exited).');
      }
      if (existsSync(playlist)) {
        const segs = (await readdir(session.dir)).filter((f) =>
          f.endsWith('.ts'),
        );
        if (segs.length > 0) return;
      }
      await delay(250);
    }
    session.proc.kill('SIGKILL');
    throw new Error('Live transcode timed out while starting.');
  }

  /** First video + audio codec names, used to decide copy vs re-encode. */
  private probe(url: string): Promise<{ video?: string; audio?: string }> {
    return new Promise((resolve, reject) => {
      const proc = spawn(
        'ffprobe',
        [
          '-v',
          'error',
          '-user_agent',
          UPSTREAM_USER_AGENT,
          '-show_entries',
          'stream=codec_type,codec_name',
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
        try {
          const data = JSON.parse(out) as {
            streams?: { codec_type?: string; codec_name?: string }[];
          };
          const streams = data.streams ?? [];
          resolve({
            video: streams.find((s) => s.codec_type === 'video')?.codec_name,
            audio: streams.find((s) => s.codec_type === 'audio')?.codec_name,
          });
        } catch (e) {
          reject(e as Error);
        }
      });
    });
  }

  private async reapIdle(): Promise<void> {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastAccess > IDLE_MS) {
        session.proc.kill('SIGKILL');
        this.sessions.delete(id);
        if (this.byUrl.get(session.url) === id) this.byUrl.delete(session.url);
        await rm(session.dir, { recursive: true, force: true });
      }
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
