import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { VodController } from './vod.controller';
import { VodService } from './vod.service';

@Module({
  imports: [MediaModule],
  controllers: [VodController],
  providers: [VodService],
})
export class VodModule {}
