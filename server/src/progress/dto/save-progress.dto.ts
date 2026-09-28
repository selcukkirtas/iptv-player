import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class SaveProgressDto {
  @IsIn(['movie', 'episode'])
  kind!: 'movie' | 'episode';

  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  poster?: string;

  @IsOptional()
  @IsString()
  ext?: string;

  @IsNumber()
  @Min(0)
  position!: number;

  @IsNumber()
  @Min(0)
  duration!: number;

  @IsOptional()
  @IsString()
  seriesId?: string;

  @IsOptional()
  @IsString()
  seriesName?: string;

  @IsOptional()
  @IsInt()
  season?: number;

  @IsOptional()
  @IsInt()
  episode?: number;
}
