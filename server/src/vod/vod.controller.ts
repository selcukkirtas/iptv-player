import {
  BadGatewayException,
  Body,
  ForbiddenException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { isUpstreamAllowed } from '../common/net-guard';
import { MediaResolverService } from '../media/media-resolver.service';
import { ActiveUserId } from '../users/active-user.decorator';
import { OpenVodDto } from './dto/open-vod.dto';
import { VodService } from './vod.service';

const CONTENT_TYPES: Record<string, string> = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.vtt': 'text/vtt',
};

@Controller('vod')
export class VodController {
  constructor(
    private readonly service: VodService,
    private readonly resolver: MediaResolverService,
  ) {}

  /** Start a continuous remux session and return its HLS playlist path. */
  @Post('open')
  @HttpCode(200)
  async open(@Body() dto: OpenVodDto, @ActiveUserId() userId?: string) {
    // Resolving first is what stops a client from naming its own URL: an entry
    // the profile may not watch never reaches ffmpeg.
    const media = await this.resolver.resolveSource(dto.src, userId);
    if (!(await isUpstreamAllowed(new URL(media.url)))) {
      throw new ForbiddenException('Upstream host is not permitted');
    }

    try {
      return await this.service.open(media.url, {
        position: dto.position,
        audioIndex: dto.audioIndex,
        preferLang: dto.preferLang,
        subtitleIndex: dto.subtitleIndex,
        preferSubLang: dto.preferSubLang,
        forceSubtitle: dto.forceSubtitle,
      });
    } catch (err) {
      throw new BadGatewayException((err as Error).message);
    }
  }

  @Get(':id/:file')
  serve(
    @Param('id') id: string,
    @Param('file') file: string,
    @Res() res: Response,
  ): void {
    const path = this.service.resolveFile(id, file);
    if (!path) throw new NotFoundException('Not found or session expired');

    const ext = file.slice(file.lastIndexOf('.'));
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    if (CONTENT_TYPES[ext]) res.setHeader('Content-Type', CONTENT_TYPES[ext]);
    res.sendFile(path);
  }
}
