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
import { UserService } from './user/user.service.js';
import { TenantService } from './tenant/tenant.service.js';
import { AuditService } from './audit/audit.service.js';
import { AuthService } from './auth/auth.service.js';
import { AuthController } from './auth/auth.controller.js';
import { ProjectService } from './project/project.service.js';
import { DeviceService } from './device/device.service.js';
import { DeviceController } from './device/device.controller.js';
import { VehicleService } from './vehicle/vehicle.service.js';
import { VehicleController } from './vehicle/vehicle.controller.js';
import { CapabilityEngine } from './capability/capability.engine.js';
import { ControlSecurityService } from './security/control-security.service.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from './auth/guards/permissions.guard.js';
import { TelemetryModule } from './telemetry/telemetry.module.js';
import { AlarmModule } from './alarm/alarm.module.js';
import { CommunicationLogModule } from './log/communication-log.module.js';
import { OtaModule } from './ota/ota.module.js';
import { CacheModule } from './common/cache/cache.module.js';
import { ObservabilityModule } from './observability/observability.module.js';

@Module({
  imports: [
    TelemetryModule,
    AlarmModule,
    CommunicationLogModule,
    OtaModule,
    CacheModule,
    ObservabilityModule,
  ],
  controllers: [
    CommandController,
    AuthController,
    DeviceController,
    VehicleController,
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
    UserService,
    TenantService,
    ProjectService,
    AuditService,
    AuthService,
    DeviceService,
    VehicleService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [
    CommandService,
    DeviceStatusService,
    WebSocketGatewayService,
    'MessagingPort',
    CapabilityRepository,
    CapabilityEngine,
    ControlSecurityService,
    UserService,
    TenantService,
    ProjectService,
    AuditService,
    AuthService,
    DeviceService,
    VehicleService,
    TelemetryModule,
    AlarmModule,
    CommunicationLogModule,
    OtaModule,
    CacheModule,
    ObservabilityModule,
  ],
})
export class AppModule {}
