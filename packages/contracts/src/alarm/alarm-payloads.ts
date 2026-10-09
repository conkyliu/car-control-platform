/**
 * 车辆异常报警契约与类型定义
 * 遵循 docs/specs/alert.md 规范
 */

/**
 * 告警类型枚举
 */
export enum AlarmType {
  LOW_BATTERY = 'LOW_BATTERY',
  VIBRATION = 'VIBRATION',
  OVERSPEED = 'OVERSPEED',
  POWER_CUT = 'POWER_CUT',
  SOS = 'SOS',
  TOW_AWAY = 'TOW_AWAY',
  GEOFENCE_IN = 'GEOFENCE_IN',
  GEOFENCE_OUT = 'GEOFENCE_OUT',
}

/**
 * 告警严重级别枚举
 */
export enum AlarmLevel {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

/**
 * 告警处置生命周期状态枚举
 */
export enum AlarmStatus {
  PENDING = 'PENDING',
  PROCESSED = 'PROCESSED',
  IGNORED = 'IGNORED',
}

/**
 * 终态列表：到达已处理或已忽略后不允许二次流转，保证不可逆与数据一致性
 */
export const TERMINAL_ALARM_STATUSES: ReadonlySet<AlarmStatus> = new Set([
  AlarmStatus.PROCESSED,
  AlarmStatus.IGNORED,
]);

/**
 * 判断告警是否处于终态
 */
export function isTerminalAlarmStatus(status: AlarmStatus): boolean {
  return TERMINAL_ALARM_STATUSES.has(status);
}

/**
 * 允许的状态转移拓扑规则
 */
export const VALID_ALARM_STATUS_TRANSITIONS: Record<AlarmStatus, AlarmStatus[]> = {
  [AlarmStatus.PENDING]: [AlarmStatus.PROCESSED, AlarmStatus.IGNORED],
  [AlarmStatus.PROCESSED]: [],
  [AlarmStatus.IGNORED]: [],
};

/**
 * 校验告警状态转移是否合法
 */
export function canTransitionAlarmStatus(from: AlarmStatus, to: AlarmStatus): boolean {
  const allowed = VALID_ALARM_STATUS_TRANSITIONS[from];
  return Boolean(allowed && allowed.includes(to));
}

/**
 * 告警明细/记录传输对象 DTO
 */
export interface AlarmRecordDto {
  id: string;
  tenantId: string;
  projectId: string;
  vehicleId: string;
  deviceNo: string;
  alarmType: AlarmType;
  alarmLevel: AlarmLevel;
  lat?: number;
  lng?: number;
  speed?: number;
  status: AlarmStatus;
  message?: string;
  triggeredAt: Date;
  processedAt?: Date;
  processedBy?: string;
  operatorId?: string; // processedBy 的别名/兼容字段
  remark?: string;
}

/**
 * 人工处置告警请求入参 DTO
 */
export interface ProcessAlarmDto {
  status: 'PROCESSED' | 'IGNORED' | AlarmStatus;
  remark?: string;
  operatorId?: string;
}

/**
 * 告警多维查询过滤条件 DTO
 */
export interface AlarmFilterDto {
  tenantId?: string;
  projectId?: string;
  vehicleId?: string;
  deviceNo?: string;
  alarmType?: AlarmType;
  alarmLevel?: AlarmLevel;
  status?: AlarmStatus;
  startTime?: Date | string;
  endTime?: Date | string;
}

/**
 * 设备端 MQTT 上报告警 Payload 结构
 */
export interface UplinkAlarmPayload {
  alarmType: AlarmType;
  alarmLevel?: AlarmLevel;
  timestamp: number;
  lat?: number;
  lng?: number;
  speed?: number;
  message?: string;
  details?: Record<string, unknown>;
}
