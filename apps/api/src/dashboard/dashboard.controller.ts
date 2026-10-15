import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  Permission,
  DashboardSnapshotDto,
  DashboardStreamItem,
  DashboardTimeRange,
} from '@car-control/contracts';
import { DashboardService } from './dashboard.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';

@Controller('api/v1/dashboard')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('snapshot')
  @RequirePermissions(Permission.VEHICLE_READ)
  async getSnapshot(
    @Req() req: any,
    @Query('timeRange') timeRange?: DashboardTimeRange
  ): Promise<DashboardSnapshotDto> {
    const tenantId = req.user?.tenantId;
    return this.dashboardService.getSnapshot(timeRange, tenantId);
  }

  @Get('realtime-stream')
  @RequirePermissions(Permission.VEHICLE_READ)
  async getRealtimeStream(@Req() req: any): Promise<DashboardStreamItem[]> {
    const tenantId = req.user?.tenantId;
    return this.dashboardService.getRealtimeStream(tenantId);
  }
}
