import { http } from './client.ts';
import {
  type VehicleDto,
  type VehicleQueryParams,
  type VehicleStatsDto,
  type VehicleStatus,
  filterVehicles,
  isValidVehicleStatusTransition,
  isApiError,
  SEED_VEHICLES,
} from '../views/vehicle/vehicle-core.ts';
import {
  type BrandDto,
  type ModelDto,
  type CreateModelInput,
  type UpdateModelInput,
  type CreateBrandInput,
  type UpdateBrandInput,
  validateProtocolCode,
  formatProtocolCode,
  validateBrandCode,
  canDeleteModel,
  canDeleteBrand,
  SEED_BRANDS as RICH_SEED_BRANDS,
  SEED_MODELS as RICH_SEED_MODELS,
} from '../views/vehicle/model-core.ts';
import { SEED_PROJECTS, type DeviceDto } from '../views/device/device-core.ts';
import { getInMemoryDevices, setInMemoryDevices } from './device.ts';
import {
  validateBindingPair,
  applyBindingChange,
} from '../views/vehicle/vehicle-bind-core.ts';

export type {
  VehicleDto,
  VehicleQueryParams,
  VehicleStatsDto,
  BrandDto,
  ModelDto,
  VehicleStatus,
  CreateModelInput,
  UpdateModelInput,
  CreateBrandInput,
  UpdateBrandInput,
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
let inMemoryBrands: BrandDto[] = [...RICH_SEED_BRANDS];
let inMemoryModels: ModelDto[] = [...RICH_SEED_MODELS];

export function getInMemoryVehicles(): VehicleDto[] {
  return inMemoryVehicles;
}

export function setInMemoryVehicles(vehicles: VehicleDto[]): void {
  inMemoryVehicles = vehicles;
}

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

/**
 * 新增车型档案 API (严格校验 0x02 协议车型代号)
 */
export async function createModelApi(data: CreateModelInput): Promise<ModelDto> {
  if (!validateProtocolCode(data.code)) {
    throw new Error('协议车型代号 0x02 格式不符合规范，请输入形如 0x0101 的 16 进制代号');
  }

  try {
    const result = await http.post<ModelDto>('/vehicles/models', data);
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
  const formattedCode = formatProtocolCode(data.code);

  const newModel: ModelDto = {
    id: `model-${Date.now()}`,
    brandId: data.brandId,
    brandName: brand?.name ?? '未知品牌',
    name: data.name.trim(),
    code: formattedCode,
    powertrain: data.powertrain,
    capabilityTemplateId: data.capabilityTemplateId,
    capabilityTemplateName: data.capabilityTemplateName,
    vehicleCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  inMemoryModels = [newModel, ...inMemoryModels];
  if (brand) {
    brand.modelCount = (brand.modelCount ?? 0) + 1;
  }
  return newModel;
}

/**
 * 更新车型信息 API
 */
export async function updateModelApi(id: string, data: UpdateModelInput): Promise<ModelDto> {
  if (data.code && !validateProtocolCode(data.code)) {
    throw new Error('协议车型代号 0x02 格式不符合规范，请输入形如 0x0101 的 16 进制代号');
  }

  try {
    const result = await http.patch<ModelDto>(`/vehicles/models/${encodeURIComponent(id)}`, data);
    if (result && result.id) {
      return result;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  const index = inMemoryModels.findIndex((m) => m.id === id);
  if (index === -1) {
    throw new Error(`车型 ID "${id}" 未找到`);
  }

  const target = inMemoryModels[index]!;
  const brand = data.brandId ? inMemoryBrands.find((b) => b.id === data.brandId) : undefined;
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const updatedModel: ModelDto = {
    ...target,
    ...(data.brandId ? { brandId: data.brandId, brandName: brand?.name ?? target.brandName } : {}),
    ...(data.name ? { name: data.name.trim() } : {}),
    ...(data.code ? { code: formatProtocolCode(data.code) } : {}),
    ...(data.powertrain ? { powertrain: data.powertrain } : {}),
    ...(data.capabilityTemplateId !== undefined ? { capabilityTemplateId: data.capabilityTemplateId } : {}),
    ...(data.capabilityTemplateName !== undefined ? { capabilityTemplateName: data.capabilityTemplateName } : {}),
    updatedAt: now,
  };

  inMemoryModels[index] = updatedModel;
  return updatedModel;
}

/**
 * 删除车型 API (防删除守卫：检查已有车辆数)
 */
export async function deleteModelApi(id: string): Promise<boolean> {
  try {
    const result = await http.delete<{ success: boolean } | boolean>(`/vehicles/models/${encodeURIComponent(id)}`);
    if (typeof result === 'boolean') return result;
    if (result && typeof result.success === 'boolean') return result.success;
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  const index = inMemoryModels.findIndex((m) => m.id === id);
  if (index === -1) {
    throw new Error(`车型 ID "${id}" 未找到`);
  }

  const model = inMemoryModels[index]!;
  const boundVehicles = inMemoryVehicles.filter((v) => v.modelId === id).length;
  const guard = canDeleteModel({ ...model, vehicleCount: boundVehicles || model.vehicleCount });
  if (!guard.allowed) {
    throw new Error(guard.reason || '已有车辆关联该车型，禁止删除');
  }

  inMemoryModels = inMemoryModels.filter((m) => m.id !== id);
  const brand = inMemoryBrands.find((b) => b.id === model.brandId);
  if (brand && brand.modelCount && brand.modelCount > 0) {
    brand.modelCount--;
  }

  return true;
}

/**
 * 新增车辆品牌 API
 */
export async function createBrandApi(data: CreateBrandInput): Promise<BrandDto> {
  if (!validateBrandCode(data.code)) {
    throw new Error('品牌代号格式不符合规范，请输入 2~12 位大写英文字母、数字或下划线');
  }

  try {
    const result = await http.post<BrandDto>('/vehicles/brands', data);
    if (result && result.id) {
      return result;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const newBrand: BrandDto = {
    id: `brand-${data.code.toLowerCase()}`,
    name: data.name.trim(),
    code: data.code.trim().toUpperCase(),
    country: data.country.trim(),
    logoUrl: data.logoUrl,
    modelCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  inMemoryBrands = [newBrand, ...inMemoryBrands];
  return newBrand;
}

/**
 * 更新车辆品牌 API
 */
export async function updateBrandApi(id: string, data: UpdateBrandInput): Promise<BrandDto> {
  if (data.code && !validateBrandCode(data.code)) {
    throw new Error('品牌代号格式不符合规范，请输入 2~12 位大写英文字母、数字或下划线');
  }

  try {
    const result = await http.patch<BrandDto>(`/vehicles/brands/${encodeURIComponent(id)}`, data);
    if (result && result.id) {
      return result;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  const index = inMemoryBrands.findIndex((b) => b.id === id);
  if (index === -1) {
    throw new Error(`品牌 ID "${id}" 未找到`);
  }

  const target = inMemoryBrands[index]!;
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const updatedBrand: BrandDto = {
    ...target,
    ...(data.name ? { name: data.name.trim() } : {}),
    ...(data.code ? { code: data.code.trim().toUpperCase() } : {}),
    ...(data.country ? { country: data.country.trim() } : {}),
    ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl } : {}),
    updatedAt: now,
  };

  inMemoryBrands[index] = updatedBrand;
  return updatedBrand;
}

/**
 * 删除车辆品牌 API (防删除守卫：检查该品牌下车型数)
 */
export async function deleteBrandApi(id: string): Promise<boolean> {
  try {
    const result = await http.delete<{ success: boolean } | boolean>(`/vehicles/brands/${encodeURIComponent(id)}`);
    if (typeof result === 'boolean') return result;
    if (result && typeof result.success === 'boolean') return result.success;
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  const index = inMemoryBrands.findIndex((b) => b.id === id);
  if (index === -1) {
    throw new Error(`品牌 ID "${id}" 未找到`);
  }

  const brand = inMemoryBrands[index]!;
  const boundModels = inMemoryModels.filter((m) => m.brandId === id).length;
  const guard = canDeleteBrand({ ...brand, modelCount: boundModels || brand.modelCount });
  if (!guard.allowed) {
    throw new Error(guard.reason || '该品牌下存在车型，禁止删除');
  }

  inMemoryBrands = inMemoryBrands.filter((b) => b.id !== id);
  return true;
}

/**
 * 绑定或更换车载硬件设备 API
 * 遵循 isApiError 模式：真实服务端异常抛出中断，离线环境在本地内存池中执行原子双向绑定
 */
export async function bindDeviceApi(
  vehicleId: string,
  deviceId: string,
  remark?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const result = await http.post<{ success: boolean; message: string }>(
      `/vehicles/${encodeURIComponent(vehicleId)}/bind-device`,
      { deviceId, remark }
    );
    if (result && typeof result.success === 'boolean') {
      return result;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线/开发环境降级：更新本地内存状态池
  const currentDevices = getInMemoryDevices();
  const vehicle = inMemoryVehicles.find((v) => v.id === vehicleId);
  const device = currentDevices.find((d) => d.id === deviceId);

  if (!vehicle) {
    throw new Error(`车辆 ID "${vehicleId}" 未找到`);
  }
  if (!device) {
    throw new Error(`设备 ID "${deviceId}" 未找到`);
  }

  const validation = validateBindingPair(vehicle, device);
  if (!validation.valid) {
    throw new Error(validation.error || '软硬件绑定配对规则校验未通过');
  }

  const {
    vehicles: nextVehicles,
    devices: nextDevices,
    targetVehicle,
    targetDevice,
  } = applyBindingChange(inMemoryVehicles, currentDevices, vehicleId, deviceId, remark);

  inMemoryVehicles = nextVehicles;
  setInMemoryDevices(nextDevices);

  return {
    success: true,
    message: `车辆【${targetVehicle?.plateNumber}】与硬件终端【${targetDevice?.deviceNo}】绑定成功`,
  };
}

/**
 * 解除车辆与车载硬件设备绑定 API
 * 遵循 isApiError 模式：真实服务端异常抛出中断，离线环境解绑并释放设备回库
 */
export async function unbindDeviceApi(
  vehicleId: string,
  reason?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const result = await http.post<{ success: boolean; message: string }>(
      `/vehicles/${encodeURIComponent(vehicleId)}/unbind-device`,
      { reason }
    );
    if (result && typeof result.success === 'boolean') {
      return result;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线/开发环境降级：解绑并释放设备
  const currentDevices = getInMemoryDevices();
  const vehicle = inMemoryVehicles.find((v) => v.id === vehicleId);
  if (!vehicle) {
    throw new Error(`车辆 ID "${vehicleId}" 未找到`);
  }

  const prevDeviceId = vehicle.deviceId;
  const { vehicles: nextVehicles, devices: nextDevices, targetVehicle } = applyBindingChange(
    inMemoryVehicles,
    currentDevices,
    vehicleId,
    null,
    reason
  );

  inMemoryVehicles = nextVehicles;
  setInMemoryDevices(nextDevices);

  return {
    success: true,
    message: `车辆【${targetVehicle?.plateNumber}】软硬件解绑成功，已解除与车载终端 (ID: ${prevDeviceId || '-'}) 的绑定关系`,
  };
}

/**
 * 获取当前租户下空闲可用车载终端 API
 * 遵循 isApiError 模式：过滤未被占用的 ACTIVE 设备，支持可选 projectId 过滤
 */
export async function fetchAvailableDevicesApi(projectId?: string): Promise<DeviceDto[]> {
  try {
    const data = await http.get<DeviceDto[]>(
      '/devices/available',
      projectId && projectId !== 'ALL' ? { projectId } : undefined
    );
    if (Array.isArray(data)) {
      return data;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线/开发环境降级
  let available = getInMemoryDevices().filter(
    (d) => d.status === 'ACTIVE' && !d.boundVin && !d.boundVehiclePlate && !d.boundVehicle
  );
  if (projectId && projectId !== 'ALL') {
    available = available.filter((d) => d.projectId === projectId);
  }
  return available;
}
