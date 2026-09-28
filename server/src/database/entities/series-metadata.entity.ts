import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Unique,
  OneToMany,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SeriesCast } from './series-cast.entity';
import { SeriesCrew } from './series-crew.entity';
import { SeriesGenre } from './series-genre.entity';

/**
 * Series metadata from TMDB
 * Links to original series via series_id (from IPTV provider)
 */
@Entity('series_metadata')
@Unique(['seriesId'])
@Index(['tmdbId'])
@Index(['title'])
export class SeriesMetadata {
  @PrimaryGeneratedColumn()
  id!: number;

  /** Original series id from IPTV provider */
  @Column()
  seriesId!: string;

  /** TMDB id for future syncs */
  @Column({ nullable: true })
  tmdbId?: number;

  @Column()
  title!: string;

  @Column({ type: 'text', nullable: true })
  plot?: string;

  @Column({ nullable: true })
  yearStart?: number;

  @Column({ nullable: true })
  yearEnd?: number;

  @Column('decimal', { precision: 3, scale: 1, nullable: true })
  rating?: number; // TMDB rating (0-10)

  @Column('decimal', { precision: 3, scale: 1, nullable: true })
  imdbScore?: number; // IMDB score (0-10)

  @Column({ nullable: true })
  imdbId?: string; // IMDB ID (tt...)

  @Column({ nullable: true })
  posterUrl?: string;

  @Column({ nullable: true })
  firstAirDate?: string; // YYYY-MM-DD

  @Column({ nullable: true })
  status?: string; // 'Returning Series', 'Ended', etc.

  @OneToMany(() => SeriesCast, (cast) => cast.metadata, { eager: false })
  cast!: SeriesCast[];

  @OneToMany(() => SeriesCrew, (crew) => crew.metadata, { eager: false })
  crew!: SeriesCrew[];

  @OneToMany(() => SeriesGenre, (genre) => genre.metadata, { eager: false })
  genres!: SeriesGenre[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
