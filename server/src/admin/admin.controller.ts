import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthedRequest } from '../auth/auth.guard';
import { ADMIN_COOKIE } from '../auth/auth.types';
import { AdminOnly, Public } from '../auth/public.decorator';
import { clearCookie, readCookie, setCookie } from '../common/cookies';
import { AdminService } from './admin.service';
import {
  AdminLoginDto,
  AdminSetupDto,
  ChangeAdminPasswordDto,
  MIN_ADMIN_PASSWORD,
} from './dto/admin-login.dto';

const COOKIE_MAX_AGE_S =
  Number(process.env.ADMIN_SESSION_IDLE_HOURS ?? 12) * 3_600;
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';

/** The management console's own sign-in, behind `/admin` in the browser. */
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  /**
   * What the /admin screen needs before showing anything: whether a password
   * has been chosen yet, and whether this browser is already signed in.
   */
  @Public()
  @Get('status')
  status(@Req() req: AuthedRequest) {
    return {
      configured: this.admin.isConfigured(),
      signedIn: req.isAdmin === true,
      minPasswordLength: MIN_ADMIN_PASSWORD,
    };
  }

  /** First run only: choose the administrator password and sign straight in. */
  @Public()
  @Post('setup')
  @HttpCode(200)
  async setup(
    @Body() dto: AdminSetupDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.issue(res, await this.admin.setup(dto.password));
    return { signedIn: true };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: AdminLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.issue(res, await this.admin.login(dto.password));
    return { signedIn: true };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.admin.logout(readCookie(req, ADMIN_COOKIE));
    clearCookie(res, ADMIN_COOKIE);
  }

  /** Changing the password signs every console out, this one included. */
  @AdminOnly()
  @Put('password')
  @HttpCode(204)
  async changePassword(
    @Body() dto: ChangeAdminPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.admin.changePassword(dto.current, dto.next);
    clearCookie(res, ADMIN_COOKIE);
  }

  private issue(res: Response, token: string): void {
    setCookie(res, ADMIN_COOKIE, token, {
      maxAgeSeconds: COOKIE_MAX_AGE_S,
      secure: COOKIE_SECURE,
    });
  }
}
