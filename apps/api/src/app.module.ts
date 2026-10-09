import { Module } from '@nestjs/common';
import { DeviceRepository, VehicleRepository } from '@car-control/database';
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
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from './auth/guards/permissions.guard.js';

@Module({
  imports: [],
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
    DeviceStatusService,
    WebSocketGatewayService,
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
    UserService,
    TenantService,
    ProjectService,
    AuditService,
    AuthService,
    DeviceService,
    VehicleService,
  ],
})
export class AppModule {}
