import { http } from './client.ts';
import {
  type DeviceDto,
  type DeviceQueryParams,
  type DeviceStatsDto,
  type ProjectDto,
  type CreateDeviceInput,
  type DeviceLifecycleStatus,
  type OnlineStatus,
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
