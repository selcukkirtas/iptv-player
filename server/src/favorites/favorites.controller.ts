import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { publicFavorite } from '../common/public-view';
import { ActiveUserId } from '../users/active-user.decorator';
import { AddFavoriteDto } from './dto/add-favorite.dto';
import { FavoritesService } from './favorites.service';

@Controller('favorites')
export class FavoritesController {
  constructor(private readonly service: FavoritesService) {}

  @Get()
  list(@ActiveUserId() userId?: string) {
    return this.service.list(userId).map(publicFavorite);
  }

  @Post()
  @HttpCode(201)
  async add(@Body() dto: AddFavoriteDto, @ActiveUserId() userId?: string) {
    return publicFavorite(await this.service.add(dto.channelId, userId));
  }

  @Delete(':channelId')
  @HttpCode(204)
  remove(
    @Param('channelId') channelId: string,
    @ActiveUserId() userId?: string,
  ) {
    return this.service.remove(channelId, userId);
  }
}
