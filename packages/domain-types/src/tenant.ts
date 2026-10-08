export interface Tenant {
  id: string;
  name: string;
  code: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
  quotaDeviceCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantContextData {
  tenantId: string;
  userId: string;
  roles: string[];
  projectId?: string;
}
