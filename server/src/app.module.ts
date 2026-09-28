import { Module } from '@nestjs/common';
import { CatalogModule } from './catalog/catalog.module';
import { ChannelsModule } from './channels/channels.module';
import { FavoritesModule } from './favorites/favorites.module';
import { LiveModule } from './live/live.module';
import { PlaylistsModule } from './playlists/playlists.module';
import { ProgressModule } from './progress/progress.module';
import { StreamModule } from './stream/stream.module';
import { UsersModule } from './users/users.module';
import { VodModule } from './vod/vod.module';
import { DatabaseModule } from './database/database.module';
import { MetadataModule } from './metadata/metadata.module';
import { MediaModule } from './media/media.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    DatabaseModule,
    UsersModule,
    AuthModule,
    AdminModule,
    ChannelsModule,
    CatalogModule,
    MediaModule,
    PlaylistsModule,
    FavoritesModule,
    ProgressModule,
    StreamModule,
    VodModule,
    LiveModule,
    MetadataModule,
  ],
})
export class AppModule {}
