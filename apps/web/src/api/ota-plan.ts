import { http, ApiError } from './client.ts';
import {
  type OtaPlanDto,
  type CreateOtaPlanInput,
  type OtaPlanQueryParams,
  OtaPlanStatus,
  ScheduleType,
  isValidPlanStatusTransition,
  validateSafetyPreconditions,
  validateExecutionConfig,
  filterOtaPlans,
  SEED_OTA_PLANS,
} from '../views/ota/ota-plan-core.ts';
import { getInMemoryFirmwarePackages } from './firmware.ts';
import { SEED_FIRMWARE_PACKAGES, isApiError } from '../views/ota/firmware-core.ts';

// 导出入参及 DTO 类型方便外部复用
export type { OtaPlanDto, CreateOtaPlanInput, OtaPlanQueryParams };

// 本地内存备份状态池 (支持离线演示与无后端环境平滑降级)
let inMemoryPlans: OtaPlanDto[] = JSON.parse(JSON.stringify(SEED_OTA_PLANS));

/**
 * 获取当前内存升级计划快照
 */
export function getInMemoryOtaPlans(): OtaPlanDto[] {
  return inMemoryPlans;
}

/**
 * 设置内存升级计划列表
 */
export function setInMemoryOtaPlans(list: OtaPlanDto[]): void {
  inMemoryPlans = list;
}

/**
 * 重置内存计划池为原始种子数据
 */
export function resetInMemoryOtaPlans(): void {
  inMemoryPlans = JSON.parse(JSON.stringify(SEED_OTA_PLANS));
}

/**
 * 多维过滤检索升级计划列表
 */
export async function fetchOtaPlansApi(
  params?: OtaPlanQueryParams
): Promise<OtaPlanDto[]> {
  try {
    const res = await http.get<OtaPlanDto[]>('/ota/plans', { params });
    if (Array.isArray(res)) {
      return res;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线/开发环境降级：从内存池中过滤
  const filtered = filterOtaPlans(inMemoryPlans, params);
  return JSON.parse(JSON.stringify(filtered));
}

/**
 * 获取指定升级计划详情
 */
export async function fetchOtaPlanDetailApi(id: string): Promise<OtaPlanDto> {
  try {
    const res = await http.get<OtaPlanDto>(`/ota/plans/${encodeURIComponent(id)}`);
    if (res && res.id) {
      return res;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线/开发环境降级
  const found = inMemoryPlans.find((p) => p.id === id);
  if (!found) {
    throw new ApiError(`未找到 ID 为 [${id}] 的升级计划`, 404);
  }
  return JSON.parse(JSON.stringify(found));
}

/**
 * 校验并创建全新 OTA 升级计划
 */
export async function createOtaPlanApi(
  data: CreateOtaPlanInput
): Promise<OtaPlanDto> {
  // 前置参数校验
  const safeRes = validateSafetyPreconditions(data.safetyPreconditions);
  if (!safeRes.valid) {
    const firstErr = Object.values(safeRes.errors)[0];
    throw new ApiError(`安全前置门禁校验未通过: ${firstErr}`, 400);
  }

  const cfgRes = validateExecutionConfig(data.executionConfig);
  if (!cfgRes.valid) {
    const firstErr = Object.values(cfgRes.errors)[0];
    throw new ApiError(`执行参数校验未通过: ${firstErr}`, 400);
  }

  try {
    const res = await http.post<OtaPlanDto>('/ota/plans', data);
    if (res && res.id) {
      inMemoryPlans.unshift(res);
      return res;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线/开发环境降级：寻找关联固件包信息
  let fwPool = getInMemoryFirmwarePackages();
  if (!fwPool || fwPool.length === 0) {
    fwPool = SEED_FIRMWARE_PACKAGES;
  }
  const fw = fwPool.find((f) => f.id === data.firmwareId) || SEED_FIRMWARE_PACKAGES[0];

  const initialStatus =
    data.scheduleType === ScheduleType.IMMEDIATE
      ? OtaPlanStatus.RUNNING
      : OtaPlanStatus.SCHEDULED;

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const targetIds = data.targetVehicleIds || [];

  const newPlan: OtaPlanDto = {
    id: `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: data.name.trim(),
    firmwareId: data.firmwareId,
    firmwareName: fw?.name || 'OTA 目标固件',
    firmwareVersion: fw?.version || 'v1.0.0',
    firmwareType: fw?.firmwareType || ('TBOX' as any),
    status: initialStatus,
    upgradeMode: data.upgradeMode,
    scheduleType: data.scheduleType,
    scheduledStartTime: data.scheduledStartTime,
    scheduledEndTime: data.scheduledEndTime,
    safetyPreconditions: { ...data.safetyPreconditions },
    executionConfig: { ...data.executionConfig },
    targetVehicleIds: targetIds,
    targetVehicleCount: targetIds.length,
    successCount: 0,
    runningCount: initialStatus === OtaPlanStatus.RUNNING ? targetIds.length : 0,
    failedCount: 0,
    pendingCount: initialStatus === OtaPlanStatus.RUNNING ? 0 : targetIds.length,
    progressPercent: 0,
    failureRatePercent: 0,
    createdAt: now,
    updatedAt: now,
    createdBy: data.createdBy || '系统管理员',
    tenantId: data.tenantId,
  };

  inMemoryPlans.unshift(newPlan);
  return JSON.parse(JSON.stringify(newPlan));
}

/**
 * 暂停执行中的升级计划
 */
export async function pauseOtaPlanApi(id: string): Promise<OtaPlanDto> {
  try {
    const res = await http.post<OtaPlanDto>(`/ota/plans/${encodeURIComponent(id)}/pause`);
    if (res && res.id) {
      const idx = inMemoryPlans.findIndex((p) => p.id === id);
      if (idx !== -1) inMemoryPlans[idx] = res;
      return res;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线/开发环境降级
  const idx = inMemoryPlans.findIndex((p) => p.id === id);
  if (idx === -1) {
    throw new ApiError(`未找到 ID 为 [${id}] 的升级计划`, 404);
  }

  const current = inMemoryPlans[idx];
  if (!isValidPlanStatusTransition(current.status, OtaPlanStatus.PAUSED)) {
    throw new ApiError(
      `升级计划当前状态为 [${current.status}]，不可流转至暂停状态`,
      400
    );
  }

  const updated: OtaPlanDto = {
    ...current,
    status: OtaPlanStatus.PAUSED,
    updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
  };
  inMemoryPlans[idx] = updated;
  return JSON.parse(JSON.stringify(updated));
}

/**
 * 恢复已暂停的升级计划
 */
export async function resumeOtaPlanApi(id: string): Promise<OtaPlanDto> {
  try {
    const res = await http.post<OtaPlanDto>(`/ota/plans/${encodeURIComponent(id)}/resume`);
    if (res && res.id) {
      const idx = inMemoryPlans.findIndex((p) => p.id === id);
      if (idx !== -1) inMemoryPlans[idx] = res;
      return res;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线/开发环境降级
  const idx = inMemoryPlans.findIndex((p) => p.id === id);
  if (idx === -1) {
    throw new ApiError(`未找到 ID 为 [${id}] 的升级计划`, 404);
  }

  const current = inMemoryPlans[idx];
  if (!isValidPlanStatusTransition(current.status, OtaPlanStatus.RUNNING)) {
    throw new ApiError(
      `升级计划当前状态为 [${current.status}]，不可流转至恢复执行状态`,
      400
    );
  }

  const updated: OtaPlanDto = {
    ...current,
    status: OtaPlanStatus.RUNNING,
    updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
  };
  inMemoryPlans[idx] = updated;
  return JSON.parse(JSON.stringify(updated));
}

/**
 * 取消/终止升级计划
 */
export async function cancelOtaPlanApi(
  id: string,
  reason?: string
): Promise<OtaPlanDto> {
  try {
    const res = await http.post<OtaPlanDto>(`/ota/plans/${encodeURIComponent(id)}/cancel`, {
      reason,
    });
    if (res && res.id) {
      const idx = inMemoryPlans.findIndex((p) => p.id === id);
      if (idx !== -1) inMemoryPlans[idx] = res;
      return res;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线/开发环境降级
  const idx = inMemoryPlans.findIndex((p) => p.id === id);
  if (idx === -1) {
    throw new ApiError(`未找到 ID 为 [${id}] 的升级计划`, 404);
  }

  const current = inMemoryPlans[idx];
  if (!isValidPlanStatusTransition(current.status, OtaPlanStatus.ABORTED)) {
    throw new ApiError(
      `升级计划当前处于 [${current.status}] 终态，不可流转至终止状态`,
      400
    );
  }

  const updated: OtaPlanDto = {
    ...current,
    status: OtaPlanStatus.ABORTED,
    abortReason: reason || '用户手动取消升级计划',
    updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
  };
  inMemoryPlans[idx] = updated;
  return JSON.parse(JSON.stringify(updated));
}
