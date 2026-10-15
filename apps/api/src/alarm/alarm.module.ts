import { Module } from '@nestjs/common';
import {
  AlarmRepository,
  VehicleRepository,
} from '@car-control/database';
import { AlarmController } from './alarm.controller.js';
import { AlarmService } from './alarm.service.js';
import { WebSocketGatewayService } from '../realtime/websocket.gateway.js';
import { DeviceStatusService } from '../device/device-status.service.js';
import { InMemoryMessagingAdapter } from '../messaging/in-memory-messaging.adapter.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [AlarmController],
  providers: [
    AlarmService,
    AlarmRepository,
    VehicleRepository,
    WebSocketGatewayService,
    DeviceStatusService,
    {
      provide: 'MessagingPort',
      useClass: InMemoryMessagingAdapter,
    },
  ],
  exports: [AlarmService, AlarmRepository],
})
export class AlarmModule {}
