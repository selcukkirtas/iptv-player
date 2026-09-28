import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
  CreateDateColumn,
} from 'typeorm';
import { MovieMetadata } from './movie-metadata.entity';

@Entity('movie_crew')
@Index(['movieMetadataId'])
@Index(['personName', 'role'])
export class MovieCrew {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => MovieMetadata, (metadata) => metadata.crew, {
    onDelete: 'CASCADE',
  })
  metadata!: MovieMetadata;

  @Column()
  movieMetadataId!: number;

  @Column()
  personName!: string;

  @Column()
  role!: string;

  @Column({ nullable: true })
  tmdbPersonId?: number;

  @CreateDateColumn()
  createdAt!: Date;
}
