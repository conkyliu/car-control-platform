import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { Permission, SimplifiedTrajectoryDto } from '@car-control/contracts';
import { TelemetryService } from './telemetry.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';

@Controller('api/v1/telemetry')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  /**
   * 获取单车实时最新定位（热缓存）
   */
  @Get(':vehicleId/latest')
  @RequirePermissions(Permission.VEHICLE_READ)
  async getLatestLocation(@Param('vehicleId') vehicleId: string) {
    const location = await this.telemetryService.getLatestLocation(vehicleId);
    if (!location) {
      throw new NotFoundException(`Latest location for vehicle ${vehicleId} not found`);
    }
    return location;
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
    @Query('tolerance') tolerance?: string
  ): Promise<SimplifiedTrajectoryDto> {
    const start = startTime ? new Date(startTime) : new Date(Date.now() - 24 * 3600 * 1000);
    const end = endTime ? new Date(endTime) : new Date();
    const tol = tolerance !== undefined ? parseFloat(tolerance) : undefined;

    const points = await this.telemetryService.getTrajectory(vehicleId, start, end, tol);
    return {
      vehicleId,
      points,
      simplifiedCount: points.length,
      tolerance: tol,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    };
  }
}
