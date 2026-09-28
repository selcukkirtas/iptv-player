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
import { MovieCast } from './movie-cast.entity';
import { MovieCrew } from './movie-crew.entity';
import { MovieGenre } from './movie-genre.entity';

/**
 * VOD movie metadata from TMDB
 * Links to original movie via movie_id (from IPTV provider)
 */
@Entity('movie_metadata')
@Unique(['movieId'])
@Index(['tmdbId'])
@Index(['title'])
export class MovieMetadata {
  @PrimaryGeneratedColumn()
  id!: number;

  /** Original movie id from IPTV provider */
  @Column()
  movieId!: string;

  /** TMDB id for future syncs */
  @Column({ nullable: true })
  tmdbId?: number;

  @Column()
  title!: string;

  @Column({ type: 'text', nullable: true })
  plot?: string;

  @Column({ nullable: true })
  year?: number;

  @Column('decimal', { precision: 3, scale: 1, nullable: true })
  rating?: number; // TMDB rating (0-10)

  @Column('decimal', { precision: 3, scale: 1, nullable: true })
  imdbScore?: number; // IMDB score (0-10)

  @Column({ nullable: true })
  imdbId?: string; // IMDB ID (tt...)

  @Column({ nullable: true })
  runtime?: number; // minutes

  @Column({ nullable: true })
  posterUrl?: string;

  @Column({ nullable: true })
  releaseDate?: string; // YYYY-MM-DD

  @OneToMany(() => MovieCast, (cast) => cast.metadata, { eager: false })
  cast!: MovieCast[];

  @OneToMany(() => MovieCrew, (crew) => crew.metadata, { eager: false })
  crew!: MovieCrew[];

  @OneToMany(() => MovieGenre, (genre) => genre.metadata, { eager: false })
  genres!: MovieGenre[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
