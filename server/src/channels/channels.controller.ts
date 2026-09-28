import { Controller, Get, Param, Query } from '@nestjs/common';
import { AdminOnly } from '../auth/public.decorator';
import { publicChannel } from '../common/public-view';
import { ActiveUserId } from '../users/active-user.decorator';
import { ChannelsService } from './channels.service';
import { SearchChannelsDto } from './dto/search-channels.dto';

@Controller('channels')
export class ChannelsController {
  constructor(private readonly service: ChannelsService) {}

  @Get()
  search(@Query() dto: SearchChannelsDto, @ActiveUserId() userId?: string) {
    const { items, total } = this.service.search(dto, userId);
    return { items: items.map(publicChannel), total };
  }

  @Get('groups')
  groups(@ActiveUserId() userId?: string) {
    return this.service.groups(userId);
  }

  /**
   * Every category, unfiltered — the list an admin picks from when granting a
   * profile access. Admin-only, since it necessarily discloses the categories a
   * restricted profile is not meant to know about.
   */
  @AdminOnly()
  @Get('all-groups')
  allGroups() {
    return this.service.groups(undefined);
  }

  @Get(':id')
  getOne(@Param('id') id: string, @ActiveUserId() userId?: string) {
    return publicChannel(this.service.getById(id, userId));
  }
}
