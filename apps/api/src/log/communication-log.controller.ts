import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import {
  CommunicationDirection,
  CommunicationChannel,
  Permission,
} from '@car-control/contracts';
import { CommunicationLog } from '@car-control/domain-types';
import { TenantContext } from '@car-control/database';
import { CommunicationLogService } from './communication-log.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';

@Controller('api/v1/logs/communication')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CommunicationLogController {
  constructor(private readonly commLogService: CommunicationLogService) {}

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
   * 多维查询当前租户名下的通讯上下行报文日志
   */
  @Get()
  @RequirePermissions(Permission.DEVICE_READ)
  async queryLogs(
    @Query('vehicleId') vehicleId?: string,
    @Query('deviceNo') deviceNo?: string,
    @Query('traceId') traceId?: string,
    @Query('requestId') requestId?: string,
    @Query('direction') direction?: CommunicationDirection,
    @Query('channel') channel?: CommunicationChannel,
    @Query('topic') topic?: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
    @Request() req?: any
  ): Promise<CommunicationLog[]> {
    const session = this.resolveTenantSession(req);
    if (!session) {
      throw new BadRequestException('Tenant context missing');
    }

    return TenantContext.run(session, async () => {
      return this.commLogService.queryLogs({
        vehicleId,
        deviceNo,
        traceId,
        requestId,
        direction,
        channel,
        topic,
        startTime,
        endTime,
      });
    });
  }
}
