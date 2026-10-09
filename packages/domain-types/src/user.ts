import { RoleCode, Permission } from '@car-control/contracts';

export interface User {
  id: string;
  tenantId: string;
  organizationId?: string;
  username: string;
  passwordHash: string;
  email?: string;
  phone?: string;
  status: 'ACTIVE' | 'DISABLED';
  roles: RoleCode[];
  permissions: Permission[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Organization {
  id: string;
  tenantId: string;
  name: string;
  parentId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  createdAt: Date;
  updatedAt: Date;
}
