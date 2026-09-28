import { IsNotEmpty, IsString } from 'class-validator';

export class OpenLiveDto {
  /** Catalog reference (`channel:<id>`); resolved to a URL server-side. */
  @IsString()
  @IsNotEmpty()
  src!: string;
}
