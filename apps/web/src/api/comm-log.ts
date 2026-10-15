import { http, ApiError } from './client.ts';
import {
  type CommLogRecord,
  type CommLogQueryParams,
  SEED_COMM_LOGS,
  filterCommLogs,
  generateCommLogsCsv,
  isApiError,
} from '../views/log/comm-log-core.ts';

// 离线内存态持久化日志池
let inMemoryCommLogs: CommLogRecord[] = JSON.parse(JSON.stringify(SEED_COMM_LOGS));

/**
 * 重置内存通讯日志池 (用于测试及还原初始化)
 */
export function resetInMemoryCommLogs(): void {
  inMemoryCommLogs = JSON.parse(JSON.stringify(SEED_COMM_LOGS));
}

/**
 * 获取当前内存中的通讯日志副本
 */
export function getInMemoryCommLogs(): CommLogRecord[] {
  return JSON.parse(JSON.stringify(inMemoryCommLogs));
}

/**
 * 检索原始通讯日志列表
 *
 * @param params 多维查询参数 (关键字、协议、流向、校验状态、时间段)
 * @returns 排序后的通讯日志数组 (时间倒序)
 */
export async function fetchCommLogsApi(params?: CommLogQueryParams): Promise<CommLogRecord[]> {
  try {
    const remoteLogs = await http.get<CommLogRecord[]>('/logs/comm', params);
    if (Array.isArray(remoteLogs)) {
      return remoteLogs;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
    // 离线或开发模式降级兜底
  }

  // 离线状态降级：基于内存池执行内存筛选
  const filtered = filterCommLogs(inMemoryCommLogs, params);
  return filtered.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * 查询单条原始报文日志详情
 *
 * @param id 通讯日志 ID
 * @returns 完整报文详情
 */
export async function fetchCommLogDetailApi(id: string): Promise<CommLogRecord> {
  try {
    const detail = await http.get<CommLogRecord>(`/logs/comm/${id}`);
    if (detail && detail.id) {
      return detail;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
    // 离线降级兜底
  }

  const record = inMemoryCommLogs.find((l) => l.id === id);
  if (!record) {
    throw new ApiError('通讯日志记录不存在', 404, 'COMM_LOG_NOT_FOUND', { id });
  }

  return JSON.parse(JSON.stringify(record));
}

/**
 * 导出通讯日志为符合 RFC 4180 及 UTF-8 BOM 标准的 CSV Blob 文件
 *
 * @param params 检索条件
 * @returns 二进制 Blob 数据流
 */
export async function exportCommLogsCsvApi(params?: CommLogQueryParams): Promise<Blob> {
  try {
    // 优先调用后端标准导出网关
    const remoteBlob = await http.get<Blob>('/logs/comm/export', params);
    if (remoteBlob instanceof Blob) {
      return remoteBlob;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
    // 离线降级生成
  }

  const filteredLogs = filterCommLogs(inMemoryCommLogs, params);
  const csvText = generateCommLogsCsv(filteredLogs);
  return new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
}
