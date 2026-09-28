import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Unique,
  Index,
  CreateDateColumn,
} from 'typeorm';

/**
 * Primary audio-track language for a provider VOD, taken from the Xtream
 * panel's own probe (get_vod_info → info.audio.tags.language) — no ffprobe.
 * A row with lang = null means "probed, but the provider reported no language".
 */
@Entity('movie_audio')
@Unique(['movieId'])
export class MovieAudio {
  @PrimaryGeneratedColumn()
  id!: number;

  /** Provider movie id (stream id). */
  @Column()
  @Index()
  movieId!: string;

  /** ISO-ish language code, lowercased (e.g. 'tur', 'eng'); null if unknown. */
  @Column({ nullable: true })
  lang?: string;

  @CreateDateColumn()
  probedAt!: Date;
}
