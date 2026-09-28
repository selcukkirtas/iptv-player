import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { ChannelsModule } from '../channels/channels.module';
import { XtreamService } from '../playlists/xtream.service';
import { UsersModule } from '../users/users.module';
import { MediaResolverService } from './media-resolver.service';
import { StreamTicketService } from './stream-ticket.service';

/**
 * Resolves catalog references to upstream URLs. Every module that fetches or
 * transcodes a stream depends on this one, so permission checks and the ban on
 * client-supplied URLs are enforced in exactly one place.
 */
@Module({
  imports: [ChannelsModule, CatalogModule, UsersModule],
  providers: [MediaResolverService, StreamTicketService, XtreamService],
  exports: [MediaResolverService, StreamTicketService],
})
export class MediaModule {}
