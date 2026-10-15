import { Module } from '@nestjs/common';
import {
  FirmwareRepository,
  OtaPlanRepository,
  OtaTaskRepository,
  VehicleRepository,
  DeviceRepository,
} from '@car-control/database';
import { FirmwareService } from './firmware.service.js';
import { OtaSafetyService } from './ota-safety.service.js';
import { OtaPlanService } from './ota-plan.service.js';
import { OtaProgressService } from './ota-progress.service.js';
import { OtaController } from './ota.controller.js';
import { WebSocketGatewayService } from '../realtime/websocket.gateway.js';
import { InMemoryMessagingAdapter } from '../messaging/in-memory-messaging.adapter.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [OtaController],
  providers: [
    FirmwareService,
    OtaSafetyService,
    OtaPlanService,
    OtaProgressService,
    FirmwareRepository,
    OtaPlanRepository,
    OtaTaskRepository,
    VehicleRepository,
    DeviceRepository,
    WebSocketGatewayService,
    {
      provide: 'MessagingPort',
      useClass: InMemoryMessagingAdapter,
    },
  ],
  exports: [
    FirmwareService,
    OtaSafetyService,
    OtaPlanService,
    OtaProgressService,
    FirmwareRepository,
    OtaPlanRepository,
    OtaTaskRepository,
  ],
})
export class OtaModule {}
