import { Module } from '@nestjs/common';
import { LocationRepository, VehicleRepository } from '@car-control/database';
import { TelemetryController } from './telemetry.controller.js';
import { TelemetryService } from './telemetry.service.js';
import { GeofenceService } from './geofence.service.js';
import { WebSocketGatewayService } from '../realtime/websocket.gateway.js';
import { DeviceStatusService } from '../device/device-status.service.js';
import { InMemoryMessagingAdapter } from '../messaging/in-memory-messaging.adapter.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';

@Module({
  controllers: [TelemetryController],
  providers: [
    TelemetryService,
    GeofenceService,
    LocationRepository,
    VehicleRepository,
    WebSocketGatewayService,
    DeviceStatusService,
    {
      provide: 'MessagingPort',
      useClass: InMemoryMessagingAdapter,
    },
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [TelemetryService, GeofenceService, LocationRepository],
})
export class TelemetryModule {}
