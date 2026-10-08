import { Module } from '@nestjs/common';
import { InMemoryMessagingAdapter } from './messaging/in-memory-messaging.adapter.js';
import { DeviceStatusService } from './device/device-status.service.js';
import { WebSocketGatewayService } from './realtime/websocket.gateway.js';
import { CommandService } from './command/command.service.js';
import { CommandController } from './command/command.controller.js';

@Module({
  imports: [],
  controllers: [CommandController],
  providers: [
    {
      provide: 'MessagingPort',
      useClass: InMemoryMessagingAdapter,
    },
    DeviceStatusService,
    WebSocketGatewayService,
    CommandService,
  ],
  exports: [CommandService, DeviceStatusService, WebSocketGatewayService, 'MessagingPort'],
})
export class AppModule {}
