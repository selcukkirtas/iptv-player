import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
  CreateDateColumn,
} from 'typeorm';
import { SeriesMetadata } from './series-metadata.entity';

@Entity('series_crew')
@Index(['seriesMetadataId'])
@Index(['personName', 'role'])
export class SeriesCrew {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => SeriesMetadata, (metadata) => metadata.crew, {
    onDelete: 'CASCADE',
  })
  metadata!: SeriesMetadata;

  @Column()
  seriesMetadataId!: number;

  @Column()
  personName!: string;

  @Column()
  role!: string;

  @Column({ nullable: true })
  tmdbPersonId?: number;

  @CreateDateColumn()
  createdAt!: Date;
}
