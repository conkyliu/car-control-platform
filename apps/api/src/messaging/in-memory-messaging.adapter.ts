import { Injectable, Optional } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import {
  MqttTopicBuilder,
  DeviceCommandDownlinkPayload,
  DeviceCommandAckUplinkPayload,
  TelemetryLocationPayload,
  UplinkAlarmPayload,
  OtaUpgradeDownlinkPayload,
  OtaProgressPayload,
} from '@car-control/contracts';
import {
  MessagingPort,
  AckCallback,
  HeartbeatCallback,
  StatusCallback,
  LocationCallback,
  AlarmCallback,
  OtaProgressCallback,
} from './messaging.port.js';

@Injectable()
export class InMemoryMessagingAdapter implements MessagingPort {
  private static sharedBus = new EventEmitter();
  private ackCallbacks: AckCallback[] = [];
  private heartbeatCallbacks: HeartbeatCallback[] = [];
  private statusCallbacks: StatusCallback[] = [];
  private locationCallbacks: LocationCallback[] = [];
  private alarmCallbacks: AlarmCallback[] = [];
  private otaProgressCallbacks: OtaProgressCallback[] = [];
  private recentMessages: Set<string> = new Set();
  private bus: EventEmitter;

  constructor(@Optional() bus?: EventEmitter) {
    this.bus = bus || InMemoryMessagingAdapter.sharedBus;
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

  async publishOtaUpgrade(
    productKey: string,
    deviceNo: string,
    payload: OtaUpgradeDownlinkPayload
  ): Promise<void> {
    const topic = MqttTopicBuilder.otaUpgrade(productKey, deviceNo);
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

  onLocation(callback: LocationCallback): void {
    this.locationCallbacks.push(callback);
  }

  onAlarm(callback: AlarmCallback): void {
    this.alarmCallbacks.push(callback);
  }

  onOtaProgress(callback: OtaProgressCallback): void {
    this.otaProgressCallbacks.push(callback);
  }

  /**
   * 注册设备上行监听器
   */
  subscribeDevice(productKey: string, deviceNo: string): void {
    const ackTopic = MqttTopicBuilder.commandAck(productKey, deviceNo);
    this.bus.on(ackTopic, (_t, raw) => {
      try {
        const parsed: DeviceCommandAckUplinkPayload = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!(parsed as any).deviceNo) {
          (parsed as any).deviceNo = deviceNo;
        }
        if (!(parsed as any).productKey) {
          (parsed as any).productKey = productKey;
        }
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
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
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
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        for (const cb of this.statusCallbacks) {
          cb(parsed);
        }
      } catch (e) {
        console.error('[MessagingAdapter] Failed to parse status:', e);
      }
    });

    // 遥测定位上行监听: 标准规范 Topic + 兼容遗留 Topic
    const locTopic = MqttTopicBuilder.location(productKey, deviceNo);
    const legacyLocTopic = `car/up/${productKey}/${deviceNo}/telemetry/location`;
    const handleLocation = (_t: string, raw: string | TelemetryLocationPayload) => {
      try {
        const payload: TelemetryLocationPayload = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const dedupeKey = `loc:${productKey}:${deviceNo}:${payload.timestamp}:${payload.lat}:${payload.lng}`;
        if (this.recentMessages.has(dedupeKey)) {
          return;
        }
        this.recentMessages.add(dedupeKey);
        if (this.recentMessages.size > 2000) {
          this.recentMessages.clear();
        }

        for (const cb of this.locationCallbacks) {
          Promise.resolve(cb({ productKey, deviceNo, payload })).catch((err) => {
            console.error('[MessagingAdapter] Error in location callback:', err);
          });
        }
      } catch (e) {
        console.error('[MessagingAdapter] Failed to parse location:', e);
      }
    };
    this.bus.on(locTopic, handleLocation);
    if (legacyLocTopic !== locTopic) {
      this.bus.on(legacyLocTopic, handleLocation);
    }

    // 报警上报监听: 标准规范 Topic + 兼容遗留 Topic
    const alarmTopic = MqttTopicBuilder.alarm(productKey, deviceNo);
    const legacyAlarmTopic = `car/up/${productKey}/${deviceNo}/alarm/report`;
    const handleAlarm = (_t: string, raw: string | UplinkAlarmPayload) => {
      try {
        const payload: UplinkAlarmPayload = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const dedupeKey = `alarm:${productKey}:${deviceNo}:${payload.timestamp}:${payload.alarmType}`;
        if (this.recentMessages.has(dedupeKey)) {
          return;
        }
        this.recentMessages.add(dedupeKey);
        if (this.recentMessages.size > 2000) {
          this.recentMessages.clear();
        }

        for (const cb of this.alarmCallbacks) {
          Promise.resolve(cb({ productKey, deviceNo, payload })).catch((err) => {
            console.error('[MessagingAdapter] Error in alarm callback:', err);
          });
        }
      } catch (e) {
        console.error('[MessagingAdapter] Failed to parse alarm:', e);
      }
    };
    this.bus.on(alarmTopic, handleAlarm);
    if (legacyAlarmTopic !== alarmTopic) {
      this.bus.on(legacyAlarmTopic, handleAlarm);
    }

    // OTA 升级进度上行监听: 标准规范 Topic + 兼容遗留 Topic
    const otaProgTopic = MqttTopicBuilder.otaProgress(productKey, deviceNo);
    const legacyOtaProgTopic = `car/up/${productKey}/${deviceNo}/ota/progress`;
    const handleOtaProgress = (_t: string, raw: string | OtaProgressPayload) => {
      try {
        const payload: OtaProgressPayload = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!payload.deviceNo) {
          payload.deviceNo = deviceNo;
        }
        const percent = payload.progressPercent ?? (payload as any).percent ?? 0;
        const dedupeKey = `ota:${productKey}:${deviceNo}:${payload.planId}:${payload.step}:${percent}`;
        if (this.recentMessages.has(dedupeKey)) {
          return;
        }
        this.recentMessages.add(dedupeKey);
        if (this.recentMessages.size > 2000) {
          this.recentMessages.clear();
        }

        for (const cb of this.otaProgressCallbacks) {
          Promise.resolve(cb({ productKey, deviceNo, payload })).catch((err) => {
            console.error('[MessagingAdapter] Error in OTA progress callback:', err);
          });
        }
      } catch (e) {
        console.error('[MessagingAdapter] Failed to parse OTA progress:', e);
      }
    };
    this.bus.on(otaProgTopic, handleOtaProgress);
    if (legacyOtaProgTopic !== otaProgTopic) {
      this.bus.on(legacyOtaProgTopic, handleOtaProgress);
    }
  }

  static getSharedBus(): EventEmitter {
    return this.sharedBus;
  }
}
