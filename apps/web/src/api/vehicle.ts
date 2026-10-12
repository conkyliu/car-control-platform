import { http } from './client.ts';
import {
  type VehicleDto,
  type VehicleQueryParams,
  type VehicleStatsDto,
  type BrandDto,
  type ModelDto,
  type VehicleStatus,
  filterVehicles,
  isValidVehicleStatusTransition,
  isApiError,
  SEED_BRANDS,
  SEED_MODELS,
  SEED_VEHICLES,
} from '../views/vehicle/vehicle-core.ts';
import { SEED_PROJECTS } from '../views/device/device-core.ts';

export type {
  VehicleDto,
  VehicleQueryParams,
  VehicleStatsDto,
  BrandDto,
  ModelDto,
  VehicleStatus,
};

export interface CreateVehicleInput {
  vin: string;
  plateNumber: string;
  projectId: string;
  brandId: string;
  modelId: string;
  deviceId?: string | null;
  ownerName?: string;
  ownerPhone?: string;
  status?: VehicleStatus;
}

// 本地内存备份状态池 (支持离线演示与无后端环境平滑降级)
let inMemoryVehicles: VehicleDto[] = [...SEED_VEHICLES];
let inMemoryBrands: BrandDto[] = [...SEED_BRANDS];
let inMemoryModels: ModelDto[] = [...SEED_MODELS];

/**
 * 拉取车辆台账档案列表 API
 * 遵循 isApiError 模式：真实服务端异常抛出中断并提示，离线环境降级至内存数据池
 */
export async function fetchVehiclesApi(params?: VehicleQueryParams): Promise<VehicleDto[]> {
  try {
    const data = await http.get<VehicleDto[]>('/vehicles', params);
    if (Array.isArray(data)) {
      return data;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线/开发降级
  return filterVehicles(inMemoryVehicles, params);
}

/**
 * 拉取单台车辆档案与实时车况详情 API
 */
export async function fetchVehicleDetailApi(id: string): Promise<VehicleDto> {
  try {
    const result = await http.get<VehicleDto>(`/vehicles/${encodeURIComponent(id)}`);
    if (result && result.id) {
      return result;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  const target = inMemoryVehicles.find((v) => v.id === id);
  if (!target) {
    throw new Error(`车辆 ID "${id}" 未找到`);
  }
  return target;
}

/**
 * 新增车辆台账建档 API
 * 遵循 isApiError 模式：服务端异常抛出，离线时本地建档并存入状态池
 */
export async function createVehicleApi(data: CreateVehicleInput): Promise<VehicleDto> {
  try {
    const result = await http.post<VehicleDto>('/vehicles', data);
    if (result && result.id) {
      return result;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const brand = inMemoryBrands.find((b) => b.id === data.brandId);
  const model = inMemoryModels.find((m) => m.id === data.modelId);
  const project = SEED_PROJECTS.find((p) => p.id === data.projectId);

  const newVehicle: VehicleDto = {
    id: `veh-${Date.now()}`,
    vin: data.vin.trim().toUpperCase(),
    plateNumber: data.plateNumber.trim().toUpperCase(),
    tenantId: 'tenant-001',
    projectId: data.projectId,
    projectName: project?.name ?? '默认车队项目',
    brandId: data.brandId,
    brandName: brand?.name ?? '未知品牌',
    modelId: data.modelId,
    modelName: model?.name ?? '未知车型',
    deviceId: data.deviceId || null,
    deviceNo: data.deviceId ? `DEV_${Date.now().toString().slice(-4)}` : null,
    deviceOnlineStatus: data.deviceId ? 'ONLINE' : undefined,
    status: data.status || 'NORMAL',
    telemetry: {
      doorLocked: true,
      trunkLocked: true,
      engineStarted: false,
      batteryVoltage: 12.6,
      mileage: 0,
      speed: 0,
      fuelOrBatteryLevel: 100,
      location: '整车交付中心',
      lastReportedAt: now,
    },
    ownerName: data.ownerName?.trim() || undefined,
    ownerPhone: data.ownerPhone?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };

  inMemoryVehicles = [newVehicle, ...inMemoryVehicles];
  return newVehicle;
}

/**
 * 更新车辆运营生命周期状态 API (NORMAL / MAINTENANCE / LOCKED / SCRAPPED)
 * 校验 isValidVehicleStatusTransition 防御终态逆转
 */
export async function updateVehicleStatusApi(
  id: string,
  status: VehicleStatus
): Promise<VehicleDto> {
  try {
    const result = await http.patch<VehicleDto>(
      `/vehicles/${encodeURIComponent(id)}/status`,
      { status }
    );
    if (result && result.id) {
      return result;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  const index = inMemoryVehicles.findIndex((v) => v.id === id);
  if (index === -1) {
    throw new Error(`车辆 ID "${id}" 不存在`);
  }

  const current = inMemoryVehicles[index]!;
  if (!isValidVehicleStatusTransition(current.status, status)) {
    throw new Error('已报废车辆为物理终态，不可逆向变更已报废车辆状态');
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const updatedVehicle: VehicleDto = {
    ...current,
    status,
    updatedAt: now,
  };

  inMemoryVehicles[index] = updatedVehicle;
  return updatedVehicle;
}

/**
 * 获取品牌字典列表 API
 */
export async function fetchBrandsApi(): Promise<BrandDto[]> {
  try {
    const data = await http.get<BrandDto[]>('/vehicles/brands');
    if (Array.isArray(data)) {
      return data;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }
  return inMemoryBrands;
}

/**
 * 获取车型字典列表 API (支持按品牌联动过滤)
 */
export async function fetchModelsApi(brandId?: string): Promise<ModelDto[]> {
  try {
    const data = await http.get<ModelDto[]>('/vehicles/models', brandId ? { brandId } : undefined);
    if (Array.isArray(data)) {
      return data;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  if (brandId && brandId !== 'ALL') {
    return inMemoryModels.filter((m) => m.brandId === brandId);
  }
  return inMemoryModels;
}
