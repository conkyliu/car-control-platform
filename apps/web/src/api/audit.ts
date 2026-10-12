import { http } from './client.ts';
import {
  type AuditLogDto,
  type AuditLogQueryParams,
  type AuditLogStatsDto,
  type AuditLogRiskLevel,
  type AuditLogStatus,
  isApiError,
  filterAuditLogs,
  generateAuditLogCsv,
  SEED_AUDIT_LOGS,
} from '../views/rbac/audit-core.ts';

export type {
  AuditLogDto,
  AuditLogQueryParams,
  AuditLogStatsDto,
  AuditLogRiskLevel,
  AuditLogStatus,
};

/**
 * 拉取操作审计日志列表 API
 * 遵循 isApiError 模式：真实服务端异常抛出中断并提示，离线/开发环境平滑降级至 SEED_AUDIT_LOGS
 */
export async function fetchAuditLogsApi(params?: AuditLogQueryParams): Promise<AuditLogDto[]> {
  try {
    const data = await http.get<AuditLogDto[]>('/audit-logs', params);
    if (Array.isArray(data)) {
      return data;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 服务未部署或离线时平滑降级至种子数据并应用本地过滤
  return filterAuditLogs(SEED_AUDIT_LOGS, params);
}

/**
 * 导出操作审计日志 API
 * 遵循 isApiError 模式：服务端支持导出时返回数据，否则客户端生成 UTF-8 BOM CSV
 */
export async function exportAuditLogsApi(params?: AuditLogQueryParams): Promise<Blob | string> {
  try {
    const remoteData = await http.get<string>('/audit-logs/export', params);
    if (typeof remoteData === 'string' && remoteData.length > 0) {
      if (typeof Blob !== 'undefined') {
        return new Blob([remoteData], { type: 'text/csv;charset=utf-8;' });
      }
      return remoteData;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线/降级模式下直接客户端生成规范 CSV
  const filtered = filterAuditLogs(SEED_AUDIT_LOGS, params);
  const csvContent = generateAuditLogCsv(filtered);

  if (typeof Blob !== 'undefined') {
    return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  }
  return csvContent;
}
