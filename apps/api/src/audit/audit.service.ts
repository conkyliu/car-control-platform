import { Injectable } from '@nestjs/common';
import { AuditLog } from '@car-control/domain-types';
import { TenantContext } from '@car-control/database';

@Injectable()
export class AuditService {
  private auditLogs: AuditLog[] = [];

  logAction(entry: {
    tenantId: string;
    userId: string;
    action: string;
    resourceType: string;
    resourceId: string;
    traceId?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
  }): AuditLog {
    const log: AuditLog = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      tenantId: entry.tenantId,
      userId: entry.userId,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      traceId: entry.traceId || `trace_${Date.now()}`,
      details: entry.details,
      ipAddress: entry.ipAddress,
      createdAt: new Date(),
    };

    this.auditLogs.push(log);
    return log;
  }

  /**
   * 查询当前租户名下的操作审计流水
   */
  getTenantAuditLogs(tenantId?: string): AuditLog[] {
    const effectiveTenantId = tenantId || TenantContext.getTenantId();
    return this.auditLogs.filter((log) => log.tenantId === effectiveTenantId);
  }
}
