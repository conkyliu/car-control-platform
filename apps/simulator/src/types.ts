import { CommandCode, OtaStep } from '@car-control/contracts';

export interface DeviceSimulatorOptions {
  productKey: string;
  deviceNo: string;
  heartbeatIntervalMs?: number;
  defaultLatencyMs?: number; // 模拟执行延时，如 100ms, 500ms, 1000ms
  dropAck?: boolean;          // 模拟网络丢包，不回传 ACK
  duplicateAck?: boolean;     // 模拟重发 ACK
  lateAckMs?: number;         // 模拟超时后迟到 ACK
  rejectCommands?: CommandCode[]; // 模拟拒绝执行的指令列表 (如车速非零拒开车门)
  simulatedEngineRunning?: boolean;
  simulatedBatteryVoltage?: number;
  currentFirmwareVersion?: string;
  failOtaAtStep?: OtaStep;
  otaDownloadIntervalMs?: number;
}

export interface SimulatorTelemetry {
  online: boolean;
  lastHeartbeat?: number;
  commandsReceived: number;
  acksSent: number;
  acksDropped: number;
  batteryVoltage: number; // 伏特，默认 12.6V
  firmwareVersion: string;
  otaTasksReceived: number;
  otaProgressSent: number;
  lastOtaStep?: OtaStep;
}
