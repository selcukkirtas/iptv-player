import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
  CreateDateColumn,
} from 'typeorm';
import { MovieMetadata } from './movie-metadata.entity';

@Entity('movie_genre')
@Index(['movieMetadataId'])
@Index(['genreName'])
export class MovieGenre {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => MovieMetadata, (metadata) => metadata.genres, {
    onDelete: 'CASCADE',
  })
  metadata!: MovieMetadata;

  @Column()
  movieMetadataId!: number;

  @Column()
  genreName!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
