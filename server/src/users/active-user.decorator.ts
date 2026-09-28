import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthedRequest } from '../auth/auth.guard';

/**
 * The logged-in profile's id, taken from the session the guard resolved.
 *
 * It used to come from an `X-User-Id` header, which any client could set to any
 * value — or omit, which read as "unrestricted". Reading it from the session
 * instead is what makes the per-profile category rules binding.
 */
export const ActiveUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    return req.sessionUser?.id;
  },
);

/** The whole logged-in profile, for routes that need more than the id. */
export const ActiveUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<AuthedRequest>().sessionUser,
);
