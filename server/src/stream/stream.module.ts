import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { StreamController } from './stream.controller';
import { StreamService } from './stream.service';

@Module({
  imports: [MediaModule],
  controllers: [StreamController],
  providers: [StreamService],
})
export class StreamModule {}
