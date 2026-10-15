import { Module } from '@nestjs/common';
import {
  VehicleRepository,
  DeviceRepository,
  AlarmRepository,
  OtaPlanRepository,
} from '@car-control/database';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { AlarmModule } from '../alarm/alarm.module.js';
import { CommandService } from '../command/command.service.js';
import { DeviceStatusService } from '../device/device-status.service.js';
import { WebSocketGatewayService } from '../realtime/websocket.gateway.js';
import { InMemoryMessagingAdapter } from '../messaging/in-memory-messaging.adapter.js';
import { AuditService } from '../audit/audit.service.js';

@Module({
  imports: [AuthModule, AlarmModule],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    VehicleRepository,
    DeviceRepository,
    AlarmRepository,
    OtaPlanRepository,
    DeviceStatusService,
    WebSocketGatewayService,
    AuditService,
    CommandService,
    {
      provide: 'MessagingPort',
      useClass: InMemoryMessagingAdapter,
    },
  ],
  exports: [DashboardService],
})
export class DashboardModule {}
