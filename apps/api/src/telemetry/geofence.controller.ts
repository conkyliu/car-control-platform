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
  Request,
} from '@nestjs/common';
import {
  Permission,
  GeofenceDto,
  CreateGeofenceDto,
  UpdateGeofenceDto,
  GeofenceFilterQueryDto,
  GeofenceStatus,
} from '@car-control/contracts';
import { TenantContext } from '@car-control/database';
import { GeofenceService } from './geofence.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';

@Controller('api/v1/geofences')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class GeofenceController {
  constructor(private readonly geofenceService: GeofenceService) {}

  private extractTenantId(req?: any): string {
    return (
      req?.user?.tenantId ||
      TenantContext.getOptional()?.tenantId ||
      'TENANT_DEFAULT'
    );
  }

  @Get()
  @RequirePermissions(Permission.DEVICE_READ)
  async listGeofences(
    @Query() query: GeofenceFilterQueryDto,
    @Request() req?: any
  ): Promise<GeofenceDto[]> {
    const tenantId = this.extractTenantId(req);
    return this.geofenceService.listGeofences(query, tenantId);
  }

  @Get(':id')
  @RequirePermissions(Permission.DEVICE_READ)
  async getGeofence(
    @Param('id') id: string,
    @Request() req?: any
  ): Promise<GeofenceDto> {
    const tenantId = this.extractTenantId(req);
    return this.geofenceService.getGeofenceById(id, tenantId);
  }

  @Post()
  @RequirePermissions(Permission.DEVICE_WRITE)
  async createGeofence(
    @Body() body: any,
    @Request() req?: any
  ): Promise<GeofenceDto> {
    const input: CreateGeofenceDto = body?.data ? body.data : body;
    const tenantId = this.extractTenantId(req);
    return this.geofenceService.createGeofence(input, tenantId);
  }

  @Put(':id')
  @RequirePermissions(Permission.DEVICE_WRITE)
  async updateGeofence(
    @Param('id') id: string,
    @Body() body: any,
    @Request() req?: any
  ): Promise<GeofenceDto> {
    const input: UpdateGeofenceDto = body?.data ? body.data : body;
    const tenantId = this.extractTenantId(req);
    return this.geofenceService.updateGeofence(id, input, tenantId);
  }

  @Patch(':id/status')
  @RequirePermissions(Permission.DEVICE_WRITE)
  async updateStatus(
    @Param('id') id: string,
    @Body() body: any,
    @Request() req?: any
  ): Promise<GeofenceDto> {
    const payload = body?.data ? body.data : body;
    const status: GeofenceStatus = payload?.status;
    const tenantId = this.extractTenantId(req);
    return this.geofenceService.updateStatus(id, status, tenantId);
  }

  @Delete(':id')
  @RequirePermissions(Permission.DEVICE_WRITE)
  async deleteGeofence(
    @Param('id') id: string,
    @Request() req?: any
  ): Promise<{ success: boolean; message: string }> {
    const tenantId = this.extractTenantId(req);
    return this.geofenceService.deleteGeofence(id, tenantId);
  }
}
