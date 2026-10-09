/**
 * RBAC 细粒度权限代码枚举
 */
export enum Permission {
  VEHICLE_READ = 'vehicle:read',
  VEHICLE_WRITE = 'vehicle:write',
  VEHICLE_CONTROL = 'vehicle:control',
  DEVICE_READ = 'device:read',
  DEVICE_WRITE = 'device:write',
  USER_MANAGE = 'user:manage',
  TENANT_MANAGE = 'tenant:manage',
  AUDIT_READ = 'audit:read',
}

/**
 * 预设角色代码
 */
export enum RoleCode {
  SUPER_ADMIN = 'SUPER_ADMIN',
  TENANT_ADMIN = 'TENANT_ADMIN',
  OPERATOR = 'OPERATOR',
  CAR_OWNER = 'CAR_OWNER',
}

export interface UserProfileDto {
  id: string;
  tenantId: string;
  username: string;
  roles: RoleCode[];
  permissions: Permission[];
}

export interface LoginRequestDto {
  username: string;
  password: string;
}

export interface LoginResponseDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // 秒数，如 900 (15分钟)
  user: UserProfileDto;
}

export interface RefreshTokenRequestDto {
  refreshToken: string;
}

export interface UserTokenPayload {
  sub: string; // userId
  tenantId: string;
  username: string;
  roles: RoleCode[];
  permissions: Permission[];
  jti?: string; // JWT unique ID
  iat?: number;
  exp?: number;
}
