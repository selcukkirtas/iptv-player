import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class OpenVodDto {
  /**
   * Catalog reference (`movie:<id>` / `episode:<seriesId>:<episodeId>`). The
   * upstream URL is resolved server-side, so a client cannot point ffmpeg at an
   * arbitrary host and cannot see the provider credentials in the URL.
   */
  @IsString()
  @IsNotEmpty()
  src!: string;

  /** Movie-time offset to start playback at (seconds). */
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  /** Explicit audio stream index (0-based among audio streams). */
  @IsOptional()
  @IsInt()
  @Min(0)
  audioIndex?: number;

  /** Subtitle stream index to burn in / carry; omit or -1 for none. */
  @IsOptional()
  @IsInt()
  subtitleIndex?: number;

  /** Preferred audio language (ISO code) used when audioIndex is absent. */
  @IsOptional()
  @IsString()
  preferLang?: string;

  /** Preferred subtitle language (ISO code) used when subtitleIndex is absent. */
  @IsOptional()
  @IsString()
  preferSubLang?: string;

  /**
   * Turn subtitles on by default when no explicit index/preference matches —
   * used for "subtitled" categories so the viewer isn't left without subs.
   * Falls back to the first text-based subtitle track.
   */
  @IsOptional()
  @IsBoolean()
  forceSubtitle?: boolean;
}
