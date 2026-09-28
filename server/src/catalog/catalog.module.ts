import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { MetadataModule } from '../metadata/metadata.module';
import { XtreamService } from '../playlists/xtream.service';
import { CatalogController } from './catalog.controller';
import { CatalogRepository } from './catalog.repository';
import { CatalogService } from './catalog.service';

@Module({
  imports: [UsersModule, MetadataModule],
  controllers: [CatalogController],
  providers: [CatalogService, CatalogRepository, XtreamService],
  exports: [CatalogRepository, CatalogService],
})
export class CatalogModule {}
