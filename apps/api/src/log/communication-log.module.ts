import { Module } from '@nestjs/common';
import {
  CommunicationLogRepository,
  VehicleRepository,
} from '@car-control/database';
import { CommunicationLogController } from './communication-log.controller.js';
import { CommunicationLogService } from './communication-log.service.js';
import { DeviceStatusService } from '../device/device-status.service.js';
import { InMemoryMessagingAdapter } from '../messaging/in-memory-messaging.adapter.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
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
  ],
  exports: [CommunicationLogService, CommunicationLogRepository],
})
export class CommunicationLogModule {}
