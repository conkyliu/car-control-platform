import {
  FirmwareStatus,
  OtaTargetType,
  OtaPlanStatus,
  OtaTaskStatus,
  OtaStep,
  OtaPreCheckConfig,
} from '@car-control/contracts';

/**
 * 固件发布包领域实体
 */
export interface FirmwarePackage {
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
  updatedAt?: Date;
}

/**
 * OTA 升级计划领域实体
 */
export interface OtaPlan {
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
  updatedAt?: Date;
}

/**
 * OTA 设备升级任务领域实体
 */
export interface OtaDeviceTask {
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
  createdAt?: Date;
  updatedAt?: Date;
}
