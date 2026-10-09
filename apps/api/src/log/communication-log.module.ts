import { Module } from '@nestjs/common';
import {
  CommunicationLogRepository,
  VehicleRepository,
} from '@car-control/database';
import { CommunicationLogController } from './communication-log.controller.js';
import { CommunicationLogService } from './communication-log.service.js';
import { DeviceStatusService } from '../device/device-status.service.js';
import { InMemoryMessagingAdapter } from '../messaging/in-memory-messaging.adapter.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';

@Module({
  controllers: [CommunicationLogController],
  providers: [
    CommunicationLogService,
    CommunicationLogRepository,
    VehicleRepository,
    DeviceStatusService,
    {
      provide: 'MessagingPort',
      useClass: InMemoryMessagingAdapter,
    },
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [CommunicationLogService, CommunicationLogRepository],
})
export class CommunicationLogModule {}
