import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportUrlDto } from './dto/import-url.dto';
import { XtreamImportDto } from './dto/xtream-import.dto';
import { PlaylistsService } from './playlists.service';
import { AdminOnly } from '../auth/public.decorator';

/** Max uploaded playlist size (50 MB covers very large provider playlists). */
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/**
 * Importing or re-syncing replaces the catalog every profile sees, so the whole
 * controller is administrator-only.
 */
@AdminOnly()
@Controller('playlists')
export class PlaylistsController {
  constructor(private readonly service: PlaylistsService) {}

  /** Current imported playlist metadata. */
  @Get()
  meta() {
    return this.service.getMeta();
  }

  /** The stored Xtream account (host/username/password) for pre-filling the form. */
  @Get('xtream')
  xtreamAccount() {
    return this.service.getXtreamAccount();
  }

  @Post('import')
  @HttpCode(200)
  importUrl(@Body() dto: ImportUrlDto) {
    return this.service.importFromUrl(dto.url);
  }

  @Post('xtream/test')
  @HttpCode(200)
  testXtream(@Body() dto: XtreamImportDto) {
    return this.service.testXtreamConnection(
      dto.host,
      dto.username,
      dto.password,
    );
  }

  @Post('xtream')
  @HttpCode(200)
  importXtream(@Body() dto: XtreamImportDto) {
    return this.service.importFromXtream(dto.host, dto.username, dto.password);
  }

  @Post('upload')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('file is required');
    }
    return this.service.importFromContent(file.buffer.toString('utf-8'));
  }

  @Post('metadata-sync')
  @HttpCode(202)
  refreshMetadata() {
    void this.service.refreshMetadata();
    return { started: true };
  }
}
