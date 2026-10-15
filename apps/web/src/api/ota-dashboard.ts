import { http, ApiError } from './client.ts';
import {
  type OtaPlanDetailDto,
  type OtaVehicleTaskRecord,
  OtaVehicleTaskStatus,
  calculatePlanTaskSummary,
  SEED_OTA_PLAN_DETAILS,
} from '../views/ota/ota-dashboard-core.ts';
import { isApiError } from '../views/ota/firmware-core.ts';

// 导出类型方便上层调用
export type { OtaPlanDetailDto, OtaVehicleTaskRecord };

// 内部可变内存状态池 (用于离线演示、无后端独立验证与快照回滚)
let inMemoryPlanDetails: Record<string, OtaPlanDetailDto> = JSON.parse(
  JSON.stringify(SEED_OTA_PLAN_DETAILS)
);

/**
 * 获取当前内存中的 OTA 计划明细快照
 */
export function getInMemoryOtaPlanDetails(): Record<string, OtaPlanDetailDto> {
  return inMemoryPlanDetails;
}

/**
 * 覆盖设置内存中的 OTA 计划明细
 */
export function setInMemoryOtaPlanDetails(
  data: Record<string, OtaPlanDetailDto>
): void {
  inMemoryPlanDetails = data;
}

/**
 * 重置内存计划明细池为原始种子数据
 */
export function resetInMemoryOtaPlanDetails(): void {
  inMemoryPlanDetails = JSON.parse(JSON.stringify(SEED_OTA_PLAN_DETAILS));
}

/**
 * 获取指定计划的执行明细与车辆任务看板 (包含各阶段汇总与单车列表)
 */
export async function fetchOtaPlanExecutionDetailApi(
  planId: string
): Promise<OtaPlanDetailDto> {
  try {
    const res = await http.get<OtaPlanDetailDto>(
      `/ota/plans/${encodeURIComponent(planId)}/execution`
    );
    if (res && res.plan && res.summary) {
      return res;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线/开发降级
  const found = inMemoryPlanDetails[planId];
  if (!found) {
    throw new ApiError(`未找到 ID 为 [${planId}] 的升级计划执行明细`, 404);
  }

  return JSON.parse(JSON.stringify(found));
}

/**
 * 批量重试指定计划中的失败车辆任务
 */
export async function retryFailedVehiclesApi(
  planId: string,
  vehicleTaskIds?: string[]
): Promise<OtaPlanDetailDto> {
  try {
    const res = await http.post<OtaPlanDetailDto>(
      `/ota/plans/${encodeURIComponent(planId)}/retry-failed`,
      { vehicleTaskIds }
    );
    if (res && res.plan && res.summary) {
      inMemoryPlanDetails[planId] = res;
      return res;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线/开发降级
  const detail = inMemoryPlanDetails[planId];
  if (!detail) {
    throw new ApiError(`未找到 ID 为 [${planId}] 的升级计划`, 404);
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const targetIds = vehicleTaskIds ? new Set(vehicleTaskIds) : null;

  for (const task of detail.vehicleTasks) {
    if (task.status === OtaVehicleTaskStatus.FAILED) {
      if (!targetIds || targetIds.has(task.id)) {
        task.status = OtaVehicleTaskStatus.PENDING;
        task.downloadProgress = 0;
        task.installProgress = 0;
        task.totalProgress = 0;
        task.retries = (task.retries ?? 0) + 1;
        task.errorCode = undefined;
        task.errorMessage = undefined;
        task.startedAt = now;

        if (!task.logs) task.logs = [];
        task.logs.unshift({
          id: `log-retry-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: now,
          phase: OtaVehicleTaskStatus.PENDING,
          action: '批量重试下发',
          code: 'BATCH_RETRY',
          description: `运维触发故障重试 (第 ${task.retries} 次重试)，重置状态等待重新调度`,
          level: 'info',
        });
      }
    }
  }

  // 重新计算 summary
  const threshold = detail.plan?.executionConfig?.failureThresholdPercent ?? 5;
  detail.summary = calculatePlanTaskSummary(detail.vehicleTasks, threshold);

  return JSON.parse(JSON.stringify(detail));
}

/**
 * 单车失败重试下发
 */
export async function retrySingleVehicleTaskApi(
  planId: string,
  taskId: string
): Promise<OtaVehicleTaskRecord> {
  try {
    const res = await http.post<OtaVehicleTaskRecord>(
      `/ota/plans/${encodeURIComponent(planId)}/tasks/${encodeURIComponent(taskId)}/retry`
    );
    if (res && res.id) {
      return res;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线/开发降级
  const detail = inMemoryPlanDetails[planId];
  if (!detail) {
    throw new ApiError(`未找到 ID 为 [${planId}] 的升级计划`, 404);
  }

  const task = detail.vehicleTasks.find((t) => t.id === taskId);
  if (!task) {
    throw new ApiError(`在计划 [${planId}] 中未找到 ID 为 [${taskId}] 的车辆任务`, 404);
  }

  if (task.status !== OtaVehicleTaskStatus.FAILED) {
    throw new ApiError(
      `车辆任务当前处于 [${task.status}] 状态，仅支持对升级失败 (FAILED) 任务发起重试`,
      400
    );
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  task.status = OtaVehicleTaskStatus.PENDING;
  task.downloadProgress = 0;
  task.installProgress = 0;
  task.totalProgress = 0;
  task.retries = (task.retries ?? 0) + 1;
  task.errorCode = undefined;
  task.errorMessage = undefined;
  task.startedAt = now;

  if (!task.logs) task.logs = [];
  task.logs.unshift({
    id: `log-retry-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: now,
    phase: OtaVehicleTaskStatus.PENDING,
    action: '单车故障重试',
    code: 'SINGLE_RETRY',
    description: `针对该车辆发起第 ${task.retries} 次重试下发，状态已重置为待下发`,
    level: 'info',
  });

  // 重新计算 summary
  const threshold = detail.plan?.executionConfig?.failureThresholdPercent ?? 5;
  detail.summary = calculatePlanTaskSummary(detail.vehicleTasks, threshold);

  return JSON.parse(JSON.stringify(task));
}

/**
 * 订阅单车升级实时进度流水 (模拟 WebSocket / SSE 实时推流)
 */
export function subscribeRealtimeOtaProgress(
  planId: string,
  onUpdate: (task: OtaVehicleTaskRecord) => void
): () => void {
  let isSubscribed = true;

  // 立即触发一次快速轻量更新回调
  const immediateTimer = setTimeout(() => {
    if (!isSubscribed) return;
    const detail = inMemoryPlanDetails[planId];
    if (detail && detail.vehicleTasks.length > 0) {
      // 优先推送进行中或第一个任务
      const target =
        detail.vehicleTasks.find(
          (t) =>
            t.status === OtaVehicleTaskStatus.DOWNLOADING ||
            t.status === OtaVehicleTaskStatus.UPGRADING
        ) || detail.vehicleTasks[0];
      onUpdate(JSON.parse(JSON.stringify(target)));
    }
  }, 30);

  // 周期性模拟进度流
  const intervalTimer = setInterval(() => {
    if (!isSubscribed) return;
    const detail = inMemoryPlanDetails[planId];
    if (!detail) return;

    const upgradingTask = detail.vehicleTasks.find(
      (t) =>
        t.status === OtaVehicleTaskStatus.UPGRADING ||
        t.status === OtaVehicleTaskStatus.DOWNLOADING
    );

    if (upgradingTask) {
      if (upgradingTask.status === OtaVehicleTaskStatus.DOWNLOADING) {
        upgradingTask.downloadProgress = Math.min(
          100,
          (upgradingTask.downloadProgress || 0) + 10
        );
        if (upgradingTask.downloadProgress >= 100) {
          upgradingTask.status = OtaVehicleTaskStatus.DOWNLOADED;
        }
      } else if (upgradingTask.status === OtaVehicleTaskStatus.UPGRADING) {
        upgradingTask.installProgress = Math.min(
          100,
          (upgradingTask.installProgress || 0) + 5
        );
        if (upgradingTask.installProgress >= 100) {
          upgradingTask.status = OtaVehicleTaskStatus.SUCCESS;
        }
      }
      upgradingTask.totalProgress = Math.round(
        (upgradingTask.downloadProgress * 0.4) + (upgradingTask.installProgress * 0.6)
      );
      detail.summary = calculatePlanTaskSummary(
        detail.vehicleTasks,
        detail.plan?.executionConfig?.failureThresholdPercent ?? 5
      );
      onUpdate(JSON.parse(JSON.stringify(upgradingTask)));
    }
  }, 4000);

  return () => {
    isSubscribed = false;
    clearTimeout(immediateTimer);
    clearInterval(intervalTimer);
  };
}
