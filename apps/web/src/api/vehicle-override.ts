import { http, ApiError } from './client.ts';
import { CommandCode } from '@car-control/contracts';
import { type CapabilityRule } from '../views/command/capability-core.ts';
import {
  type VehicleCapabilityOverrideDto,
  SEED_VEHICLE_OVERRIDES,
} from '../views/command/vehicle-override-core.ts';
import { isApiError } from '../views/command/command-core.ts';
import { SEED_VEHICLES } from '../views/vehicle/vehicle-core.ts';

// 导出类型
export type { VehicleCapabilityOverrideDto };

// 本地内存覆盖池 (用于离线降级与前端状态留存)
let inMemoryVehicleOverrides: VehicleCapabilityOverrideDto[] = JSON.parse(
  JSON.stringify(SEED_VEHICLE_OVERRIDES)
);

export function getInMemoryVehicleOverrides(): VehicleCapabilityOverrideDto[] {
  return inMemoryVehicleOverrides;
}

export function setInMemoryVehicleOverrides(list: VehicleCapabilityOverrideDto[]): void {
  inMemoryVehicleOverrides = list;
}

export function resetInMemoryVehicleOverrides(): void {
  inMemoryVehicleOverrides = JSON.parse(JSON.stringify(SEED_VEHICLE_OVERRIDES));
}

/**
 * 获取单车专属能力覆盖配置
 * 若车辆未配置任何专属覆盖，返回 null (完全继承车型默认模板)
 */
export async function fetchVehicleOverrideApi(
  vehicleId: string
): Promise<VehicleCapabilityOverrideDto | null> {
  try {
    const res = await http.get<VehicleCapabilityOverrideDto>(
      `/capabilities/vehicles/${encodeURIComponent(vehicleId)}/override`
    );
    if (res && res.id) {
      return res;
    }
  } catch (err) {
    if (isApiError(err)) {
      if (err.statusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  // 离线降级匹配
  const found = inMemoryVehicleOverrides.find((o) => o.vehicleId === vehicleId);
  return found ? JSON.parse(JSON.stringify(found)) : null;
}

/**
 * 保存或更新单车专属能力覆盖配置
 */
export async function saveVehicleOverrideApi(
  vehicleId: string,
  overrides: Partial<Record<CommandCode, CapabilityRule>>,
  reason?: string
): Promise<VehicleCapabilityOverrideDto> {
  try {
    const res = await http.put<VehicleCapabilityOverrideDto>(
      `/capabilities/vehicles/${encodeURIComponent(vehicleId)}/override`,
      { overrides, reason }
    );
    if (res && res.id) {
      return res;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线降级持久化
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const existingIdx = inMemoryVehicleOverrides.findIndex((o) => o.vehicleId === vehicleId);
  const matchedVeh = SEED_VEHICLES.find((v) => v.id === vehicleId);

  if (existingIdx !== -1) {
    const updated: VehicleCapabilityOverrideDto = {
      ...inMemoryVehicleOverrides[existingIdx]!,
      overrides: JSON.parse(JSON.stringify(overrides)),
      updatedAt: now,
      updatedBy: 'operator-admin',
    };
    inMemoryVehicleOverrides[existingIdx] = updated;
    return JSON.parse(JSON.stringify(updated));
  } else {
    const newRecord: VehicleCapabilityOverrideDto = {
      id: `override-${vehicleId}-${Date.now()}`,
      vehicleId,
      vin: matchedVeh?.vin || `VIN-${vehicleId.toUpperCase()}`,
      plateNumber: matchedVeh?.plateNumber || `粤B·${vehicleId.slice(-5).toUpperCase()}`,
      modelId: matchedVeh?.modelId || 'model-default',
      updatedAt: now,
      updatedBy: 'operator-admin',
      overrides: JSON.parse(JSON.stringify(overrides)),
    };
    inMemoryVehicleOverrides.push(newRecord);
    return JSON.parse(JSON.stringify(newRecord));
  }
}

/**
 * 重置单车覆盖配置 (完全恢复继承车型默认模板)
 */
export async function resetVehicleOverrideApi(vehicleId: string): Promise<boolean> {
  try {
    const res = await http.delete<{ success: boolean }>(
      `/capabilities/vehicles/${encodeURIComponent(vehicleId)}/override`
    );
    if (res && typeof res.success === 'boolean') {
      return res.success;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线降级重置：移除该车辆的专属覆盖记录
  inMemoryVehicleOverrides = inMemoryVehicleOverrides.filter((o) => o.vehicleId !== vehicleId);
  return true;
}
