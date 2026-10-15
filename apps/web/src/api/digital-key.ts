import { http, ApiError } from './client.ts';
import {
  type DigitalKeyDto,
  type DigitalKeyQueryParams,
  type CreateDigitalKeyInput,
  SEED_DIGITAL_KEYS,
  filterDigitalKeys,
  isValidKeyStatusTransition,
} from '../views/command/digital-key-core.ts';
import { isApiError } from '../views/command/command-core.ts';
import { SEED_WORKBENCH_VEHICLES } from '../views/command/command-core.ts';

// 导出类型
export type { DigitalKeyDto, DigitalKeyQueryParams, CreateDigitalKeyInput };

// 本地内存深拷贝池 (用于离线降级与状态留存)
let inMemoryDigitalKeys: DigitalKeyDto[] = JSON.parse(
  JSON.stringify(SEED_DIGITAL_KEYS)
);

export function getInMemoryDigitalKeys(): DigitalKeyDto[] {
  return inMemoryDigitalKeys;
}

export function setInMemoryDigitalKeys(keys: DigitalKeyDto[]): void {
  inMemoryDigitalKeys = keys;
}

export function resetInMemoryDigitalKeys(): void {
  inMemoryDigitalKeys = JSON.parse(JSON.stringify(SEED_DIGITAL_KEYS));
}

/**
 * 分页/条件检索数字钥匙列表
 */
export async function fetchDigitalKeysApi(
  params?: DigitalKeyQueryParams
): Promise<DigitalKeyDto[]> {
  try {
    const res = await http.get<DigitalKeyDto[]>('/digital-keys', { params });
    if (Array.isArray(res)) {
      return res;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线降级与本地状态过滤
  const filtered = filterDigitalKeys(inMemoryDigitalKeys, params);
  return JSON.parse(JSON.stringify(filtered));
}

/**
 * 获取单张数字钥匙详细档案与操作履历
 */
export async function fetchDigitalKeyDetailApi(id: string): Promise<DigitalKeyDto> {
  try {
    const res = await http.get<DigitalKeyDto>(`/digital-keys/${encodeURIComponent(id)}`);
    if (res && res.id) {
      return res;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线降级
  const found = inMemoryDigitalKeys.find((k) => k.id === id);
  if (!found) {
    throw new ApiError('数字钥匙记录不存在或已被删除', 404);
  }

  return JSON.parse(JSON.stringify(found));
}

/**
 * 发放并授权新的数字钥匙
 */
export async function createDigitalKeyApi(
  data: CreateDigitalKeyInput
): Promise<DigitalKeyDto> {
  try {
    const res = await http.post<DigitalKeyDto>('/digital-keys', data);
    if (res && res.id) {
      return res;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线降级生成
  const now = new Date();
  const dateStr = now.toISOString().replace('T', ' ').slice(0, 19);
  const nextSeq = String(inMemoryDigitalKeys.length + 1).padStart(3, '0');
  const monthStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const keyNumber = `KEY-${monthStr}-${nextSeq}`;

  // 关联车辆基础信息
  const targetVeh = SEED_WORKBENCH_VEHICLES.find((v) => v.id === data.vehicleId);

  const newKey: DigitalKeyDto = {
    id: `key-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    keyNumber,
    vehicleId: data.vehicleId,
    plateNumber: data.plateNumber || targetVeh?.plateNumber || '粤B·88888',
    vin: data.vin || targetVeh?.vin || 'LSVAA4188P1002341',
    ownerName: data.ownerName || '平台默认车主',
    ownerPhone: data.ownerPhone || '13800138000',
    recipientName: data.recipientName,
    recipientPhone: data.recipientPhone,
    keyType: data.keyType,
    status: 'ACTIVE',
    startTime: data.startTime,
    endTime: data.endTime,
    maxUsageCount: data.maxUsageCount,
    usedCount: 0,
    permissions: data.permissions || [],
    createdAt: dateStr,
  };

  inMemoryDigitalKeys = [newKey, ...inMemoryDigitalKeys];
  return JSON.parse(JSON.stringify(newKey));
}

/**
 * 紧急吊销/作废数字钥匙 (终态不可逆，同步车端 CRL 吊销黑名单)
 */
export async function revokeDigitalKeyApi(
  id: string,
  reason: string
): Promise<DigitalKeyDto> {
  try {
    const res = await http.put<DigitalKeyDto>(
      `/digital-keys/${encodeURIComponent(id)}/revoke`,
      { reason }
    );
    if (res && res.id) {
      return res;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线降级状态流转
  const idx = inMemoryDigitalKeys.findIndex((k) => k.id === id);
  if (idx === -1) {
    throw new ApiError('未找到指定的数字钥匙', 404);
  }

  const currentKey = inMemoryDigitalKeys[idx]!;
  if (!isValidKeyStatusTransition(currentKey.status, 'REVOKED')) {
    throw new ApiError('该数字钥匙当前状态不允许作废', 400);
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const updated: DigitalKeyDto = {
    ...currentKey,
    status: 'REVOKED',
    revokedAt: now,
    revokedReason: reason || '管理员手动吊销钥匙权限',
  };

  inMemoryDigitalKeys[idx] = updated;
  return JSON.parse(JSON.stringify(updated));
}

/**
 * 获取指定车辆的历史数字钥匙流转记录
 */
export async function fetchVehicleKeyHistoryApi(
  vehicleId: string
): Promise<DigitalKeyDto[]> {
  try {
    const res = await http.get<DigitalKeyDto[]>(
      `/vehicles/${encodeURIComponent(vehicleId)}/digital-keys`
    );
    if (Array.isArray(res)) {
      return res;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线降级
  const vehicleKeys = inMemoryDigitalKeys.filter((k) => k.vehicleId === vehicleId);
  return JSON.parse(JSON.stringify(vehicleKeys));
}
