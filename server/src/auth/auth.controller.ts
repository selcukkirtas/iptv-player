import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { clearCookie, readCookie, setCookie } from '../common/cookies';
import { UsersService } from '../users/users.service';
import { isSelectable, toPickerUser } from '../users/users.types';
import { AuthService } from './auth.service';
import { AuthedRequest } from './auth.guard';
import { SESSION_COOKIE } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { Public } from './public.decorator';

/** Session cookie lifetime; long, because TV browsers are painful to type in. */
const COOKIE_MAX_AGE_S = Number(process.env.SESSION_IDLE_DAYS ?? 30) * 86_400;
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  /**
   * The "who's watching?" list. Public by necessity — it is shown before anyone
   * can log in — so it carries only what the picker draws: name, colour, and
   * whether a PIN will be asked for.
   */
  @Public()
  @Get('profiles')
  profiles() {
    return this.users.list().filter(isSelectable).map(toPickerUser);
  }

  /** Who the caller currently is, or `null` when not signed in. */
  @Public()
  @Get('session')
  session(@Req() req: AuthedRequest) {
    return { user: req.sessionUser ?? null };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = await this.auth.login(dto.userId, dto.pin ?? '');
    setCookie(res, SESSION_COOKIE, token, {
      maxAgeSeconds: COOKIE_MAX_AGE_S,
      secure: COOKIE_SECURE,
    });
    const user = this.users.getById(dto.userId);
    return { user: { id: user.id, name: user.name } };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(readCookie(req, SESSION_COOKIE));
    clearCookie(res, SESSION_COOKIE);
  }
}
