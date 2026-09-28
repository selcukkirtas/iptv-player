import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { SessionRepository } from './session.repository';

/**
 * Global so `AuthGuard` can be registered once as an `APP_GUARD` and cover
 * every controller in the app — a route is protected by default rather than by
 * remembering to decorate it.
 */
@Global()
@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionRepository,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthService, SessionRepository],
})
export class AuthModule {}
