/**
 * WebSocket 服务端广播事件名称枚举
 */
export enum WebSocketEvent {
  // 指令事件
  COMMAND_CREATED = 'command.created',
  COMMAND_SENT = 'command.sent',
  COMMAND_SUCCESS = 'command.success',
  COMMAND_FAILED = 'command.failed',
  COMMAND_TIMEOUT = 'command.timeout',
  COMMAND_REJECTED = 'command.rejected',

  // 设备状态事件
  DEVICE_ONLINE = 'device.online',
  DEVICE_OFFLINE = 'device.offline',
  DEVICE_STATUS_CHANGED = 'device.status.changed',
  DEVICE_HEARTBEAT = 'device.heartbeat',

  // 报警与定位
  ALARM_CREATED = 'alarm.created',
  ALARM_TRIGGERED = 'alarm.triggered',
  ALARM_PROCESSED = 'alarm.processed',
  LOCATION_UPDATED = 'location.updated',

  // OTA 固件升级事件
  OTA_PROGRESS = 'ota.progress',
  OTA_COMPLETED = 'ota.completed',
}

/**
 * WebSocket 房间命名规则
 */
export class WebSocketRoomBuilder {
  static vehicleRoom(vehicleId: string): string {
    return `vehicle:${vehicleId}`;
  }

  static projectRoom(projectId: string): string {
    return `project:${projectId}`;
  }

  static tenantRoom(tenantId: string): string {
    return `tenant:${tenantId}`;
  }

  static otaPlanRoom(planId: string): string {
    return `ota-plan:${planId}`;
  }
}
