import { http } from './client.ts';

export interface UserDto {
  id: string;
  tenantId?: string;
  username: string;
  realName: string;
  phone?: string;
  email?: string;
  orgId?: string;
  orgName?: string;
  roles: string[];
  status: 'ACTIVE' | 'DISABLED';
  lastLoginAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserQueryParams {
  keyword?: string;
  orgId?: string;
  status?: string;
  role?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateUserInput {
  username: string;
  realName: string;
  phone: string;
  email?: string;
  orgId?: string;
  orgName?: string;
  roles: string[];
  password?: string;
  status?: 'ACTIVE' | 'DISABLED';
}

export interface UpdateUserInput {
  realName?: string;
  phone?: string;
  email?: string;
  orgId?: string;
  orgName?: string;
  roles?: string[];
  status?: 'ACTIVE' | 'DISABLED';
}

/**
 * 拉取租户用户列表 API
 */
export async function fetchUsersApi(params?: UserQueryParams): Promise<UserDto[]> {
  return http.get<UserDto[]>('/users', params);
}

/**
 * 创建新用户账号 API
 */
export async function createUserApi(data: CreateUserInput): Promise<UserDto> {
  return http.post<UserDto>('/users', data);
}

/**
 * 更新用户档案 API
 */
export async function updateUserApi(id: string, data: UpdateUserInput): Promise<UserDto> {
  return http.put<UserDto>(`/users/${encodeURIComponent(id)}`, data);
}

/**
 * 删除用户账号 API
 */
export async function deleteUserApi(id: string): Promise<void> {
  return http.delete<void>(`/users/${encodeURIComponent(id)}`);
}

/**
 * 重置用户密码 API
 */
export async function resetUserPasswordApi(id: string, newPassword: string): Promise<void> {
  return http.post<void>(`/users/${encodeURIComponent(id)}/reset-password`, { password: newPassword });
}

/**
 * 切换用户启停状态 API
 */
export async function updateUserStatusApi(id: string, status: 'ACTIVE' | 'DISABLED'): Promise<void> {
  return http.patch<void>(`/users/${encodeURIComponent(id)}/status`, { status });
}
