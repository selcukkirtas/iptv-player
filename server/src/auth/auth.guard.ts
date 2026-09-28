import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AdminService } from '../admin/admin.service';
import { readCookie } from '../common/cookies';
import { AuthService } from './auth.service';
import { ADMIN_COOKIE, SESSION_COOKIE, SessionUser } from './auth.types';
import { IS_ADMIN, IS_PUBLIC } from './public.decorator';

/** The request, once the guard has attached whoever is signed in. */
export interface AuthedRequest extends Request {
  sessionUser?: SessionUser;
  isAdmin?: boolean;
}

/**
 * Applied globally, so **every** route requires a session unless it opts out
 * with `@Public()`. Default-deny is the point: the previous behaviour — no
 * profile header meant unrestricted — let anyone on the LAN skip every
 * restriction just by sending nothing.
 *
 * The two doors are independent. `@AdminOnly()` accepts only the administrator
 * cookie from `/admin`; a viewer's cookie never satisfies it, no matter which
 * profile it belongs to.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly admin: AdminService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const req = context.switchToHttp().getRequest<AuthedRequest>();

    const [user, isAdmin] = await Promise.all([
      this.auth.resolve(readCookie(req, SESSION_COOKIE)),
      this.admin.resolve(readCookie(req, ADMIN_COOKIE)),
    ]);
    // Attached even on public routes: the picker and the login endpoints want
    // to know whether the caller is already signed in.
    if (user) req.sessionUser = user;
    req.isAdmin = isAdmin;

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) {
      return true;
    }

    if (this.reflector.getAllAndOverride<boolean>(IS_ADMIN, targets)) {
      if (!isAdmin) {
        throw new ForbiddenException('Administrator sign-in required');
      }
      return true;
    }

    if (!user) {
      throw new UnauthorizedException('Select a profile to continue');
    }
    return true;
  }
}
