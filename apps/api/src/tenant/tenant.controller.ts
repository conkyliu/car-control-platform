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
  UseGuards,
} from '@nestjs/common';
import {
  Permission,
  TenantDto,
  CreateTenantInput,
  TenantQuotaDto,
  AdjustTenantQuotaInput,
  OrgNodeDto,
  CreateOrgInput,
} from '@car-control/contracts';
import { TenantService } from './tenant.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';

@Controller('api/v1')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(Permission.TENANT_MANAGE)
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get('tenants')
  @RequirePermissions(Permission.TENANT_MANAGE)
  async listTenants(): Promise<TenantDto[]> {
    return this.tenantService.listTenants();
  }

  @Post('tenants')
  @RequirePermissions(Permission.TENANT_MANAGE)
  async createTenant(@Body() input: CreateTenantInput): Promise<TenantDto> {
    return this.tenantService.createTenant(input);
  }

  @Get('tenants/:id')
  @RequirePermissions(Permission.TENANT_MANAGE)
  async getTenant(@Param('id') id: string): Promise<TenantDto> {
    return this.tenantService.getTenant(id);
  }

  @Put('tenants/:id')
  @RequirePermissions(Permission.TENANT_MANAGE)
  async updateTenant(
    @Param('id') id: string,
    @Body() input: Partial<CreateTenantInput>
  ): Promise<TenantDto> {
    return this.tenantService.updateTenant(id, input);
  }

  @Get('tenants/:id/quota')
  @RequirePermissions(Permission.TENANT_MANAGE)
  async getTenantQuota(@Param('id') id: string): Promise<TenantQuotaDto> {
    return this.tenantService.getTenantQuota(id);
  }

  @Put('tenants/:id/quota')
  @RequirePermissions(Permission.TENANT_MANAGE)
  async adjustTenantQuota(
    @Param('id') id: string,
    @Body() quota: AdjustTenantQuotaInput
  ): Promise<TenantQuotaDto> {
    return this.tenantService.adjustTenantQuota(id, quota);
  }

  @Patch('tenants/:id/status')
  @RequirePermissions(Permission.TENANT_MANAGE)
  async updateTenantStatus(
    @Param('id') id: string,
    @Body() body: { status?: string } | string
  ): Promise<{ success: boolean }> {
    const status =
      typeof body === 'object' && body !== null && 'status' in body
        ? (body.status as string)
        : String(body);
    return this.tenantService.updateTenantStatus(id, status);
  }

  @Get(['orgs/tree', 'tenants/orgs/tree'])
  @RequirePermissions(Permission.TENANT_MANAGE)
  async getOrgTree(@Query('tenantId') tenantId?: string): Promise<OrgNodeDto[]> {
    return this.tenantService.getOrgTree(tenantId);
  }

  @Post('orgs')
  @RequirePermissions(Permission.TENANT_MANAGE)
  async createOrg(@Body() input: CreateOrgInput): Promise<OrgNodeDto> {
    return this.tenantService.createOrg(input);
  }

  @Put('orgs/:id')
  @RequirePermissions(Permission.TENANT_MANAGE)
  async updateOrg(
    @Param('id') id: string,
    @Body() input: Partial<CreateOrgInput>
  ): Promise<OrgNodeDto> {
    return this.tenantService.updateOrg(id, input);
  }

  @Delete('orgs/:id')
  @RequirePermissions(Permission.TENANT_MANAGE)
  async deleteOrg(@Param('id') id: string): Promise<{ success: boolean }> {
    return this.tenantService.deleteOrg(id);
  }
}
