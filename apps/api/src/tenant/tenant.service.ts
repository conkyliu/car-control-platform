import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import {
  TenantDto,
  CreateTenantInput,
  TenantQuotaDto,
  OrgNodeDto,
  CreateOrgInput,
} from '@car-control/contracts';

@Injectable()
export class TenantService {
  private tenants: Map<string, TenantDto> = new Map();
  private orgs: Map<string, OrgNodeDto> = new Map();

  constructor() {
    this.seedTenants();
    this.seedOrgs();
  }

  private seedTenants(): void {
    this.createTenant({
      id: 'TENANT_DEFAULT',
      name: '示范网约车集团',
      code: 'DEMO_FLEET',
      quotaDeviceCount: 1000,
      quotaVehicleCount: 1000,
      creditCode: '91110108MA01TEST01',
      contactPerson: '张总',
      contactPhone: '13800138000',
      description: '全国示范性智能网约车与车队运营集团',
    });

    this.createTenant({
      id: 'TENANT_B',
      name: '快捷汽车租赁',
      code: 'RENTAL_B',
      quotaDeviceCount: 50,
      quotaVehicleCount: 50,
      creditCode: '91110108MA01TEST02',
      contactPerson: '李总',
      contactPhone: '13900139000',
      description: '区域快捷汽车租赁自驾服务',
    });
  }

  private seedOrgs(): void {
    // 根节点：总部
    const rootOrg: OrgNodeDto = {
      id: 'org_root',
      tenantId: 'TENANT_DEFAULT',
      name: '示范网约车集团总部',
      code: 'HQ',
      parentId: null,
      sortOrder: 1,
      leader: '张总',
      phone: '13800138000',
      status: 'ACTIVE',
      description: '集团总指挥中枢',
      deviceCount: 850,
      vehicleCount: 850,
      userCount: 45,
    };
    this.orgs.set(rootOrg.id, rootOrg);

    // 子节点：运营中心
    const opsOrg: OrgNodeDto = {
      id: 'org_ops',
      tenantId: 'TENANT_DEFAULT',
      name: '运营中心',
      code: 'OPS',
      parentId: 'org_root',
      sortOrder: 1,
      leader: '李经理',
      phone: '13800138001',
      status: 'ACTIVE',
      description: '负责日常车队调度与运营指标把控',
      deviceCount: 500,
      vehicleCount: 500,
      userCount: 25,
    };
    this.orgs.set(opsOrg.id, opsOrg);

    // 子节点：技术运维部
    const techOrg: OrgNodeDto = {
      id: 'org_tech',
      tenantId: 'TENANT_DEFAULT',
      name: '技术运维部',
      code: 'TECH',
      parentId: 'org_root',
      sortOrder: 2,
      leader: '王工',
      phone: '13800138002',
      status: 'ACTIVE',
      description: '负责车机 T-Box 终端接入、协议调试与现场运维',
      deviceCount: 150,
      vehicleCount: 150,
      userCount: 10,
    };
    this.orgs.set(techOrg.id, techOrg);

    // 子节点：华东分公司
    const branchEast: OrgNodeDto = {
      id: 'org_branch_east',
      tenantId: 'TENANT_DEFAULT',
      name: '华东分公司',
      code: 'BRANCH_EAST',
      parentId: 'org_root',
      sortOrder: 3,
      leader: '陈总监',
      phone: '13800138003',
      status: 'ACTIVE',
      description: '华东大区业务运营部',
      deviceCount: 200,
      vehicleCount: 200,
      userCount: 10,
    };
    this.orgs.set(branchEast.id, branchEast);
  }

  listTenants(): TenantDto[] {
    return Array.from(this.tenants.values());
  }

  getTenant(id: string): TenantDto {
    const tenant = this.tenants.get(id);
    if (!tenant) {
      throw new NotFoundException(`Tenant with id ${id} not found`);
    }
    return tenant;
  }

  createTenant(input: CreateTenantInput): TenantDto {
    for (const existing of this.tenants.values()) {
      if (existing.code === input.code) {
        throw new ConflictException(`Tenant with code ${input.code} already exists`);
      }
    }

    const id = input.id || `tnt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const tenant: TenantDto = {
      id,
      name: input.name,
      code: input.code,
      status: 'ACTIVE',
      quotaDeviceCount: input.quotaDeviceCount,
      usedDeviceCount: 0,
      quotaVehicleCount: input.quotaVehicleCount ?? input.quotaDeviceCount,
      usedVehicleCount: 0,
      creditCode: input.creditCode,
      contactPerson: input.contactPerson,
      contactPhone: input.contactPhone,
      description: input.description,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.tenants.set(id, tenant);
    return tenant;
  }

  updateTenant(id: string, input: Partial<CreateTenantInput>): TenantDto {
    const tenant = this.getTenant(id);

    if (input.code && input.code !== tenant.code) {
      for (const existing of this.tenants.values()) {
        if (existing.id !== id && existing.code === input.code) {
          throw new ConflictException(`Tenant with code ${input.code} already exists`);
        }
      }
      tenant.code = input.code;
    }

    if (input.name !== undefined) tenant.name = input.name;
    if (input.quotaDeviceCount !== undefined) tenant.quotaDeviceCount = input.quotaDeviceCount;
    if (input.quotaVehicleCount !== undefined) tenant.quotaVehicleCount = input.quotaVehicleCount;
    if (input.creditCode !== undefined) tenant.creditCode = input.creditCode;
    if (input.contactPerson !== undefined) tenant.contactPerson = input.contactPerson;
    if (input.contactPhone !== undefined) tenant.contactPhone = input.contactPhone;
    if (input.description !== undefined) tenant.description = input.description;
    tenant.updatedAt = new Date();

    return tenant;
  }

  getTenantQuota(id: string): TenantQuotaDto {
    const tenant = this.getTenant(id);
    const totalQuota = tenant.quotaDeviceCount;
    const usedCount = tenant.usedDeviceCount ?? 0;
    const remainingQuota = Math.max(0, totalQuota - usedCount);
    const usagePercentage = totalQuota > 0 ? Number(((usedCount / totalQuota) * 100).toFixed(2)) : 0;

    return {
      tenantId: tenant.id,
      totalQuota,
      usedCount,
      remainingQuota,
      usagePercentage,
      vehicleQuota: tenant.quotaVehicleCount ?? totalQuota,
      vehicleUsedCount: tenant.usedVehicleCount ?? 0,
    };
  }

  adjustTenantQuota(
    id: string,
    quota: { quotaDeviceCount: number; quotaVehicleCount?: number }
  ): TenantQuotaDto {
    const tenant = this.getTenant(id);
    if (quota.quotaDeviceCount < 0) {
      throw new BadRequestException('Quota cannot be negative');
    }
    if (quota.quotaVehicleCount !== undefined && quota.quotaVehicleCount < 0) {
      throw new BadRequestException('Quota cannot be negative');
    }

    tenant.quotaDeviceCount = quota.quotaDeviceCount;
    if (quota.quotaVehicleCount !== undefined) {
      tenant.quotaVehicleCount = quota.quotaVehicleCount;
    }
    tenant.updatedAt = new Date();

    return this.getTenantQuota(id);
  }

  updateTenantStatus(id: string, status: string): { success: boolean } {
    const tenant = this.getTenant(id);
    const validStatuses = ['ACTIVE', 'SUSPENDED', 'DISABLED'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException(`Invalid tenant status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
    }

    tenant.status = status as 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
    tenant.updatedAt = new Date();
    return { success: true };
  }

  assertQuotaAvailable(tenantId: string, currentDeviceCount: number): void {
    const tenant = this.getTenant(tenantId);
    if (currentDeviceCount >= tenant.quotaDeviceCount) {
      throw new BadRequestException(
        `[Quota Exceeded] Tenant ${tenant.name} has reached max quota of ${tenant.quotaDeviceCount} devices`
      );
    }
  }

  // --- Org Tree Methods ---

  getOrgTree(tenantId?: string): OrgNodeDto[] {
    const targetTenantId = tenantId || 'TENANT_DEFAULT';
    const allOrgNodes = Array.from(this.orgs.values()).filter(
      (org) => org.tenantId === targetTenantId
    );

    // Build children mapping
    const childrenMap = new Map<string, OrgNodeDto[]>();
    const roots: OrgNodeDto[] = [];

    // Clone all nodes so we don't mutate stored nodes directly
    const clonedNodes: OrgNodeDto[] = allOrgNodes.map((n) => ({
      ...n,
      children: [],
    }));

    for (const node of clonedNodes) {
      if (!node.parentId) {
        roots.push(node);
      } else {
        const list = childrenMap.get(node.parentId) || [];
        list.push(node);
        childrenMap.set(node.parentId, list);
      }
    }

    const attachChildren = (parent: OrgNodeDto) => {
      const children = childrenMap.get(parent.id) || [];
      children.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      parent.children = children;
      for (const child of children) {
        attachChildren(child);
      }
    };

    roots.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    for (const root of roots) {
      attachChildren(root);
    }

    return roots;
  }

  createOrg(input: CreateOrgInput): OrgNodeDto {
    if (input.parentId) {
      const parent = this.orgs.get(input.parentId);
      if (!parent) {
        throw new NotFoundException(`Parent org with id ${input.parentId} not found`);
      }
    }

    const id = input.id || `org_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const orgNode: OrgNodeDto = {
      id,
      tenantId: input.tenantId,
      name: input.name,
      code: input.code,
      parentId: input.parentId || null,
      sortOrder: input.sortOrder ?? 0,
      leader: input.leader,
      phone: input.phone,
      description: input.description,
      status: input.status || 'ACTIVE',
      deviceCount: 0,
      vehicleCount: 0,
      userCount: 0,
    };

    this.orgs.set(id, orgNode);
    return { ...orgNode };
  }

  updateOrg(orgId: string, input: Partial<CreateOrgInput>): OrgNodeDto {
    const org = this.orgs.get(orgId);
    if (!org) {
      throw new NotFoundException(`Org with id ${orgId} not found`);
    }

    if (input.parentId !== undefined) {
      if (input.parentId === orgId) {
        throw new BadRequestException('Organization cannot be its own parent');
      }
      if (input.parentId !== null) {
        const parent = this.orgs.get(input.parentId);
        if (!parent) {
          throw new NotFoundException(`Parent org with id ${input.parentId} not found`);
        }
      }
      org.parentId = input.parentId;
    }

    if (input.name !== undefined) org.name = input.name;
    if (input.code !== undefined) org.code = input.code;
    if (input.sortOrder !== undefined) org.sortOrder = input.sortOrder;
    if (input.leader !== undefined) org.leader = input.leader;
    if (input.phone !== undefined) org.phone = input.phone;
    if (input.description !== undefined) org.description = input.description;
    if (input.status !== undefined) org.status = input.status;

    return { ...org };
  }

  deleteOrg(orgId: string): { success: boolean } {
    const org = this.orgs.get(orgId);
    if (!org) {
      throw new NotFoundException(`Org with id ${orgId} not found`);
    }

    // Check if has children
    for (const other of this.orgs.values()) {
      if (other.parentId === orgId) {
        throw new BadRequestException(`Cannot delete organization ${org.name} because it contains child organizations`);
      }
    }

    this.orgs.delete(orgId);
    return { success: true };
  }
}
