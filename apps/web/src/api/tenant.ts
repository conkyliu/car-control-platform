import { http } from './client.ts';
import type { TenantDto, TenantQuotaDto, OrgNodeDto } from '../store/useTenantStore.ts';

export interface CreateTenantInput {
  name: string;
  code: string;
  quotaDeviceCount: number;
  description?: string;
}

export interface CreateOrgInput {
  tenantId: string;
  name: string;
  code: string;
  parentId?: string | null;
  sortOrder?: number;
}

/**
 * 获取租户列表 API
 */
export async function getTenantsApi(): Promise<TenantDto[]> {
  return http.get<TenantDto[]>('/tenants');
}

/**
 * 获取指定租户设备配额与使用详情 API
 */
export async function getTenantQuotaApi(tenantId: string): Promise<TenantQuotaDto> {
  return http.get<TenantQuotaDto>(`/tenants/${encodeURIComponent(tenantId)}/quota`);
}

/**
 * 更新租户运行状态（启用/停用/冻结）API
 */
export async function updateTenantStatusApi(tenantId: string, status: string): Promise<void> {
  return http.patch<void>(`/tenants/${encodeURIComponent(tenantId)}/status`, { status });
}

/**
 * 获取机构树形拓扑结构 API
 */
export async function getOrgTreeApi(tenantId?: string): Promise<OrgNodeDto[]> {
  const params = tenantId ? { tenantId } : undefined;
  return http.get<OrgNodeDto[]>('/orgs/tree', params);
}

/**
 * 创建新机构节点 API
 */
export async function createOrgApi(data: CreateOrgInput): Promise<OrgNodeDto> {
  return http.post<OrgNodeDto>('/orgs', data);
}
