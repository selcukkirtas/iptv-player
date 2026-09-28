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
import { OpenLiveDto } from './dto/open-live.dto';
import { LiveService } from './live.service';

const CONTENT_TYPES: Record<string, string> = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
};

@Controller('live')
export class LiveController {
  constructor(
    private readonly service: LiveService,
    private readonly resolver: MediaResolverService,
  ) {}

  /** Start (or reuse) a live H.264 transcode and return its HLS playlist path. */
  @Post('open')
  @HttpCode(200)
  async open(@Body() dto: OpenLiveDto, @ActiveUserId() userId?: string) {
    // Resolve (and permission-check) before spawning a transcode: ffmpeg must
    // never be handed a URL that came straight from the browser.
    const media = await this.resolver.resolveSource(dto.src, userId);
    if (!(await isUpstreamAllowed(new URL(media.url)))) {
      throw new ForbiddenException('Upstream host is not permitted');
    }

    try {
      return await this.service.open(media.url);
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
