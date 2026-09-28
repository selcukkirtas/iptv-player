import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { LiveController } from './live.controller';
import { LiveService } from './live.service';

@Module({
  imports: [MediaModule],
  controllers: [LiveController],
  providers: [LiveService],
})
export class LiveModule {}
