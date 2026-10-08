import { DeviceCommandDownlinkPayload, DeviceCommandAckUplinkPayload } from '@car-control/contracts';

export type AckCallback = (ack: DeviceCommandAckUplinkPayload) => void | Promise<void>;
export type HeartbeatCallback = (data: { productKey: string; deviceNo: string; timestamp: number }) => void | Promise<void>;
export type StatusCallback = (data: { productKey: string; deviceNo: string; online: boolean }) => void | Promise<void>;

/**
 * 通信抽象端口：解耦具体 MQTT Broker / TCP 网关
 */
export interface MessagingPort {
  publishCommand(productKey: string, deviceNo: string, payload: DeviceCommandDownlinkPayload): Promise<void>;
  onAck(callback: AckCallback): void;
  onHeartbeat(callback: HeartbeatCallback): void;
  onStatus(callback: StatusCallback): void;
}
