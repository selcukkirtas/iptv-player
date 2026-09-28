import { IsUrl } from 'class-validator';

export class ImportUrlDto {
  /**
   * Playlist URL. `require_tld: false` allows bare-IP / LAN hosts that are
   * common for IPTV providers (e.g. http://192.168.1.10:8080/get.php?...).
   */
  @IsUrl({ require_tld: false, require_protocol: true })
  url!: string;
}
