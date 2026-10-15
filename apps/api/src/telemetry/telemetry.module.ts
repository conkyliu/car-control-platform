import { Module } from '@nestjs/common';
import { LocationRepository, VehicleRepository } from '@car-control/database';
import { TelemetryController } from './telemetry.controller.js';
import { GeofenceController } from './geofence.controller.js';
import { TelemetryService } from './telemetry.service.js';
import { GeofenceService } from './geofence.service.js';
import { WebSocketGatewayService } from '../realtime/websocket.gateway.js';
import { DeviceStatusService } from '../device/device-status.service.js';
import { InMemoryMessagingAdapter } from '../messaging/in-memory-messaging.adapter.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [TelemetryController, GeofenceController],
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
  ],
  exports: [TelemetryService, GeofenceService, LocationRepository],
})
export class TelemetryModule {}
