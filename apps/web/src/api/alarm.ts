import { http, ApiError } from './client.ts';
import {
  type AlarmRecord,
  type AlarmQueryParams,
  AlarmStatus,
  isTerminalAlarmStatus,
  isValidAlarmStatusTransition,
  filterAlarms,
  isApiError,
  SEED_ALARMS,
  type ProcessAlarmDto,
} from '../views/alarm/alarm-core.ts';

// 导出客户端查询与入参类型
export type { AlarmQueryParams, ProcessAlarmDto };

// 内存告警状态池 (用于离线降级与端到端演练)
let inMemoryAlarms: AlarmRecord[] = JSON.parse(JSON.stringify(SEED_ALARMS));

/**
 * 获取当前内存告警快照
 */
export function getInMemoryAlarms(): AlarmRecord[] {
  return inMemoryAlarms;
}

/**
 * 设置内存告警列表
 */
export function setInMemoryAlarms(list: AlarmRecord[]): void {
  inMemoryAlarms = list;
}

/**
 * 重置内存告警池为原始种子数据
 */
export function resetInMemoryAlarms(): void {
  inMemoryAlarms = JSON.parse(JSON.stringify(SEED_ALARMS));
}

/**
 * 多维过滤检索告警列表
 */
export async function fetchAlarmsApi(params?: AlarmQueryParams): Promise<AlarmRecord[]> {
  try {
    const res = await http.get<AlarmRecord[]>('/alarms', { params });
    if (Array.isArray(res)) {
      return res;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线/开发环境降级
  const filtered = filterAlarms(inMemoryAlarms, params);
  return JSON.parse(JSON.stringify(filtered));
}

/**
 * 获取指定告警记录详情
 */
export async function fetchAlarmDetailApi(id: string): Promise<AlarmRecord> {
  try {
    const res = await http.get<AlarmRecord>(`/alarms/${encodeURIComponent(id)}`);
    if (res && res.id) {
      return res;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  const found = inMemoryAlarms.find((a) => a.id === id);
  if (!found) {
    throw new ApiError(`未找到 ID 为 [${id}] 的告警记录`, 404);
  }

  return JSON.parse(JSON.stringify(found));
}

/**
 * 人工闭环处置告警 (严格终态保护与原因审计)
 */
export async function processAlarmApi(id: string, dto: ProcessAlarmDto): Promise<AlarmRecord> {
  // 1. 查找目标记录
  const index = inMemoryAlarms.findIndex((a) => a.id === id);
  if (index === -1) {
    throw new ApiError(`未找到 ID 为 [${id}] 的告警记录`, 404);
  }
  const current = inMemoryAlarms[index];

  // 2. 终态不变性防御
  if (isTerminalAlarmStatus(current.status)) {
    throw new ApiError(`告警 [${id}] 已处于终态 [${current.status}]，禁止重复处置`, 400);
  }

  // 3. 状态转移拓扑校验
  const targetStatus = dto.status as AlarmStatus;
  if (!isValidAlarmStatusTransition(current.status, targetStatus)) {
    throw new ApiError(
      `非法的告警状态流转: [${current.status}] -> [${targetStatus}]，仅允许对待处置告警进行闭环或忽略`,
      400
    );
  }

  // 4. 必填处置原因长度校验 (2~200 字)
  const remarkTrimmed = dto.remark ? dto.remark.trim() : '';
  if (!remarkTrimmed || remarkTrimmed.length < 2 || remarkTrimmed.length > 200) {
    throw new ApiError('处置原因说明必须在 2 到 200 个字符之间', 400);
  }

  // 5. 尝试向服务端提交
  try {
    const res = await http.post<AlarmRecord>(`/alarms/${encodeURIComponent(id)}/process`, {
      data: {
        status: targetStatus,
        remark: remarkTrimmed,
        operatorId: dto.operatorId,
      },
    });
    if (res && res.id) {
      inMemoryAlarms[index] = res;
      return res;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 6. 离线/模拟内存更新
  const now = new Date().toISOString();
  const operatorName = dto.operatorId || '系统管理员 (Admin)';
  const updated: AlarmRecord = {
    ...current,
    status: targetStatus,
    remark: remarkTrimmed,
    processedAt: now,
    processedBy: operatorName,
    operatorId: dto.operatorId || 'admin-001',
    updatedAt: now,
  };

  inMemoryAlarms[index] = updated;
  return JSON.parse(JSON.stringify(updated));
}
