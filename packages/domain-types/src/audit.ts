export interface AuditLog {
  id: string;
  tenantId: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  traceId: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: Date;
}
