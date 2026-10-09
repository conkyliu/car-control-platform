import { CommandCode } from './command-codes.js';
import { CommandStatus } from './command-status.js';

/**
 * 客户端提交控车请求入参
 */
export interface CreateCommandRequestDto {
  commandCode: CommandCode;
  idempotencyKey: string;
  securityCode?: string; // L1 安全验证码
  confirmationToken?: string; // L2 强安全二次确认凭据
  params?: Record<string, unknown>;
}

/**
 * 下发到设备端的 MQTT 指令报文 (Downlink)
 */
export interface DeviceCommandDownlinkPayload {
  traceId: string;
  requestId: string;
  commandId: string;
  commandCode: CommandCode;
  timestamp: number;
  params?: Record<string, unknown>;
}

/**
 * 设备端上报的 ACK 报文 (Uplink)
 */
export interface DeviceCommandAckUplinkPayload {
  traceId: string;
  requestId: string;
  commandId: string;
  commandCode: CommandCode;
  timestamp: number;
  code: number; // 0 = SUCCESS, 1001 = REJECTED, 1002 = FAILED
  message: string;
  data?: Record<string, unknown>;
}

/**
 * 指令实时进度/状态变更通知
 */
export interface CommandStateChangeDto {
  commandId: string;
  vehicleId: string;
  deviceNo: string;
  commandCode: CommandCode;
  status: CommandStatus;
  errorCode?: string;
  errorMessage?: string;
  timestamp: number;
}
