import { Global, Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminRepository } from './admin.repository';
import { AdminService } from './admin.service';

/**
 * Global because the app-wide `AuthGuard` resolves administrator cookies on
 * every request, so `AdminService` must be injectable everywhere.
 */
@Global()
@Module({
  controllers: [AdminController],
  providers: [AdminService, AdminRepository],
  exports: [AdminService],
})
export class AdminModule {}
