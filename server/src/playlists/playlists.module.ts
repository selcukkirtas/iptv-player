import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { ChannelsModule } from '../channels/channels.module';
import { PlaylistsController } from './playlists.controller';
import { PlaylistsService } from './playlists.service';
import { XtreamService } from './xtream.service';

@Module({
  imports: [ChannelsModule, CatalogModule],
  controllers: [PlaylistsController],
  providers: [PlaylistsService, XtreamService],
})
export class PlaylistsModule {}
