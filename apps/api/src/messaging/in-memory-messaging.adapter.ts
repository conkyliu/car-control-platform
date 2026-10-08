import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import {
  MqttTopicBuilder,
  DeviceCommandDownlinkPayload,
  DeviceCommandAckUplinkPayload,
} from '@car-control/contracts';
import { MessagingPort, AckCallback, HeartbeatCallback, StatusCallback } from './messaging.port.js';

@Injectable()
export class InMemoryMessagingAdapter implements MessagingPort {
  private static sharedBus = new EventEmitter();
  private ackCallbacks: AckCallback[] = [];
  private heartbeatCallbacks: HeartbeatCallback[] = [];
  private statusCallbacks: StatusCallback[] = [];

  constructor(private bus: EventEmitter = InMemoryMessagingAdapter.sharedBus) {
    this.bus.on('error', (err) => console.error('[MessagingAdapter] Bus error:', err));
  }

  async publishCommand(
    productKey: string,
    deviceNo: string,
    payload: DeviceCommandDownlinkPayload
  ): Promise<void> {
    const topic = MqttTopicBuilder.commandDown(productKey, deviceNo);
    const raw = JSON.stringify(payload);
    queueMicrotask(() => {
      this.bus.emit(topic, topic, raw);
    });
  }

  onAck(callback: AckCallback): void {
    this.ackCallbacks.push(callback);
  }

  onHeartbeat(callback: HeartbeatCallback): void {
    this.heartbeatCallbacks.push(callback);
  }

  onStatus(callback: StatusCallback): void {
    this.statusCallbacks.push(callback);
  }

  /**
   * 注册设备上行监听器
   */
  subscribeDevice(productKey: string, deviceNo: string): void {
    const ackTopic = MqttTopicBuilder.commandAck(productKey, deviceNo);
    this.bus.on(ackTopic, (_t, raw) => {
      try {
        const parsed: DeviceCommandAckUplinkPayload = JSON.parse(raw);
        for (const cb of this.ackCallbacks) {
          cb(parsed);
        }
      } catch (e) {
        console.error('[MessagingAdapter] Failed to parse ACK:', e);
      }
    });

    const hbTopic = MqttTopicBuilder.heartbeat(productKey, deviceNo);
    this.bus.on(hbTopic, (_t, raw) => {
      try {
        const parsed = JSON.parse(raw);
        for (const cb of this.heartbeatCallbacks) {
          cb(parsed);
        }
      } catch (e) {
        console.error('[MessagingAdapter] Failed to parse heartbeat:', e);
      }
    });

    const stTopic = MqttTopicBuilder.status(productKey, deviceNo);
    this.bus.on(stTopic, (_t, raw) => {
      try {
        const parsed = JSON.parse(raw);
        for (const cb of this.statusCallbacks) {
          cb(parsed);
        }
      } catch (e) {
        console.error('[MessagingAdapter] Failed to parse status:', e);
      }
    });
  }

  static getSharedBus(): EventEmitter {
    return this.sharedBus;
  }
}
