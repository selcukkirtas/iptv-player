import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { ChannelsController } from './channels.controller';
import { ChannelsRepository } from './channels.repository';
import { ChannelsService } from './channels.service';

/**
 * Owns the channel catalog. `ChannelsRepository` is exported so the playlists
 * and favorites modules share the single in-memory/persisted instance.
 */
@Module({
  imports: [UsersModule],
  controllers: [ChannelsController],
  providers: [ChannelsService, ChannelsRepository],
  exports: [ChannelsRepository, ChannelsService],
})
export class ChannelsModule {}
