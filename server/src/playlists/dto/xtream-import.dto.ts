import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class XtreamImportDto {
  /** Panel host, e.g. http://example.live:8080 */
  @IsUrl({ require_tld: false, require_protocol: true })
  host!: string;

  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}
