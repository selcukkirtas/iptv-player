import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
  CreateDateColumn,
} from 'typeorm';
import { MovieMetadata } from './movie-metadata.entity';

@Entity('movie_cast')
@Index(['movieMetadataId'])
@Index(['actorName'])
export class MovieCast {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => MovieMetadata, (metadata) => metadata.cast, {
    onDelete: 'CASCADE',
  })
  metadata!: MovieMetadata;

  @Column()
  movieMetadataId!: number;

  @Column()
  actorName!: string;

  @Column({ nullable: true })
  character?: string;

  @Column({ nullable: true })
  tmdbPersonId?: number;

  @CreateDateColumn()
  createdAt!: Date;
}
