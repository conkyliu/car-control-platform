import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { UserService } from '../user/user.service.js';
import { TenantService } from '../tenant/tenant.service.js';
import { AuditService } from '../audit/audit.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { PermissionsGuard } from './guards/permissions.guard.js';
import { TenantController } from '../tenant/tenant.controller.js';

@Module({
  controllers: [TenantController],
  providers: [
    UserService,
    TenantService,
    AuditService,
    AuthService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [
    UserService,
    TenantService,
    AuditService,
    AuthService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
})
export class AuthModule {}
