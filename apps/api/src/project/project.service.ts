import { Injectable, NotFoundException } from '@nestjs/common';
import { Project } from '@car-control/domain-types';
import { TenantContext } from '@car-control/database';

@Injectable()
export class ProjectService {
  private projects: Map<string, Project> = new Map();

  constructor() {
    this.createProject({
      id: 'proj_default_01',
      tenantId: 'TENANT_DEFAULT',
      name: '鹏程网约车一期',
      code: 'PC_FLEET_01',
    });

    this.createProject({
      id: 'proj_b_01',
      tenantId: 'TENANT_B',
      name: '快捷租赁华南专案',
      code: 'RENTAL_SOUTH_01',
    });
  }

  createProject(input: { id?: string; tenantId: string; name: string; code: string }): Project {
    const id = input.id || `proj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const proj: Project = {
      id,
      tenantId: input.tenantId,
      name: input.name,
      code: input.code,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.projects.set(id, proj);
    return proj;
  }

  getProject(id: string): Project {
    const tenantId = TenantContext.getTenantId();
    const proj = this.projects.get(id);
    if (!proj || proj.tenantId !== tenantId) {
      throw new NotFoundException(`Project with id ${id} not found in current tenant`);
    }
    return proj;
  }

  listProjects(): Project[] {
    const tenantId = TenantContext.getTenantId();
    return Array.from(this.projects.values()).filter((p) => p.tenantId === tenantId);
  }
}
