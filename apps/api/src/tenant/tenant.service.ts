import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Tenant } from '@car-control/domain-types';

@Injectable()
export class TenantService {
  private tenants: Map<string, Tenant> = new Map();

  constructor() {
    this.createTenant({
      id: 'TENANT_DEFAULT',
      name: '示范网约车集团',
      code: 'DEMO_FLEET',
      quotaDeviceCount: 1000,
    });

    this.createTenant({
      id: 'TENANT_B',
      name: '快捷汽车租赁',
      code: 'RENTAL_B',
      quotaDeviceCount: 50,
    });
  }

  createTenant(input: {
    id?: string;
    name: string;
    code: string;
    quotaDeviceCount: number;
  }): Tenant {
    const id = input.id || `tnt_${Date.now()}`;
    const tenant: Tenant = {
      id,
      name: input.name,
      code: input.code,
      status: 'ACTIVE',
      quotaDeviceCount: input.quotaDeviceCount,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.tenants.set(id, tenant);
    return tenant;
  }

  getTenant(id: string): Tenant {
    const tenant = this.tenants.get(id);
    if (!tenant) {
      throw new NotFoundException(`Tenant with id ${id} not found`);
    }
    return tenant;
  }

  /**
   * 租户设备配额硬约束检查
   */
  assertQuotaAvailable(tenantId: string, currentDeviceCount: number): void {
    const tenant = this.getTenant(tenantId);
    if (currentDeviceCount >= tenant.quotaDeviceCount) {
      throw new BadRequestException(
        `[Quota Exceeded] Tenant ${tenant.name} has reached max quota of ${tenant.quotaDeviceCount} devices`
      );
    }
  }
}
