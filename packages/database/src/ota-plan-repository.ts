import { randomUUID } from 'node:crypto';
import { OtaPlan } from '@car-control/domain-types';
import { OtaPlanStatus, canTransitionOtaPlanStatus } from '@car-control/contracts';
import { TenantAwareRepository } from './repository.js';

export type CreateOtaPlanInput = Omit<
  OtaPlan,
  'id' | 'tenantId' | 'status' | 'totalDevices' | 'successDevices' | 'failedDevices' | 'createdAt'
> & {
  id?: string;
  tenantId?: string;
  status?: OtaPlanStatus;
  totalDevices?: number;
  successDevices?: number;
  failedDevices?: number;
  createdAt?: Date;
  updatedAt?: Date;
};

/**
 * OTA 升级计划仓储
 * 严格受多租户上下文隔离约束，保障计划状态机流转拓扑与终态单向保护，支持执行进度计数器原子更新
 */
export class OtaPlanRepository extends TenantAwareRepository<OtaPlan> {
  /**
   * 创建 OTA 升级计划记录
   * 自动生成 UUID、初始化状态与计数器
   */
  override async create(plan: CreateOtaPlanInput): Promise<OtaPlan> {
    const id = plan.id || randomUUID();
    const now = new Date();
    const record: Omit<OtaPlan, 'tenantId'> = {
      ...plan,
      id,
      status: plan.status ?? OtaPlanStatus.DRAFT,
      totalDevices: plan.totalDevices ?? 0,
      successDevices: plan.successDevices ?? 0,
      failedDevices: plan.failedDevices ?? 0,
      createdAt: plan.createdAt ?? now,
      updatedAt: plan.updatedAt ?? now,
    };

    return super.create(record);
  }

  /**
   * 列表查询升级计划，支持 status 与 firmwareId 条件过滤，按创建时间倒序排列
   */
  async list(filter?: {
    status?: OtaPlanStatus;
    firmwareId?: string;
  }): Promise<OtaPlan[]> {
    const results = await this.findMany((item) => {
      if (!filter) {
        return true;
      }
      if (filter.status && item.status !== filter.status) {
        return false;
      }
      if (filter.firmwareId && item.firmwareId !== filter.firmwareId) {
        return false;
      }
      return true;
    });

    return results.sort((a, b) => {
      const timeA = a.createdAt?.getTime() ?? 0;
      const timeB = b.createdAt?.getTime() ?? 0;
      return timeB - timeA;
    });
  }

  /**
   * 更新升级计划生命周期状态
   * 严格应用 canTransitionOtaPlanStatus 状态转移拓扑，禁止从终态 (COMPLETED/CANCELLED) 流转
   */
  async updateStatus(id: string, status: OtaPlanStatus): Promise<OtaPlan> {
    const plan = await this.findById(id);
    if (!plan) {
      throw new Error(`[OtaPlanRepository] Plan not found: ${id}`);
    }

    if (!canTransitionOtaPlanStatus(plan.status, status)) {
      throw new Error(
        `[OtaPlanRepository] Invalid OTA plan status transition from ${plan.status} to ${status} for plan ${id}`
      );
    }

    plan.status = status;
    plan.updatedAt = new Date();
    return plan;
  }

  /**
   * 增量原子更新计划的成功/失败设备计数器
   */
  async updateCounters(
    id: string,
    increments: { success?: number; failed?: number }
  ): Promise<OtaPlan> {
    const plan = await this.findById(id);
    if (!plan) {
      throw new Error(`[OtaPlanRepository] Plan not found: ${id}`);
    }

    if (increments.success !== undefined) {
      plan.successDevices = (plan.successDevices ?? 0) + increments.success;
    }
    if (increments.failed !== undefined) {
      plan.failedDevices = (plan.failedDevices ?? 0) + increments.failed;
    }
    plan.updatedAt = new Date();
    return plan;
  }
}
