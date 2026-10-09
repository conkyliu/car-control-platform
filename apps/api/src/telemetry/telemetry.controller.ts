import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  NotFoundException,
  Request,
} from '@nestjs/common';
import { Permission, SimplifiedTrajectoryDto } from '@car-control/contracts';
import { TenantContext } from '@car-control/database';
import { TelemetryService } from './telemetry.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';

@Controller('api/v1/telemetry')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  private resolveTenantSession(req?: any) {
    const user = req?.user;
    if (user?.tenantId) {
      return {
        tenantId: user.tenantId,
        userId: user.sub || user.userId || 'system',
        roles: user.roles,
      };
    }
    const session = TenantContext.getOptional();
    if (session?.tenantId) {
      return session;
    }
    return null;
  }

  /**
   * 获取单车实时最新定位（热缓存）
   */
  @Get(':vehicleId/latest')
  @RequirePermissions(Permission.VEHICLE_READ)
  async getLatestLocation(
    @Param('vehicleId') vehicleId: string,
    @Request() req?: any
  ) {
    const session = this.resolveTenantSession(req);
    if (!session) {
      throw new NotFoundException(`Tenant context missing for vehicle ${vehicleId}`);
    }

    return TenantContext.run(session, async () => {
      const location = await this.telemetryService.getLatestLocation(vehicleId);
      if (!location) {
        throw new NotFoundException(`Latest location for vehicle ${vehicleId} not found`);
      }
      return location;
    });
  }

  /**
   * 查询车辆历史轨迹并进行 Douglas-Peucker 算法抽稀
   */
  @Get(':vehicleId/trajectory')
  @RequirePermissions(Permission.VEHICLE_READ)
  async getTrajectory(
    @Param('vehicleId') vehicleId: string,
    @Query('startTime') startTime: string,
    @Query('endTime') endTime: string,
    @Query('tolerance') tolerance?: string,
    @Request() req?: any
  ): Promise<SimplifiedTrajectoryDto> {
    const session = this.resolveTenantSession(req);
    if (!session) {
      throw new NotFoundException(`Tenant context missing for vehicle ${vehicleId}`);
    }

    const start = startTime ? new Date(startTime) : new Date(Date.now() - 24 * 3600 * 1000);
    const end = endTime ? new Date(endTime) : new Date();
    const tol = tolerance !== undefined ? parseFloat(tolerance) : undefined;

    return TenantContext.run(session, async () => {
      const points = await this.telemetryService.getTrajectory(vehicleId, start, end, tol);
      return {
        vehicleId,
        points,
        simplifiedCount: points.length,
        tolerance: tol,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      };
    });
  }
}
