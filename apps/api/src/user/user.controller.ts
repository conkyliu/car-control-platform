import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
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
  UserDto,
  UserQueryParams,
  CreateUserInput,
  UpdateUserInput,
} from '@car-control/contracts';
import { UserService } from './user.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';

function extractTenantId(req?: any): string | undefined {
  if (!req) return undefined;
  const isSuperAdmin = req.user?.roles?.includes(RoleCode.SUPER_ADMIN);
  const headerTenantId = req.headers?.['x-tenant-id'] || req.headers?.['X-Tenant-Id'];
  if (isSuperAdmin) {
    return headerTenantId || req.user?.tenantId;
  }
  return req.user?.tenantId || headerTenantId;
}

@Controller('api/v1/users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(Permission.USER_MANAGE)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @RequirePermissions(Permission.USER_MANAGE)
  async listUsers(
    @Query() query: UserQueryParams = {},
    @Req() req?: any
  ): Promise<UserDto[]> {
    const tenantId = extractTenantId(req);
    return this.userService.listUsers(query, tenantId);
  }

  @Post()
  @RequirePermissions(Permission.USER_MANAGE)
  async createUser(
    @Body() input: CreateUserInput,
    @Req() req?: any
  ): Promise<UserDto> {
    const tenantId = extractTenantId(req);
    return this.userService.createUser(input, tenantId);
  }

  @Put(':id')
  @RequirePermissions(Permission.USER_MANAGE)
  async updateUser(
    @Param('id') id: string,
    @Body() input: UpdateUserInput,
    @Req() req?: any
  ): Promise<UserDto> {
    const tenantId = extractTenantId(req);
    return this.userService.updateUser(id, input, tenantId);
  }

  @Delete(':id')
  @RequirePermissions(Permission.USER_MANAGE)
  async deleteUser(
    @Param('id') id: string,
    @Req() req?: any
  ): Promise<{ success: boolean }> {
    const tenantId = extractTenantId(req);
    return this.userService.deleteUser(id, tenantId);
  }

  @Post(':id/reset-password')
  @RequirePermissions(Permission.USER_MANAGE)
  async resetPassword(
    @Param('id') id: string,
    @Body() body?: { password?: string; newPassword?: string },
    @Req() req?: any
  ): Promise<{ success: boolean }> {
    const tenantId = extractTenantId(req);
    const newPassword = body?.password || body?.newPassword;
    return this.userService.resetPassword(id, newPassword, tenantId);
  }

  @Patch(':id/status')
  @RequirePermissions(Permission.USER_MANAGE)
  async updateUserStatus(
    @Param('id') id: string,
    @Body() body: { status?: string } | string,
    @Req() req?: any
  ): Promise<{ success: boolean }> {
    const tenantId = extractTenantId(req);
    const status =
      typeof body === 'object' && body !== null && 'status' in body
        ? (body.status as string)
        : String(body);
    return this.userService.updateUserStatus(id, status, tenantId);
  }
}
