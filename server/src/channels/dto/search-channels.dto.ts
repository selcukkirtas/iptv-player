import { IsOptional, IsString } from 'class-validator';

export class SearchChannelsDto {
  /** Case-insensitive substring match on the channel name. */
  @IsOptional()
  @IsString()
  query?: string;

  /** Exact match against `group-title`. */
  @IsOptional()
  @IsString()
  group?: string;
}
