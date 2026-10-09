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
import { AuditService } from '../audit/audit.service.js';
import { InMemoryMessagingAdapter } from '../messaging/in-memory-messaging.adapter.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { AuthService } from '../auth/auth.service.js';

@Module({
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
    AuditService,
    AuthService,
    {
      provide: 'MessagingPort',
      useClass: InMemoryMessagingAdapter,
    },
    JwtAuthGuard,
    PermissionsGuard,
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
