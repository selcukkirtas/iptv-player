import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class SearchCatalogDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsString()
  group?: string;

  // Metadata filtreleri
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  year?: number;

  @IsOptional()
  @IsString()
  genre?: string;

  @IsOptional()
  @IsString()
  actor?: string;

  @IsOptional()
  @IsString()
  director?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minRating?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxRating?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minImdbScore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxImdbScore?: number;

  // Pagination + sorting
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;

  /** 'title' | 'title_desc' | 'year' | 'rating' (default: provider order). */
  @IsOptional()
  @IsString()
  sort?: string;

  /** Primary audio-track language code (e.g. 'tur', 'eng'); movies only. */
  @IsOptional()
  @IsString()
  audioLang?: string;

  /** When 'true', keep only items whose category/name marks them subtitled. */
  @IsOptional()
  @IsString()
  subtitled?: string;
}
