/**
 * OTA 固件升级系统契约与类型定义
 * 遵循 docs/specs/ota.md、ADR-013 与 ADR-014 规范
 */

/**
 * 固件发布状态
 */
export enum FirmwareStatus {
  ACTIVE = 'ACTIVE',
  DEPRECATED = 'DEPRECATED',
}

/**
 * 升级目标筛选类型
 */
export enum OtaTargetType {
  ALL = 'ALL',
  MODEL = 'MODEL',
  PROJECT = 'PROJECT',
  DEVICE_LIST = 'DEVICE_LIST',
}

/**
 * OTA 计划生命周期状态
 */
export enum OtaPlanStatus {
  DRAFT = 'DRAFT',
  SCHEDULED = 'SCHEDULED',
  EXECUTING = 'EXECUTING',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/**
 * OTA 设备升级任务云端生命周期状态
 */
export enum OtaTaskStatus {
  QUEUED = 'QUEUED',
  NOTIFIED = 'NOTIFIED',
  DOWNLOADING = 'DOWNLOADING',
  VERIFYING = 'VERIFYING',
  FLASHING = 'FLASHING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  SKIPPED_UNSAFE = 'SKIPPED_UNSAFE',
  TIMEOUT = 'TIMEOUT',
}

/**
 * OTA 设备物理执行步骤枚举（包含 REBOOTING 阶段，与云端任务状态严格解耦）
 */
export enum OtaStep {
  DOWNLOADING = 'DOWNLOADING',
  VERIFYING = 'VERIFYING',
  FLASHING = 'FLASHING',
  REBOOTING = 'REBOOTING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

/**
 * 行车安全前置检查配置
 */
export interface OtaPreCheckConfig {
  engineOff: boolean;
  minBatteryVoltage: number;
}

/**
 * 默认行车安全前置检查门禁参数
 */
export const DEFAULT_OTA_PRE_CHECK: OtaPreCheckConfig = {
  engineOff: true,
  minBatteryVoltage: 12.0,
};

/**
 * 安全拦截原因常量
 */
export const OTA_SAFETY_REASON_ENGINE_RUNNING = 'REASON_ENGINE_RUNNING';
export const OTA_SAFETY_REASON_LOW_VOLTAGE = 'REASON_LOW_VOLTAGE';
export const OTA_SAFETY_REASON_TELEMETRY_STALE = 'REASON_TELEMETRY_STALE';

/**
 * OTA 任务终态集合：终态单向不可逆，防重复流转
 */
export const TERMINAL_OTA_TASK_STATUSES: ReadonlySet<OtaTaskStatus> = new Set([
  OtaTaskStatus.SUCCESS,
  OtaTaskStatus.FAILED,
  OtaTaskStatus.TIMEOUT,
  OtaTaskStatus.SKIPPED_UNSAFE,
]);

/**
 * 判断任务是否处于终态
 */
export function isTerminalOtaTaskStatus(status: OtaTaskStatus): boolean {
  return TERMINAL_OTA_TASK_STATUSES.has(status);
}

/**
 * OTA 任务状态合法转移拓扑规则
 */
export const VALID_OTA_TASK_STATUS_TRANSITIONS: Record<OtaTaskStatus, OtaTaskStatus[]> = {
  [OtaTaskStatus.QUEUED]: [
    OtaTaskStatus.NOTIFIED,
    OtaTaskStatus.SKIPPED_UNSAFE,
    OtaTaskStatus.FAILED,
  ],
  [OtaTaskStatus.NOTIFIED]: [
    OtaTaskStatus.DOWNLOADING,
    OtaTaskStatus.FAILED,
    OtaTaskStatus.TIMEOUT,
  ],
  [OtaTaskStatus.DOWNLOADING]: [
    OtaTaskStatus.VERIFYING,
    OtaTaskStatus.FAILED,
    OtaTaskStatus.TIMEOUT,
  ],
  [OtaTaskStatus.VERIFYING]: [
    OtaTaskStatus.FLASHING,
    OtaTaskStatus.FAILED,
    OtaTaskStatus.TIMEOUT,
  ],
  [OtaTaskStatus.FLASHING]: [
    OtaTaskStatus.SUCCESS,
    OtaTaskStatus.FAILED,
    OtaTaskStatus.TIMEOUT,
  ],
  [OtaTaskStatus.SUCCESS]: [],
  [OtaTaskStatus.FAILED]: [],
  [OtaTaskStatus.TIMEOUT]: [],
  [OtaTaskStatus.SKIPPED_UNSAFE]: [],
};

/**
 * 校验 OTA 任务状态转移是否合法
 */
export function canTransitionOtaTaskStatus(from: OtaTaskStatus, to: OtaTaskStatus): boolean {
  const allowed = VALID_OTA_TASK_STATUS_TRANSITIONS[from];
  return Boolean(allowed && allowed.includes(to));
}

/**
 * OTA 计划终态集合
 */
export const TERMINAL_OTA_PLAN_STATUSES: ReadonlySet<OtaPlanStatus> = new Set([
  OtaPlanStatus.COMPLETED,
  OtaPlanStatus.CANCELLED,
]);

/**
 * 判断 OTA 计划是否处于终态
 */
export function isTerminalOtaPlanStatus(status: OtaPlanStatus): boolean {
  return TERMINAL_OTA_PLAN_STATUSES.has(status);
}

/**
 * OTA 计划状态合法转移拓扑规则
 */
export const VALID_OTA_PLAN_STATUS_TRANSITIONS: Record<OtaPlanStatus, OtaPlanStatus[]> = {
  [OtaPlanStatus.DRAFT]: [
    OtaPlanStatus.SCHEDULED,
    OtaPlanStatus.EXECUTING,
    OtaPlanStatus.CANCELLED,
  ],
  [OtaPlanStatus.SCHEDULED]: [
    OtaPlanStatus.EXECUTING,
    OtaPlanStatus.CANCELLED,
  ],
  [OtaPlanStatus.EXECUTING]: [
    OtaPlanStatus.PAUSED,
    OtaPlanStatus.COMPLETED,
    OtaPlanStatus.CANCELLED,
  ],
  [OtaPlanStatus.PAUSED]: [
    OtaPlanStatus.EXECUTING,
    OtaPlanStatus.CANCELLED,
    OtaPlanStatus.COMPLETED,
  ],
  [OtaPlanStatus.COMPLETED]: [],
  [OtaPlanStatus.CANCELLED]: [],
};

/**
 * 校验 OTA 计划状态转移是否合法
 */
export function canTransitionOtaPlanStatus(from: OtaPlanStatus, to: OtaPlanStatus): boolean {
  const allowed = VALID_OTA_PLAN_STATUS_TRANSITIONS[from];
  return Boolean(allowed && allowed.includes(to));
}

/**
 * 固件元数据传输对象 DTO
 */
export interface FirmwarePackageDto {
  id: string;
  tenantId: string;
  name: string;
  version: string;
  targetModelId: string;
  hardwareVersion: string;
  fileUrl: string;
  fileSizeBytes: number;
  checksumSha256: string;
  checksumMd5?: string;
  description?: string;
  status: 'ACTIVE' | 'DEPRECATED' | FirmwareStatus;
  createdAt: Date;
}

/**
 * 创建固件请求入参 DTO
 */
export type CreateFirmwareDto = Omit<FirmwarePackageDto, 'id' | 'tenantId' | 'createdAt'>;

/**
 * OTA 计划传输对象 DTO
 */
export interface OtaPlanDto {
  id: string;
  tenantId: string;
  name: string;
  firmwareId: string;
  targetType: 'ALL' | 'MODEL' | 'PROJECT' | 'DEVICE_LIST' | OtaTargetType;
  targetIds: string[];
  status: OtaPlanStatus;
  batchSize: number;
  batchIntervalSec: number;
  maxRetries: number;
  preCheckRequired: OtaPreCheckConfig;
  totalDevices: number;
  successDevices: number;
  failedDevices: number;
  createdAt: Date;
}

/**
 * 创建 OTA 计划请求入参 DTO
 */
export type CreateOtaPlanDto = Omit<
  OtaPlanDto,
  'id' | 'tenantId' | 'status' | 'totalDevices' | 'successDevices' | 'failedDevices' | 'createdAt'
>;

/**
 * OTA 设备升级任务传输对象 DTO
 */
export interface OtaDeviceTaskDto {
  id: string;
  tenantId: string;
  planId: string;
  vehicleId: string;
  deviceNo: string;
  firmwareVersion: string;
  status: OtaTaskStatus;
  currentStep: OtaStep;
  progressPercent: number;
  retryCount: number;
  failureReason?: string;
  notifiedAt?: Date;
  finishedAt?: Date;
}

/**
 * MQTT 下行固件升级指令 Payload
 */
export interface OtaUpgradeDownlinkPayload {
  traceId: string;
  planId: string;
  taskId: string;
  version: string;
  fileUrl: string;
  fileSizeBytes: number;
  checksumSha256: string;
  checksumMd5?: string;
}

/**
 * MQTT 上行固件升级进度与结果上报 Payload
 */
export interface OtaProgressPayload {
  planId: string;
  taskId: string;
  deviceNo: string;
  step: OtaStep;
  progressPercent: number;
  currentChunk?: number;
  totalChunks?: number;
  errorCode?: number;
  errorMessage?: string;
}

/**
 * OTA 计划查询过滤条件
 */
export interface OtaPlanFilterDto {
  tenantId?: string;
  firmwareId?: string;
  status?: OtaPlanStatus;
  keyword?: string;
}

/**
 * OTA 设备任务查询过滤条件
 */
export interface OtaTaskFilterDto {
  tenantId?: string;
  planId?: string;
  vehicleId?: string;
  deviceNo?: string;
  status?: OtaTaskStatus;
}
