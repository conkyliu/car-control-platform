import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

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

export interface TenantQuotaDto {
  tenantId: string;
  totalQuota: number;
  usedCount: number;
  remainingQuota: number;
  usagePercentage: number;
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

export interface TenantState {
  currentTenantId: string | null;
  currentOrgId: string | null;
  tenantList: TenantDto[];
  orgTree: OrgNodeDto[];

  setCurrentTenantId: (id: string | null) => void;
  setCurrentOrgId: (id: string | null) => void;
  setTenantList: (list: TenantDto[]) => void;
  setOrgTree: (tree: OrgNodeDto[]) => void;
  clearTenant: () => void;
}

const getSafeStorage = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
    return (globalThis as any).localStorage;
  }
  return {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
};

export const useTenantStore = create<TenantState>()(
  persist(
    (set) => ({
      currentTenantId: null,
      currentOrgId: null,
      tenantList: [],
      orgTree: [],

      setCurrentTenantId: (id) => set({ currentTenantId: id }),
      setCurrentOrgId: (id) => set({ currentOrgId: id }),
      setTenantList: (tenantList) => set({ tenantList }),
      setOrgTree: (orgTree) => set({ orgTree }),
      clearTenant: () =>
        set({
          currentTenantId: null,
          currentOrgId: null,
          tenantList: [],
          orgTree: [],
        }),
    }),
    {
      name: 'car_control_tenant_storage',
      storage: createJSONStorage(getSafeStorage),
      partialize: (state) => ({
        currentTenantId: state.currentTenantId,
        currentOrgId: state.currentOrgId,
      }),
    }
  )
);
