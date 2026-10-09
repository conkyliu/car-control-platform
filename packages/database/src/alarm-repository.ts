import { randomUUID } from 'node:crypto';
import { AlarmRecord } from '@car-control/domain-types';
import {
  AlarmRecordDto,
  AlarmStatus,
  canTransitionAlarmStatus,
} from '@car-control/contracts';
import { TenantAwareRepository } from './repository.js';

export type CreateAlarmInput = Omit<AlarmRecordDto, 'id' | 'tenantId'> & {
  id?: string;
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

/**
 * 车辆告警仓储
 * 严格受多租户上下文隔离约束，并严格遵循告警处置生命周期与终态不可逆状态流转规则
 */
export class AlarmRepository extends TenantAwareRepository<AlarmRecord> {
  /**
   * 创建告警记录
   * 自动生成 UUID 主键及创建/更新时间，并由父类自动注入上下文 tenantId
   */
  override async create(alarm: CreateAlarmInput): Promise<AlarmRecord> {
    const id = alarm.id || randomUUID();
    const now = new Date();
    const record: Omit<AlarmRecord, 'tenantId'> = {
      createdAt: alarm.createdAt ?? now,
      updatedAt: alarm.updatedAt ?? now,
      ...alarm,
      id,
    };
    return super.create(record);
  }

  /**
   * 条件列表检索
   * 支持按 vehicleId、status 组合过滤，严格限定当前租户，按触发时间倒序排列
   */
  async list(filter?: { vehicleId?: string; status?: AlarmStatus }): Promise<AlarmRecord[]> {
    const results = await this.findMany((alarm) => {
      if (filter?.vehicleId && alarm.vehicleId !== filter.vehicleId) {
        return false;
      }
      if (filter?.status && alarm.status !== filter.status) {
        return false;
      }
      return true;
    });

    return results.sort((a, b) => {
      const timeA = (alarmTime(a)).getTime();
      const timeB = (alarmTime(b)).getTime();
      return timeB - timeA;
    });
  }

  /**
   * 更新告警处置生命周期状态
   * 严格应用 canTransitionAlarmStatus 状态转移拓扑，禁止从终态 (PROCESSED/IGNORED) 进行二次流转
   */
  async updateStatus(
    id: string,
    status: AlarmStatus,
    operatorId: string,
    remark?: string
  ): Promise<AlarmRecord> {
    const alarm = await this.findById(id);
    if (!alarm) {
      throw new Error(`[AlarmRepository] Alarm not found: ${id}`);
    }

    if (!canTransitionAlarmStatus(alarm.status, status)) {
      throw new Error(
        `[AlarmRepository] Invalid alarm status transition from ${alarm.status} to ${status} for alarm ${id}`
      );
    }

    alarm.status = status;
    alarm.operatorId = operatorId;
    alarm.processedBy = operatorId;
    if (remark !== undefined) {
      alarm.remark = remark;
    }
    const now = new Date();
    alarm.processedAt = now;
    alarm.updatedAt = now;

    return alarm;
  }
}

function alarmTime(record: AlarmRecord): Date {
  return record.triggeredAt ?? record.createdAt ?? new Date();
}
