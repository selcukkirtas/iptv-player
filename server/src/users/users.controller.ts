import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { AdminOnly } from '../auth/public.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';
import { toPublicUser } from './users.types';

/**
 * Profile management. Admin-only in full: a viewer who could edit profiles
 * could simply delete their own restrictions, so the only thing a non-admin
 * gets is the picker list on `/api/auth/profiles`.
 */
@AdminOnly()
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  list() {
    return this.service.list().map(toPublicUser);
  }

  @Post()
  @HttpCode(201)
  async create(@Body() dto: CreateUserDto) {
    return toPublicUser(await this.service.create(dto));
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return toPublicUser(await this.service.update(id, dto));
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
