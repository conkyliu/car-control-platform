import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import {
  ProjectDto,
  CreateProjectInput,
  UpdateProjectInput,
  ProjectStatus,
} from '@car-control/contracts';
import { DeviceOnlineStatus } from '@car-control/domain-types';
import {
  DeviceRepository,
  VehicleRepository,
  TenantContext,
} from '@car-control/database';

interface ProjectRecord extends ProjectDto {
  tenantId: string;
}

@Injectable()
export class ProjectService {
  private projects: Map<string, ProjectRecord> = new Map();

  constructor(
    @Optional() private readonly deviceRepo?: DeviceRepository,
    @Optional() private readonly vehicleRepo?: VehicleRepository
  ) {
    this.seedProjects();
  }

  private seedProjects(): void {
    this.seedProject({
      id: 'proj_default_01',
      tenantId: 'TENANT_DEFAULT',
      name: '鹏程网约车一期',
      code: 'PC_FLEET_01',
      orgName: '华南智慧车联网运营部',
      contactName: '陈伟强',
      contactPhone: '13812345678',
      description: '面向大湾区特区的高频车联网车队运营',
      status: 'ACTIVE',
      createdAt: new Date('2026-01-01T10:00:00Z'),
      updatedAt: new Date('2026-01-01T10:00:00Z'),
    });

    this.seedProject({
      id: 'proj_b_01',
      tenantId: 'TENANT_B',
      name: '快捷租赁华南专案',
      code: 'RENTAL_SOUTH_01',
      orgName: '华南网约车运营部',
      contactName: '李广成',
      contactPhone: '13922334455',
      description: '穗港客运网约出租合规车辆运营项目',
      status: 'ACTIVE',
      createdAt: new Date('2026-02-01T10:00:00Z'),
      updatedAt: new Date('2026-02-01T10:00:00Z'),
    });
  }

  private seedProject(record: ProjectRecord): void {
    this.projects.set(record.id, record);
  }

  private enrichWithCounts(proj: ProjectRecord): ProjectDto {
    const tenantId = proj.tenantId;
    let deviceCount = 0;
    let onlineDeviceCount = 0;
    let vehicleCount = 0;

    if (this.deviceRepo && (this.deviceRepo as any).items) {
      for (const dev of (this.deviceRepo as any).items.values()) {
        if (dev.tenantId === tenantId && dev.projectId === proj.id) {
          deviceCount++;
          if (dev.onlineStatus === DeviceOnlineStatus.ONLINE) {
            onlineDeviceCount++;
          }
        }
      }
    }

    if (this.vehicleRepo && (this.vehicleRepo as any).items) {
      for (const veh of (this.vehicleRepo as any).items.values()) {
        if (veh.tenantId === tenantId && veh.projectId === proj.id) {
          vehicleCount++;
        }
      }
    }

    return {
      ...proj,
      deviceCount,
      onlineDeviceCount,
      vehicleCount,
    };
  }

  createProject(
    input: CreateProjectInput & { id?: string; tenantId?: string }
  ): ProjectDto {
    const tenantId = input.tenantId || TenantContext.getTenantId();

    if (!input.name || !input.name.trim()) {
      throw new BadRequestException('Project name is required');
    }

    if (!input.code) {
      throw new BadRequestException('项目代号不能为空');
    }

    const code = input.code.trim().toUpperCase();
    if (!/^[A-Z0-9_]{3,20}$/.test(code)) {
      throw new BadRequestException(
        '项目代号不符合规范，请输入 3~20 位大写英文字母、数字或下划线'
      );
    }

    // Code uniqueness per tenant
    const existing = Array.from(this.projects.values()).find(
      (p) => p.tenantId === tenantId && p.code === code
    );
    if (existing) {
      throw new ConflictException(
        `Project with code ${code} already exists in current tenant`
      );
    }

    const id =
      input.id ||
      `proj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date();

    const record: ProjectRecord = {
      id,
      tenantId,
      name: input.name.trim(),
      code,
      orgName: input.orgName?.trim(),
      contactName: input.contactName?.trim(),
      contactPhone: input.contactPhone?.trim(),
      description: input.description?.trim(),
      status: input.status || 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };

    this.projects.set(id, record);
    return this.enrichWithCounts(record);
  }

  getProject(id: string): ProjectDto {
    const tenantId = TenantContext.getTenantId();
    const proj = this.projects.get(id);
    if (!proj || proj.tenantId !== tenantId) {
      throw new NotFoundException(
        `Project with id ${id} not found in current tenant`
      );
    }
    return this.enrichWithCounts(proj);
  }

  listProjects(): ProjectDto[] {
    const tenantId = TenantContext.getTenantId();
    return Array.from(this.projects.values())
      .filter((p) => p.tenantId === tenantId)
      .map((p) => this.enrichWithCounts(p));
  }

  updateProject(id: string, input: UpdateProjectInput): ProjectDto {
    const tenantId = TenantContext.getTenantId();
    const existing = this.projects.get(id);
    if (!existing || existing.tenantId !== tenantId) {
      throw new NotFoundException(
        `Project with id ${id} not found in current tenant`
      );
    }

    if (input.code !== undefined) {
      const upper = input.code.trim().toUpperCase();
      if (!/^[A-Z0-9_]{3,20}$/.test(upper)) {
        throw new BadRequestException(
          '项目代号不符合规范，请输入 3~20 位大写英文字母、数字或下划线'
        );
      }
      const duplicate = Array.from(this.projects.values()).find(
        (p) => p.tenantId === tenantId && p.code === upper && p.id !== id
      );
      if (duplicate) {
        throw new ConflictException(
          `Project with code ${upper} already exists in current tenant`
        );
      }
      existing.code = upper;
    }

    if (input.name !== undefined) {
      if (!input.name.trim()) {
        throw new BadRequestException('Project name cannot be empty');
      }
      existing.name = input.name.trim();
    }

    if (input.orgName !== undefined) {
      existing.orgName = input.orgName.trim();
    }
    if (input.contactName !== undefined) {
      existing.contactName = input.contactName.trim();
    }
    if (input.contactPhone !== undefined) {
      existing.contactPhone = input.contactPhone.trim();
    }
    if (input.description !== undefined) {
      existing.description = input.description.trim();
    }

    if (input.status !== undefined) {
      if (input.status === 'ARCHIVED') {
        const enriched = this.enrichWithCounts(existing);
        if ((enriched.onlineDeviceCount ?? 0) > 0) {
          throw new BadRequestException(
            `该项目【${enriched.name}】下存在 ${enriched.onlineDeviceCount} 台在线设备，禁止直接归档`
          );
        }
        if ((enriched.vehicleCount ?? 0) > 0) {
          throw new BadRequestException(
            `该项目【${enriched.name}】下仍有关联 ${enriched.vehicleCount} 辆车辆，禁止直接归档`
          );
        }
      }
      existing.status = input.status;
    }

    existing.updatedAt = new Date();
    return this.enrichWithCounts(existing);
  }

  updateProjectStatus(id: string, status: ProjectStatus): ProjectDto {
    const tenantId = TenantContext.getTenantId();
    const existing = this.projects.get(id);
    if (!existing || existing.tenantId !== tenantId) {
      throw new NotFoundException(
        `Project with id ${id} not found in current tenant`
      );
    }

    if (status === 'ARCHIVED') {
      const enriched = this.enrichWithCounts(existing);
      if ((enriched.onlineDeviceCount ?? 0) > 0) {
        throw new BadRequestException(
          `该项目【${enriched.name}】下存在 ${enriched.onlineDeviceCount} 台在线设备，禁止直接归档`
        );
      }
      if ((enriched.vehicleCount ?? 0) > 0) {
        throw new BadRequestException(
          `该项目【${enriched.name}】下仍有关联 ${enriched.vehicleCount} 辆车辆，禁止直接归档`
        );
      }
    }

    existing.status = status;
    existing.updatedAt = new Date();
    return this.enrichWithCounts(existing);
  }

  deleteProject(id: string): { success: boolean } {
    const tenantId = TenantContext.getTenantId();
    const existing = this.projects.get(id);
    if (!existing || existing.tenantId !== tenantId) {
      throw new NotFoundException(
        `Project with id ${id} not found in current tenant`
      );
    }

    const enriched = this.enrichWithCounts(existing);
    if ((enriched.deviceCount ?? 0) > 0 || (enriched.vehicleCount ?? 0) > 0) {
      throw new BadRequestException('该项目下仍有关联设备或车辆，禁止删除');
    }

    this.projects.delete(id);
    return { success: true };
  }

  allocateDevices(
    projectId: string,
    deviceIds: string[]
  ): { success: boolean } {
    // 1. Verify target project exists in current tenant
    this.getProject(projectId);

    if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
      return { success: true };
    }

    const tenantId = TenantContext.getTenantId();
    if (this.deviceRepo && (this.deviceRepo as any).items) {
      for (const devId of deviceIds) {
        const dev = (this.deviceRepo as any).items.get(devId);
        if (dev && dev.tenantId === tenantId) {
          dev.projectId = projectId;
          dev.updatedAt = new Date();
        }
      }
    }

    return { success: true };
  }
}
