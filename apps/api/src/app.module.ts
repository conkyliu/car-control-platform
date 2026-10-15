import { Module } from '@nestjs/common';
import {
  DeviceRepository,
  VehicleRepository,
  CapabilityRepository,
} from '@car-control/database';
import { InMemoryMessagingAdapter } from './messaging/in-memory-messaging.adapter.js';
import { DeviceStatusService } from './device/device-status.service.js';
import { WebSocketGatewayService } from './realtime/websocket.gateway.js';
import { CommandService } from './command/command.service.js';
import { CommandController } from './command/command.controller.js';
import { DigitalKeyService } from './command/digital-key.service.js';
import { DigitalKeyController } from './command/digital-key.controller.js';
import { CommandDictionaryController } from './command/command-dictionary.controller.js';
import { AuthController } from './auth/auth.controller.js';
import { ProjectService } from './project/project.service.js';
import { ProjectController } from './project/project.controller.js';
import { DeviceService } from './device/device.service.js';
import { DeviceController } from './device/device.controller.js';
import { VehicleService } from './vehicle/vehicle.service.js';
import { VehicleController } from './vehicle/vehicle.controller.js';
import { CapabilityEngine } from './capability/capability.engine.js';
import { CapabilityController } from './capability/capability.controller.js';
import { ControlSecurityService } from './security/control-security.service.js';
import { TelemetryModule } from './telemetry/telemetry.module.js';
import { AlarmModule } from './alarm/alarm.module.js';
import { CommunicationLogModule } from './log/communication-log.module.js';
import { OtaModule } from './ota/ota.module.js';
import { CacheModule } from './common/cache/cache.module.js';
import { ObservabilityModule } from './observability/observability.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';

import { AuthModule } from './auth/auth.module.js';

@Module({
  imports: [
    AuthModule,
    TelemetryModule,
    AlarmModule,
    CommunicationLogModule,
    OtaModule,
    CacheModule,
    ObservabilityModule,
    DashboardModule,
  ],
  controllers: [
    CommandController,
    DigitalKeyController,
    CommandDictionaryController,
    AuthController,
    DeviceController,
    VehicleController,
    ProjectController,
    CapabilityController,
  ],
  providers: [
    {
      provide: 'MessagingPort',
      useClass: InMemoryMessagingAdapter,
    },
    DeviceRepository,
    VehicleRepository,
    CapabilityRepository,
    DeviceStatusService,
    WebSocketGatewayService,
    CapabilityEngine,
    ControlSecurityService,
    CommandService,
    DigitalKeyService,
    ProjectService,
    DeviceService,
    VehicleService,
  ],
  exports: [
    AuthModule,
    CommandService,
    DigitalKeyService,
    DeviceStatusService,
    WebSocketGatewayService,
    'MessagingPort',
    CapabilityRepository,
    CapabilityEngine,
    ControlSecurityService,
    ProjectService,
    DeviceService,
    VehicleService,
    TelemetryModule,
    AlarmModule,
    CommunicationLogModule,
    OtaModule,
    CacheModule,
    ObservabilityModule,
    DashboardModule,
  ],
})
export class AppModule {}
