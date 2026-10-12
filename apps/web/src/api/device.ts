import { http } from './client.ts';
import {
  type DeviceDto,
  type DeviceQueryParams,
  type DeviceStatsDto,
  type ProjectDto,
  type CreateDeviceInput,
  type DeviceLifecycleStatus,
  type OnlineStatus,
  isValidStatusTransition,
  isApiError,
  filterDevices,
  SEED_DEVICES,
  SEED_PROJECTS,
} from '../views/device/device-core.ts';

export type {
  DeviceDto,
  DeviceQueryParams,
  DeviceStatsDto,
  ProjectDto,
  CreateDeviceInput,
  DeviceLifecycleStatus,
  OnlineStatus,
};

// 本地内存备份状态池（支持离线环境和开发环境平滑降级）
let inMemoryDevices: DeviceDto[] = [...SEED_DEVICES];
let inMemoryProjects: ProjectDto[] = [...SEED_PROJECTS];

/**
 * 拉取设备资产列表 API
 * 遵循 isApiError 模式：真实服务端异常抛出中断并提示，离线/开发环境平滑降级至种子数据
 */
export async function fetchDevicesApi(params?: DeviceQueryParams): Promise<DeviceDto[]> {
  try {
    const data = await http.get<DeviceDto[]>('/devices', params);
    if (Array.isArray(data)) {
      return data;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 服务未部署或离线时平滑降级至内存数据并应用过滤
  return filterDevices(inMemoryDevices, params);
}

/**
 * 创建单个设备建档 API
 * 遵循 isApiError 模式：服务端异常抛出，离线时本地建档并存入状态池
 */
export async function createDeviceApi(data: CreateDeviceInput): Promise<DeviceDto> {
  try {
    const result = await http.post<DeviceDto>('/devices', data);
    if (result && result.id) {
      return result;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线/开发环境降级建档
  const matchedProject = inMemoryProjects.find((p) => p.id === data.projectId);
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const newDevice: DeviceDto = {
    id: `dev-${Date.now()}`,
    deviceNo: data.deviceNo,
    imei: data.imei,
    iccid: data.iccid,
    productKey: data.productKey,
    productName: data.productKey === 'TBOX-G5-PRO' ? '5G 高性能车载终端 (旗舰版)' : '4G 智慧车载终端 (标准版)',
    projectId: data.projectId,
    projectName: matchedProject?.name ?? '默认车队项目',
    tenantId: 'tenant-001',
    boundVehiclePlate: null,
    boundVin: null,
    onlineStatus: 'OFFLINE',
    signalRsrp: undefined,
    firmwareVersion: 'v2.1.0',
    status: data.status || 'ACTIVE',
    activatedAt: now,
    lastHeartbeatAt: undefined,
    createdAt: now,
    updatedAt: now,
  };

  inMemoryDevices = [newDevice, ...inMemoryDevices];
  return newDevice;
}

/**
 * 更新设备生命周期状态 API (ACTIVE / INACTIVE / DECOMMISSIONED)
 * 遵循 isApiError 模式
 */
export async function updateDeviceStatusApi(
  id: string,
  status: DeviceLifecycleStatus
): Promise<DeviceDto> {
  try {
    const result = await http.patch<DeviceDto>(`/devices/${encodeURIComponent(id)}/status`, { status });
    if (result && result.id) {
      return result;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线/开发环境本地更新
  const index = inMemoryDevices.findIndex((d) => d.id === id);
  if (index !== -1) {
    const existing = inMemoryDevices[index]!;
    if (!isValidStatusTransition(existing.status, status)) {
      throw new Error(`非法状态流转：当前状态 ${existing.status} 不可变更为 ${status}`);
    }
    const updated: DeviceDto = {
      ...existing,
      status,
      updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    };
    inMemoryDevices[index] = updated;
    return updated;
  }

  throw new Error(`Device not found with id: ${id}`);
}

/**
 * 获取项目列表 API（用于下拉选择项目）
 */
export async function fetchProjectsApi(): Promise<ProjectDto[]> {
  try {
    const data = await http.get<ProjectDto[]>('/projects');
    if (Array.isArray(data)) {
      return data;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  return [...inMemoryProjects];
}

export interface BatchImportErrorItem {
  rowNumber?: number;
  deviceNo?: string;
  imei?: string;
  reason: string;
}

export interface BatchImportResultDto {
  total: number;
  successCount: number;
  errors: BatchImportErrorItem[];
}

/**
 * 批量设备导入 API
 * 遵循 isApiError 模式：真实服务端异常抛出，离线/开发环境在内存池中安全批量写入并返回结果
 */
export async function batchImportDevicesApi(
  devices: CreateDeviceInput[]
): Promise<BatchImportResultDto> {
  try {
    const result = await http.post<any>('/devices/batch-import', { devices });
    if (result && typeof result.total === 'number') {
      const normalizedErrors: BatchImportErrorItem[] = Array.isArray(result.errors)
        ? result.errors.map((e: any) => {
            if (typeof e === 'string') {
              const colonIndex = e.indexOf(': ');
              if (colonIndex !== -1) {
                return {
                  deviceNo: e.slice(0, colonIndex).trim(),
                  reason: e.slice(colonIndex + 2).trim(),
                };
              }
              return { reason: e };
            }
            return {
              rowNumber: e.rowNumber,
              deviceNo: e.deviceNo,
              imei: e.imei,
              reason: e.reason || String(e),
            };
          })
        : [];

      return {
        total: result.total,
        successCount: result.successCount ?? 0,
        errors: normalizedErrors,
      };
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线/开发环境平滑降级写入
  const errors: BatchImportErrorItem[] = [];
  let successCount = 0;
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  for (let i = 0; i < devices.length; i++) {
    const item = devices[i]!;
    // 内存池查重拦截
    const existing = inMemoryDevices.find(
      (d) => d.deviceNo === item.deviceNo || d.imei === item.imei
    );
    if (existing) {
      errors.push({
        rowNumber: i + 1,
        deviceNo: item.deviceNo,
        imei: item.imei,
        reason:
          existing.deviceNo === item.deviceNo
            ? `设备编号 ${item.deviceNo} 在系统中已存在`
            : `IMEI ${item.imei} 在系统中已存在`,
      });
      continue;
    }

    const matchedProject = inMemoryProjects.find((p) => p.id === item.projectId);
    const newDevice: DeviceDto = {
      id: `dev-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      deviceNo: item.deviceNo,
      imei: item.imei,
      iccid: item.iccid,
      productKey: item.productKey,
      productName:
        item.productKey === 'TBOX-G5-PRO'
          ? '5G 高性能车载终端 (旗舰版)'
          : item.productKey === 'OBD-II-PLUS'
          ? 'OBD-II 即插即用诊断仪'
          : item.productKey === 'TCU-EV-100'
          ? '新能源双路CAN控制器'
          : '4G 智慧车载终端 (标准版)',
      projectId: item.projectId,
      projectName: matchedProject?.name ?? '默认车队项目',
      tenantId: 'tenant-001',
      boundVehiclePlate: null,
      boundVin: null,
      onlineStatus: 'OFFLINE',
      signalRsrp: undefined,
      firmwareVersion: 'v2.1.0',
      status: item.status || 'ACTIVE',
      activatedAt: now,
      lastHeartbeatAt: undefined,
      createdAt: now,
      updatedAt: now,
    };

    inMemoryDevices = [newDevice, ...inMemoryDevices];
    successCount++;
  }

  return {
    total: devices.length,
    successCount,
    errors,
  };
}
