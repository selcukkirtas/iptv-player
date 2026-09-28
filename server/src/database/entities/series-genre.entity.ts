import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
  CreateDateColumn,
} from 'typeorm';
import { SeriesMetadata } from './series-metadata.entity';

@Entity('series_genre')
@Index(['seriesMetadataId'])
@Index(['genreName'])
export class SeriesGenre {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => SeriesMetadata, (metadata) => metadata.genres, {
    onDelete: 'CASCADE',
  })
  metadata!: SeriesMetadata;

  @Column()
  seriesMetadataId!: number;

  @Column()
  genreName!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
