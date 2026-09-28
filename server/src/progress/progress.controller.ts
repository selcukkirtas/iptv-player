import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
} from '@nestjs/common';
import { ActiveUserId } from '../users/active-user.decorator';
import { SaveProgressDto } from './dto/save-progress.dto';
import { ProgressService } from './progress.service';

@Controller('progress')
export class ProgressController {
  constructor(private readonly service: ProgressService) {}

  @Get()
  list(@ActiveUserId() userId?: string) {
    return this.service.list(userId);
  }

  @Put()
  @HttpCode(200)
  save(@Body() dto: SaveProgressDto, @ActiveUserId() userId?: string) {
    return this.service.save(dto, userId);
  }

  @Delete(':kind/:id')
  @HttpCode(204)
  remove(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @ActiveUserId() userId?: string,
  ) {
    return this.service.remove(kind, id, userId);
  }
}
