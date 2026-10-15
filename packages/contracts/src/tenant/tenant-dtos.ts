/**
 * 租户数据传输对象
 */
export interface TenantDto {
  id: string;
  name: string;
  code: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
  quotaDeviceCount: number;
  usedDeviceCount?: number;
  quotaVehicleCount?: number;
  usedVehicleCount?: number;
  creditCode?: string;
  contactPerson?: string;
  contactPhone?: string;
  description?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

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
  id?: string;
}

export interface TenantQuotaDto {
  tenantId: string;
  totalQuota: number;
  usedCount: number;
  remainingQuota: number;
  usagePercentage: number;
  vehicleQuota?: number;
  vehicleUsedCount?: number;
}

export interface AdjustTenantQuotaInput {
  quotaDeviceCount: number;
  quotaVehicleCount?: number;
}

export interface UpdateTenantStatusInput {
  status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED' | string;
}

export interface OrgNodeDto {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  parentId?: string | null;
  sortOrder?: number;
  leader?: string;
  phone?: string;
  status?: 'ACTIVE' | 'DISABLED';
  description?: string;
  deviceCount?: number;
  vehicleCount?: number;
  userCount?: number;
  children?: OrgNodeDto[];
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
  id?: string;
}
