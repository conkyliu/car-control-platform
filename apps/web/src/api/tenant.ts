import { http } from './client.ts';
import type { TenantDto, TenantQuotaDto, OrgNodeDto } from '../store/useTenantStore.ts';

export interface CreateTenantInput {
  name: string;
  code: string;
  quotaDeviceCount: number;
  quotaVehicleCount?: number;
  creditCode?: string;
  contactPerson?: string;
  contactPhone?: string;
  adminUsername?: string;
  adminPassword?: string;
  description?: string;
}

export interface CreateOrgInput {
  tenantId: string;
  name: string;
  code: string;
  parentId?: string | null;
  sortOrder?: number;
  leader?: string;
  phone?: string;
  description?: string;
  status?: 'ACTIVE' | 'DISABLED';
}

/**
 * 获取租户列表 API
 */
export async function getTenantsApi(): Promise<TenantDto[]> {
  return http.get<TenantDto[]>('/tenants');
}

/**
 * 创建新租户 API
 */
export async function createTenantApi(data: CreateTenantInput): Promise<TenantDto> {
  return http.post<TenantDto>('/tenants', data);
}

/**
 * 更新租户信息 API
 */
export async function updateTenantApi(tenantId: string, data: Partial<CreateTenantInput>): Promise<TenantDto> {
  return http.put<TenantDto>(`/tenants/${encodeURIComponent(tenantId)}`, data);
}

/**
 * 获取指定租户设备配额与使用详情 API
 */
export async function getTenantQuotaApi(tenantId: string): Promise<TenantQuotaDto> {
  return http.get<TenantQuotaDto>(`/tenants/${encodeURIComponent(tenantId)}/quota`);
}

/**
 * 调整租户配额（设备上限与车辆上限）API
 */
export async function adjustTenantQuotaApi(
  tenantId: string,
  quota: { quotaDeviceCount: number; quotaVehicleCount?: number }
): Promise<TenantQuotaDto> {
  return http.put<TenantQuotaDto>(`/tenants/${encodeURIComponent(tenantId)}/quota`, quota);
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

/**
 * 更新机构节点 API
 */
export async function updateOrgApi(orgId: string, data: Partial<CreateOrgInput>): Promise<OrgNodeDto> {
  return http.put<OrgNodeDto>(`/orgs/${encodeURIComponent(orgId)}`, data);
}

/**
 * 删除机构节点 API
 */
export async function deleteOrgApi(orgId: string): Promise<void> {
  return http.delete<void>(`/orgs/${encodeURIComponent(orgId)}`);
}
