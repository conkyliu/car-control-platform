import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  Permission,
  RoleCode,
  RoleDto,
  RoleDataScope,
  CreateRoleInput,
  UpdateRoleInput,
  UpdateRolePermissionsInput,
  PermissionTreeNode,
} from '@car-control/contracts';
import { UserService } from './user.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';

function extractTenantId(req?: any, fallbackTenantId?: string): string | undefined {
  if (!req) return fallbackTenantId;
  const isSuperAdmin = req.user?.roles?.includes(RoleCode.SUPER_ADMIN);
  const headerTenantId = req.headers?.['x-tenant-id'] || req.headers?.['X-Tenant-Id'];
  if (isSuperAdmin) {
    return headerTenantId || fallbackTenantId || req.user?.tenantId;
  }
  return req.user?.tenantId || headerTenantId || fallbackTenantId;
}

@Controller('api/v1')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(Permission.USER_MANAGE)
export class RoleController {
  constructor(private readonly userService: UserService) {}

  @Get('roles')
  @RequirePermissions(Permission.USER_MANAGE)
  async listRoles(
    @Query('tenantId') queryTenantId?: string,
    @Req() req?: any
  ): Promise<RoleDto[]> {
    const tenantId = extractTenantId(req, queryTenantId);
    return this.userService.listRoles(tenantId);
  }

  @Post('roles')
  @RequirePermissions(Permission.USER_MANAGE)
  async createRole(
    @Body() input: CreateRoleInput,
    @Req() req?: any
  ): Promise<RoleDto> {
    const tenantId = extractTenantId(req);
    return this.userService.createRole(input, tenantId);
  }

  @Put('roles/:id')
  @RequirePermissions(Permission.USER_MANAGE)
  async updateRole(
    @Param('id') id: string,
    @Body() input: UpdateRoleInput,
    @Req() req?: any
  ): Promise<RoleDto> {
    const tenantId = extractTenantId(req);
    return this.userService.updateRole(id, input, tenantId);
  }

  @Delete('roles/:id')
  @RequirePermissions(Permission.USER_MANAGE)
  async deleteRole(
    @Param('id') id: string,
    @Req() req?: any
  ): Promise<{ success: boolean }> {
    const tenantId = extractTenantId(req);
    return this.userService.deleteRole(id, tenantId);
  }

  @Put('roles/:id/permissions')
  @RequirePermissions(Permission.USER_MANAGE)
  async updateRolePermissions(
    @Param('id') id: string,
    @Body() body: UpdateRolePermissionsInput,
    @Req() req?: any
  ): Promise<RoleDto> {
    const tenantId = extractTenantId(req);
    return this.userService.updateRolePermissions(
      id,
      body.permissions,
      tenantId,
      body.dataScope
    );
  }

  @Get('permissions/tree')
  @RequirePermissions(Permission.USER_MANAGE)
  async getPermissionTree(): Promise<PermissionTreeNode[]> {
    return this.userService.getPermissionTree();
  }
}
