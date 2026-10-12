import { http } from './client.ts';

export type RoleDataScope = 'ALL' | 'ORG_AND_CHILDREN' | 'ORG_ONLY' | 'SELF_ONLY';

export interface RoleDto {
  id: string;
  tenantId?: string;
  name: string;
  code: string;
  description?: string;
  dataScope: RoleDataScope;
  permissions: string[];
  userCount?: number;
  isSystem?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateRoleInput {
  name: string;
  code: string;
  description?: string;
  dataScope?: RoleDataScope;
  permissions?: string[];
}

export interface UpdateRoleInput {
  name?: string;
  description?: string;
  dataScope?: RoleDataScope;
  permissions?: string[];
}

export interface PermissionTreeNode {
  key: string;
  title: string;
  code?: string;
  type?: 'cluster' | 'menu' | 'action';
  description?: string;
  disabled?: boolean;
  children?: PermissionTreeNode[];
}

/**
 * 获取角色列表 API
 */
export async function fetchRolesApi(): Promise<RoleDto[]> {
  return http.get<RoleDto[]>('/roles');
}

/**
 * 新建角色 API
 */
export async function createRoleApi(data: CreateRoleInput): Promise<RoleDto> {
  return http.post<RoleDto>('/roles', data);
}

/**
 * 修改角色信息 API
 */
export async function updateRoleApi(id: string, data: UpdateRoleInput): Promise<RoleDto> {
  return http.put<RoleDto>(`/roles/${encodeURIComponent(id)}`, data);
}

/**
 * 删除角色 API
 */
export async function deleteRoleApi(id: string): Promise<void> {
  return http.delete<void>(`/roles/${encodeURIComponent(id)}`);
}

/**
 * 更新角色细粒度权限列表与数据权限范围 API
 */
export async function updateRolePermissionsApi(
  id: string,
  permissions: string[],
  dataScope: RoleDataScope
): Promise<RoleDto> {
  return http.put<RoleDto>(`/roles/${encodeURIComponent(id)}/permissions`, {
    permissions,
    dataScope,
  });
}

/**
 * 获取系统全量功能与操作权限树 API
 */
export async function fetchPermissionTreeApi(): Promise<PermissionTreeNode[]> {
  return http.get<PermissionTreeNode[]>('/permissions/tree');
}
