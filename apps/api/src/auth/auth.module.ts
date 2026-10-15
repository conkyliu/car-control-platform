import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { UserService } from '../user/user.service.js';
import { TenantService } from '../tenant/tenant.service.js';
import { AuditService } from '../audit/audit.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { PermissionsGuard } from './guards/permissions.guard.js';
import { TenantController } from '../tenant/tenant.controller.js';
import { UserController } from '../user/user.controller.js';
import { RoleController } from '../user/role.controller.js';

@Module({
  controllers: [TenantController, UserController, RoleController],
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
