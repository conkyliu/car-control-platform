import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import {
  AlarmStatus,
  AlarmType,
  AlarmLevel,
  ProcessAlarmDto,
  Permission,
} from '@car-control/contracts';
import { AlarmRecord } from '@car-control/domain-types';
import { TenantContext } from '@car-control/database';
import { AlarmService } from './alarm.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';

@Controller('api/v1/alarms')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AlarmController {
  constructor(private readonly alarmService: AlarmService) {}

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
   * 多维查询当前租户名下的告警列表
   */
  @Get()
  @RequirePermissions(Permission.VEHICLE_READ)
  async listAlarms(
    @Query('vehicleId') vehicleId?: string,
    @Query('status') status?: AlarmStatus,
    @Query('alarmType') alarmType?: AlarmType,
    @Query('alarmLevel') alarmLevel?: AlarmLevel,
    @Query('deviceNo') deviceNo?: string,
    @Request() req?: any
  ): Promise<AlarmRecord[]> {
    const session = this.resolveTenantSession(req);
    if (!session) {
      throw new BadRequestException('Tenant context missing');
    }

    return TenantContext.run(session, async () => {
      return this.alarmService.listAlarms({
        vehicleId,
        status,
        alarmType,
        alarmLevel,
        deviceNo,
      });
    });
  }

  /**
   * 获取单条告警详情
   */
  @Get(':id')
  @RequirePermissions(Permission.VEHICLE_READ)
  async getAlarmById(
    @Param('id') id: string,
    @Request() req?: any
  ): Promise<AlarmRecord> {
    const session = this.resolveTenantSession(req);
    if (!session) {
      throw new BadRequestException('Tenant context missing');
    }

    return TenantContext.run(session, async () => {
      const alarm = await this.alarmService.getAlarmById(id);
      if (!alarm) {
        throw new NotFoundException(`Alarm ${id} not found`);
      }
      return alarm;
    });
  }

  /**
   * 人工处置告警（确认处理 / 判定忽略）
   */
  @Post(':id/process')
  @RequirePermissions(Permission.VEHICLE_WRITE)
  async processAlarm(
    @Param('id') id: string,
    @Body() dto: ProcessAlarmDto,
    @Request() req?: any
  ): Promise<AlarmRecord> {
    const session = this.resolveTenantSession(req);
    if (!session) {
      throw new BadRequestException('Tenant context missing');
    }

    return TenantContext.run(session, async () => {
      try {
        return await this.alarmService.processAlarm(id, dto, session.userId);
      } catch (err: any) {
        if (err instanceof BadRequestException || err instanceof ConflictException || err instanceof NotFoundException) {
          throw err;
        }
        if (err.message?.includes('not found')) {
          throw new NotFoundException(err.message);
        }
        if (
          err.message?.includes('Invalid alarm status transition') ||
          err.message?.includes('terminal')
        ) {
          throw new ConflictException(err.message);
        }
        throw err;
      }
    });
  }
}
