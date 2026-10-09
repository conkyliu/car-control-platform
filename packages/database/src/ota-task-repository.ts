import { randomUUID } from 'node:crypto';
import { OtaDeviceTask } from '@car-control/domain-types';
import {
  OtaTaskStatus,
  OtaStep,
  canTransitionOtaTaskStatus,
  isTerminalOtaTaskStatus,
} from '@car-control/contracts';
import { TenantAwareRepository } from './repository.js';

export type CreateOtaTaskInput = Omit<
  OtaDeviceTask,
  'id' | 'tenantId' | 'status' | 'currentStep' | 'progressPercent' | 'retryCount'
> & {
  id?: string;
  tenantId?: string;
  status?: OtaTaskStatus;
  currentStep?: OtaStep;
  progressPercent?: number;
  retryCount?: number;
  createdAt?: Date;
  updatedAt?: Date;
};

/**
 * OTA 设备升级任务仓储
 * 严格受多租户上下文隔离约束，保障单设备任务流转拓扑与终态单向不可逆防护
 */
export class OtaTaskRepository extends TenantAwareRepository<OtaDeviceTask> {
  /**
   * 创建 OTA 设备升级任务记录
   * 自动生成 UUID、初始化状态与进度
   */
  override async create(task: CreateOtaTaskInput): Promise<OtaDeviceTask> {
    const id = task.id || randomUUID();
    const now = new Date();
    const record: Omit<OtaDeviceTask, 'tenantId'> = {
      ...task,
      id,
      status: task.status ?? OtaTaskStatus.QUEUED,
      currentStep: task.currentStep ?? OtaStep.DOWNLOADING,
      progressPercent: task.progressPercent ?? 0,
      retryCount: task.retryCount ?? 0,
      createdAt: task.createdAt ?? now,
      updatedAt: task.updatedAt ?? now,
    };

    return super.create(record);
  }

  /**
   * 按计划 ID 与设备号查询任务（严格限定当前租户）
   */
  async findByPlanAndDevice(planId: string, deviceNo: string): Promise<OtaDeviceTask | null> {
    const list = await this.findMany(
      (item) => item.planId === planId && item.deviceNo === deviceNo
    );
    return list[0] ?? null;
  }

  /**
   * 按计划 ID 查询所属全部设备升级任务（严格限定当前租户）
   */
  async listByPlan(planId: string): Promise<OtaDeviceTask[]> {
    return this.findMany((item) => item.planId === planId);
  }

  /**
   * 更新任务进度与流转状态
   * 严格遵循 canTransitionOtaTaskStatus 拓扑，对已处于终态的任务实施严格防修改保护
   */
  async updateProgress(
    taskId: string,
    progress: {
      status: OtaTaskStatus;
      step: OtaStep;
      percent: number;
      reason?: string;
    }
  ): Promise<OtaDeviceTask> {
    const task = await this.findById(taskId);
    if (!task) {
      throw new Error(`[OtaTaskRepository] Task not found: ${taskId}`);
    }

    if (isTerminalOtaTaskStatus(task.status)) {
      throw new Error(
        `[OtaTaskRepository] Cannot update task ${taskId} already in terminal status ${task.status}`
      );
    }

    if (task.status !== progress.status && !canTransitionOtaTaskStatus(task.status, progress.status)) {
      throw new Error(
        `[OtaTaskRepository] Invalid OTA task status transition from ${task.status} to ${progress.status} for task ${taskId}`
      );
    }

    task.status = progress.status;
    task.currentStep = progress.step;
    task.progressPercent = progress.percent;
    if (progress.reason !== undefined) {
      task.failureReason = progress.reason;
    }

    const now = new Date();
    task.updatedAt = now;

    if (progress.status === OtaTaskStatus.NOTIFIED && !task.notifiedAt) {
      task.notifiedAt = now;
    }
    if (isTerminalOtaTaskStatus(progress.status) && !task.finishedAt) {
      task.finishedAt = now;
    }

    return task;
  }

  /**
   * 递增任务重试计数
   */
  async incrementRetry(taskId: string): Promise<OtaDeviceTask> {
    const task = await this.findById(taskId);
    if (!task) {
      throw new Error(`[OtaTaskRepository] Task not found: ${taskId}`);
    }

    task.retryCount = (task.retryCount ?? 0) + 1;
    task.updatedAt = new Date();
    return task;
  }
}
