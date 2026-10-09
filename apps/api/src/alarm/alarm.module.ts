import { Module } from '@nestjs/common';
import {
  AlarmRepository,
  VehicleRepository,
} from '@car-control/database';
import { AlarmController } from './alarm.controller.js';
import { AlarmService } from './alarm.service.js';
import { WebSocketGatewayService } from '../realtime/websocket.gateway.js';
import { AuditService } from '../audit/audit.service.js';
import { DeviceStatusService } from '../device/device-status.service.js';
import { InMemoryMessagingAdapter } from '../messaging/in-memory-messaging.adapter.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';

@Module({
  controllers: [AlarmController],
  providers: [
    AlarmService,
    AlarmRepository,
    VehicleRepository,
    WebSocketGatewayService,
    AuditService,
    DeviceStatusService,
    {
      provide: 'MessagingPort',
      useClass: InMemoryMessagingAdapter,
    },
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [AlarmService, AlarmRepository],
})
export class AlarmModule {}
