import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
  CreateDateColumn,
} from 'typeorm';
import { SeriesMetadata } from './series-metadata.entity';

@Entity('series_cast')
@Index(['seriesMetadataId'])
@Index(['actorName'])
export class SeriesCast {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => SeriesMetadata, (metadata) => metadata.cast, {
    onDelete: 'CASCADE',
  })
  metadata!: SeriesMetadata;

  @Column()
  seriesMetadataId!: number;

  @Column()
  actorName!: string;

  @Column({ nullable: true })
  character?: string;

  @Column({ nullable: true })
  tmdbPersonId?: number;

  @CreateDateColumn()
  createdAt!: Date;
}
