import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import {
  RoleCode,
  Permission,
  UserDto,
  UserQueryParams,
  CreateUserInput,
  UpdateUserInput,
  RoleDto,
  RoleDataScope,
  CreateRoleInput,
  UpdateRoleInput,
  PermissionTreeNode,
  DEFAULT_PERMISSION_TREE,
} from '@car-control/contracts';
import { User } from '@car-control/domain-types';
import { getPrismaClient } from '@car-control/database';
import { PasswordUtil } from '../auth/password.util.js';

interface UserRecord {
  id: string;
  tenantId: string;
  username: string;
  passwordHash: string;
  realName: string;
  phone?: string;
  email?: string;
  orgId?: string;
  organizationId?: string;
  orgName?: string;
  status: 'ACTIVE' | 'DISABLED';
  roles: RoleCode[];
  permissions: Permission[];
  lastLoginAt?: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class UserService implements OnModuleInit {
  private users: Map<string, UserRecord> = new Map();
  private usernameIndex: Map<string, string> = new Map(); // username -> id
  private roles: Map<string, RoleDto> = new Map();

  constructor() {
    this.seedRoles();
    this.seedUsers();
  }

  async onModuleInit(): Promise<void> {
    await this.syncFromDatabase();
  }

  /**
   * 从 PostgreSQL 数据库拉取并同步最新角色与用户数据
   */
  private async syncFromDatabase(): Promise<void> {
    try {
      const prisma = getPrismaClient();

      // 1. 同步数据库角色
      const dbRoles = await prisma.role.findMany({
        include: { rolePerms: true },
      });
      if (dbRoles && dbRoles.length > 0) {
        for (const dr of dbRoles) {
          const perms = dr.rolePerms.map((rp) => rp.permission);
          this.roles.set(dr.id, {
            id: dr.id,
            tenantId: dr.tenantId,
            name: dr.name,
            code: dr.code,
            description: dr.description || undefined,
            dataScope: (dr.dataScope as RoleDataScope) || 'ORG_ONLY',
            permissions: perms,
            isSystem: dr.code === RoleCode.SUPER_ADMIN,
            createdAt: dr.createdAt.toISOString(),
            updatedAt: dr.updatedAt.toISOString(),
          });
        }
      }

      // 2. 同步数据库用户
      const dbUsers = await prisma.user.findMany({
        include: {
          organization: true,
          userRoles: {
            include: {
              role: {
                include: { rolePerms: true },
              },
            },
          },
        },
      });

      if (dbUsers && dbUsers.length > 0) {
        for (const du of dbUsers) {
          const roles = du.userRoles.map((ur) => ur.role.code as RoleCode);
          const permSet = new Set<string>();
          for (const ur of du.userRoles) {
            ur.role.rolePerms.forEach((rp) => permSet.add(rp.permission as Permission));
          }
          const record: UserRecord = {
            id: du.id,
            tenantId: du.tenantId,
            username: du.username,
            passwordHash: du.passwordHash,
            realName: du.realName || du.username,
            phone: du.phone || undefined,
            email: du.email || undefined,
            orgId: du.organizationId || undefined,
            organizationId: du.organizationId || undefined,
            orgName: du.organization?.name || undefined,
            status: (du.status as 'ACTIVE' | 'DISABLED') || 'ACTIVE',
            roles,
            permissions: Array.from(permSet) as Permission[],
            createdAt: du.createdAt,
            updatedAt: du.updatedAt,
          };
          this.users.set(du.id, record);
          this.usernameIndex.set(du.username, du.id);
        }
      }
    } catch (err: any) {
      // 数据库暂未就绪或测试环境离线运行时，优雅回退到内存种子
    }
  }

  private seedRoles(): void {
    const roles: RoleDto[] = [
      {
        id: 'role_super_admin',
        tenantId: 'TENANT_DEFAULT',
        name: '超级管理员',
        code: RoleCode.SUPER_ADMIN,
        description: '系统最高权限超级管理员，拥有全局所有模块操作权与租户运维权',
        dataScope: 'ALL',
        permissions: [
          'dashboard:read',
          'dashboard:export',
          'tenant:manage',
          'tenant:create',
          'tenant:quota:adjust',
          'tenant:status:toggle',
          'org:manage',
          'org:create',
          'org:edit',
          'org:delete',
          'user:manage',
          'user:create',
          'user:edit',
          'user:delete',
          'user:password:reset',
          'user:status:toggle',
          'role:manage',
          'role:create',
          'role:edit',
          'role:delete',
          'role:permission:assign',
          'device:read',
          'device:write',
          'device:config:write',
          'device:reboot',
          'vehicle:read',
          'vehicle:write',
          'vehicle:bind',
          'vehicle:delete',
          'vehicle:control',
          'car:control:lock',
          'car:control:engine',
          'car:control:ac',
          'car:control:trunk',
          'car:control:search',
          'car:control:window',
          'car:control:seat',
          'telemetry:read',
          'telemetry:export',
          'geofence:read',
          'geofence:write',
          'geofence:delete',
          'alarm:read',
          'alarm:ack',
          'alarm:config',
          'ota:manage',
          'ota:firmware:upload',
          'ota:push:execute',
          'audit:read',
          'audit:export',
          'monitor:read',
        ],
        isSystem: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'role_tenant_admin',
        tenantId: 'TENANT_DEFAULT',
        name: '租户管理员',
        code: RoleCode.TENANT_ADMIN,
        description: '企业车队总管，负责车队人员、机构、车辆档案与远程车控权限',
        dataScope: 'ORG_AND_CHILDREN',
        permissions: [
          'dashboard:read',
          'dashboard:export',
          'org:manage',
          'org:create',
          'org:edit',
          'user:manage',
          'user:create',
          'user:edit',
          'user:password:reset',
          'user:status:toggle',
          'role:manage',
          'device:read',
          'device:write',
          'vehicle:read',
          'vehicle:write',
          'vehicle:bind',
          'vehicle:control',
          'car:control:lock',
          'car:control:ac',
          'car:control:search',
          'telemetry:read',
          'geofence:read',
          'alarm:read',
          'alarm:ack',
          'ota:manage',
          'audit:read',
        ],
        isSystem: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'role_operator',
        tenantId: 'TENANT_DEFAULT',
        name: '运维监控员',
        code: RoleCode.OPERATOR,
        description: '车队日常调度与监控人员，具备车辆监控、控制与设备查看权限',
        dataScope: 'ORG_ONLY',
        permissions: [
          'dashboard:read',
          'device:read',
          'vehicle:read',
          'vehicle:control',
          'car:control:lock',
          'car:control:ac',
          'car:control:trunk',
          'car:control:search',
          'car:control:window',
          'telemetry:read',
          'alarm:read',
          'alarm:ack',
        ],
        isSystem: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'role_car_owner',
        tenantId: 'TENANT_DEFAULT',
        name: '车主用户',
        code: RoleCode.CAR_OWNER,
        description: '终端车辆所有者，具备单车状态查询与受限控车权限',
        dataScope: 'SELF_ONLY',
        permissions: [
          'vehicle:read',
          'car:control:lock',
          'car:control:ac',
          'car:control:search',
          'telemetry:read',
        ],
        isSystem: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    for (const role of roles) {
      this.roles.set(role.id, role);
    }
  }

  private seedUsers(): void {
    this.createUserInternal({
      id: 'user_admin_01',
      tenantId: 'TENANT_DEFAULT',
      username: 'admin',
      password: 'AdminPassword123!',
      realName: '系统管理员',
      phone: '13800000001',
      email: 'admin@fleet.local',
      orgId: 'org_root',
      orgName: '示范网约车集团总部',
      roles: [RoleCode.TENANT_ADMIN],
      permissions: [
        Permission.VEHICLE_READ,
        Permission.VEHICLE_WRITE,
        Permission.VEHICLE_CONTROL,
        Permission.DEVICE_READ,
        Permission.DEVICE_WRITE,
        Permission.USER_MANAGE,
        Permission.TENANT_MANAGE,
        Permission.AUDIT_READ,
      ],
    });

    this.createUserInternal({
      id: 'user_operator_01',
      tenantId: 'TENANT_DEFAULT',
      username: 'operator',
      password: 'OperatorPassword123!',
      realName: '张调度员',
      phone: '13800000002',
      email: 'operator@fleet.local',
      orgId: 'org_ops',
      orgName: '综合运营中心',
      roles: [RoleCode.OPERATOR],
      permissions: [
        Permission.VEHICLE_READ,
        Permission.VEHICLE_CONTROL,
        Permission.DEVICE_READ,
      ],
    });

    this.createUserInternal({
      id: 'user_guest_01',
      tenantId: 'TENANT_B',
      username: 'guest_b',
      password: 'GuestPassword123!',
      realName: '李车主',
      phone: '13800000003',
      email: 'guest_b@rent.local',
      roles: [RoleCode.CAR_OWNER],
      permissions: [Permission.VEHICLE_READ],
    });
  }

  private createUserInternal(input: {
    id: string;
    tenantId: string;
    username: string;
    password?: string;
    realName?: string;
    phone?: string;
    email?: string;
    orgId?: string;
    orgName?: string;
    roles: RoleCode[];
    permissions: Permission[];
    status?: 'ACTIVE' | 'DISABLED';
  }): void {
    const now = new Date();
    const userRecord: UserRecord = {
      id: input.id,
      tenantId: input.tenantId,
      username: input.username,
      realName: input.realName || input.username,
      passwordHash: PasswordUtil.hashPassword(input.password || 'AdminPassword123!'),
      phone: input.phone,
      email: input.email,
      orgId: input.orgId,
      organizationId: input.orgId,
      orgName: input.orgName,
      status: input.status || 'ACTIVE',
      roles: input.roles,
      permissions: input.permissions,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(input.id, userRecord);
    this.usernameIndex.set(input.username, input.id);
  }

  private toUserDto(record: UserRecord): UserDto {
    return {
      id: record.id,
      tenantId: record.tenantId,
      username: record.username,
      realName: record.realName || record.username,
      phone: record.phone,
      email: record.email,
      orgId: record.orgId || record.organizationId,
      orgName: record.orgName,
      roles: record.roles as string[],
      status: record.status,
      lastLoginAt: record.lastLoginAt,
      createdAt: record.createdAt?.toISOString(),
      updatedAt: record.updatedAt?.toISOString(),
    };
  }

  // ==========================================
  // 用户管理接口 (Users)
  // ==========================================

  async listUsers(params: UserQueryParams = {}, tenantId?: string): Promise<UserDto[]> {
    await this.syncFromDatabase();
    let list = Array.from(this.users.values());

    // 租户过滤：非全局查询时严格隔离
    if (tenantId && tenantId !== 'TENANT_DEFAULT_ALL') {
      list = list.filter((u) => u.tenantId === tenantId);
    }

    // 关键词过滤
    if (params.keyword && params.keyword.trim()) {
      const kw = params.keyword.trim().toLowerCase();
      list = list.filter(
        (u) =>
          u.username.toLowerCase().includes(kw) ||
          (u.realName && u.realName.toLowerCase().includes(kw)) ||
          (u.phone && u.phone.includes(kw))
      );
    }

    // 机构过滤
    if (params.orgId && params.orgId !== 'ALL') {
      list = list.filter((u) => (u.orgId || u.organizationId) === params.orgId);
    }

    // 状态过滤
    if (params.status && params.status !== 'ALL') {
      list = list.filter((u) => u.status === params.status);
    }

    // 角色过滤
    if (params.role && params.role !== 'ALL') {
      list = list.filter((u) => (u.roles as string[]).includes(params.role!));
    }

    // 分页
    if (params.page && params.pageSize) {
      const page = Math.max(1, Number(params.page));
      const pageSize = Math.max(1, Number(params.pageSize));
      const start = (page - 1) * pageSize;
      list = list.slice(start, start + pageSize);
    }

    return list.map((u) => this.toUserDto(u));
  }

  async createUser(
    input: {
      id?: string;
      tenantId?: string;
      username: string;
      password?: string;
      realName?: string;
      phone?: string;
      email?: string;
      orgId?: string;
      organizationId?: string;
      orgName?: string;
      roles?: (RoleCode | string)[];
      permissions?: (Permission | string)[];
      status?: 'ACTIVE' | 'DISABLED';
    },
    tenantId?: string
  ): Promise<UserDto> {
    if (this.usernameIndex.has(input.username)) {
      throw new ConflictException(`Username ${input.username} already exists`);
    }

    const effectiveTenantId = tenantId || input.tenantId || 'TENANT_DEFAULT';
    const id = input.id || `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const password = input.password || 'AdminPassword123!';
    const passwordHash = PasswordUtil.hashPassword(password);
    const roles = (input.roles && input.roles.length > 0
      ? input.roles
      : [RoleCode.OPERATOR]) as RoleCode[];

    // 确定权限集合
    let permissions: Permission[] = [];
    if (input.permissions && input.permissions.length > 0) {
      permissions = input.permissions as Permission[];
    } else {
      const permSet = new Set<string>();
      for (const rCode of roles) {
        const foundRole = Array.from(this.roles.values()).find((r) => r.code === rCode);
        if (foundRole) {
          foundRole.permissions.forEach((p) => permSet.add(p));
        }
      }
      permissions = Array.from(permSet) as Permission[];
    }

    // 持久化到 PostgreSQL 数据库
    try {
      const prisma = getPrismaClient();
      const existingInDb = await prisma.user.findUnique({
        where: { username: input.username },
      });
      if (existingInDb) {
        throw new ConflictException(`Username ${input.username} already exists`);
      }

      // 验证有效租户
      let targetTenantId = effectiveTenantId;
      const tenantRecord = await prisma.tenant.findUnique({
        where: { id: effectiveTenantId },
      });
      if (!tenantRecord) {
        const defaultTenant = await prisma.tenant.findFirst();
        if (defaultTenant) {
          targetTenantId = defaultTenant.id;
        }
      }

      // 验证机构是否存在
      let targetOrgId: string | null = input.orgId || input.organizationId || null;
      if (targetOrgId) {
        const orgRecord = await prisma.organization.findUnique({
          where: { id: targetOrgId },
        });
        if (!orgRecord) {
          targetOrgId = null;
        }
      }

      // 插入 user 表
      await prisma.user.create({
        data: {
          id,
          tenantId: targetTenantId,
          organizationId: targetOrgId,
          username: input.username,
          realName: input.realName || input.username,
          passwordHash,
          phone: input.phone || null,
          email: input.email || null,
          status: input.status || 'ACTIVE',
        },
      });

      // 绑定 user_roles 表
      for (const rCode of roles) {
        const foundRole = await prisma.role.findFirst({
          where: { code: rCode },
        });
        if (foundRole) {
          await prisma.userRole.upsert({
            where: {
              userId_roleId: {
                userId: id,
                roleId: foundRole.id,
              },
            },
            update: {},
            create: {
              userId: id,
              roleId: foundRole.id,
            },
          });
        }
      }
    } catch (err: any) {
      if (err instanceof ConflictException) {
        throw err;
      }
      console.warn('[UserService] Database write skipped or failed:', err.message);
    }

    const now = new Date();
    const userRecord: UserRecord = {
      id,
      tenantId: effectiveTenantId,
      username: input.username,
      realName: input.realName || input.username,
      passwordHash,
      phone: input.phone,
      email: input.email,
      orgId: input.orgId || input.organizationId,
      organizationId: input.organizationId || input.orgId,
      orgName: input.orgName,
      status: input.status || 'ACTIVE',
      roles,
      permissions,
      createdAt: now,
      updatedAt: now,
    };

    this.users.set(id, userRecord);
    this.usernameIndex.set(input.username, id);

    return this.toUserDto(userRecord);
  }

  async updateUser(id: string, input: UpdateUserInput, tenantId?: string): Promise<UserDto> {
    const user = this.users.get(id);
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }

    if (tenantId && user.tenantId !== tenantId) {
      throw new NotFoundException(`User ${id} not found`);
    }

    // 同步到 PostgreSQL
    try {
      const prisma = getPrismaClient();
      const updateData: any = {};
      if (input.realName !== undefined) updateData.realName = input.realName;
      if (input.phone !== undefined) updateData.phone = input.phone;
      if (input.email !== undefined) updateData.email = input.email;
      if (input.status !== undefined) updateData.status = input.status;
      if (input.orgId !== undefined) {
        const orgRecord = await prisma.organization.findUnique({ where: { id: input.orgId } });
        updateData.organizationId = orgRecord ? input.orgId : null;
      }
      if (Object.keys(updateData).length > 0) {
        await prisma.user.update({
          where: { id },
          data: updateData,
        });
      }

      if (input.roles !== undefined) {
        await prisma.userRole.deleteMany({ where: { userId: id } });
        for (const rCode of input.roles) {
          const foundRole = await prisma.role.findFirst({ where: { code: rCode } });
          if (foundRole) {
            await prisma.userRole.create({
              data: { userId: id, roleId: foundRole.id },
            });
          }
        }
      }
    } catch (err: any) {
      console.warn('[UserService] Database update skipped or failed:', err.message);
    }

    if (input.realName !== undefined) user.realName = input.realName;
    if (input.phone !== undefined) user.phone = input.phone;
    if (input.email !== undefined) user.email = input.email;
    if (input.orgId !== undefined) {
      user.orgId = input.orgId;
      user.organizationId = input.orgId;
    }
    if (input.orgName !== undefined) user.orgName = input.orgName;
    if (input.status !== undefined) user.status = input.status;
    if (input.roles !== undefined) {
      user.roles = input.roles as RoleCode[];
      const permSet = new Set<string>();
      for (const rCode of user.roles) {
        const foundRole = Array.from(this.roles.values()).find((r) => r.code === rCode);
        if (foundRole) {
          foundRole.permissions.forEach((p) => permSet.add(p));
        }
      }
      user.permissions = Array.from(permSet) as Permission[];
    }

    user.updatedAt = new Date();
    return this.toUserDto(user);
  }

  async deleteUser(id: string, tenantId?: string): Promise<{ success: boolean }> {
    const user = this.users.get(id);
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }

    if (tenantId && user.tenantId !== tenantId) {
      throw new NotFoundException(`User ${id} not found`);
    }

    if (
      user.username === 'admin' ||
      user.id === 'user_admin_01' ||
      user.roles.includes(RoleCode.SUPER_ADMIN)
    ) {
      throw new BadRequestException('Cannot delete default system administrator');
    }

    try {
      const prisma = getPrismaClient();
      await prisma.userRole.deleteMany({ where: { userId: id } });
      await prisma.user.delete({ where: { id } });
    } catch (err: any) {
      console.warn('[UserService] Database delete skipped or failed:', err.message);
    }

    this.users.delete(id);
    this.usernameIndex.delete(user.username);
    return { success: true };
  }

  async resetPassword(id: string, newPassword?: string, tenantId?: string): Promise<{ success: boolean }> {
    const user = this.users.get(id);
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }

    if (tenantId && user.tenantId !== tenantId) {
      throw new NotFoundException(`User ${id} not found`);
    }

    const pwd = newPassword || 'Password123!';
    const passwordHash = PasswordUtil.hashPassword(pwd);

    try {
      const prisma = getPrismaClient();
      await prisma.user.update({
        where: { id },
        data: { passwordHash },
      });
    } catch (err: any) {
      console.warn('[UserService] Database password reset skipped or failed:', err.message);
    }

    user.passwordHash = passwordHash;
    user.updatedAt = new Date();
    return { success: true };
  }

  async updateUserStatus(id: string, status: string, tenantId?: string): Promise<{ success: boolean }> {
    const user = this.users.get(id);
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }

    if (tenantId && user.tenantId !== tenantId) {
      throw new NotFoundException(`User ${id} not found`);
    }

    if (status !== 'ACTIVE' && status !== 'DISABLED') {
      throw new BadRequestException(`Invalid status: ${status}. Must be ACTIVE or DISABLED`);
    }

    try {
      const prisma = getPrismaClient();
      await prisma.user.update({
        where: { id },
        data: { status },
      });
    } catch (err: any) {
      console.warn('[UserService] Database status update skipped or failed:', err.message);
    }

    user.status = status as 'ACTIVE' | 'DISABLED';
    user.updatedAt = new Date();
    return { success: true };
  }

  findByUsername(username: string): User | undefined {
    const id = this.usernameIndex.get(username);
    if (!id) return undefined;
    return this.users.get(id);
  }

  findById(id: string): User | undefined {
    return this.users.get(id);
  }

  // ==========================================
  // 角色与权限管理接口 (Roles & Permissions)
  // ==========================================

  async listRoles(tenantId?: string): Promise<RoleDto[]> {
    let list = Array.from(this.roles.values());

    if (tenantId) {
      list = list.filter((r) => r.tenantId === tenantId || r.isSystem);
    }

    return list.map((role) => {
      const count = Array.from(this.users.values()).filter(
        (u) =>
          (u.roles as string[]).includes(role.code) && (!tenantId || u.tenantId === tenantId)
      ).length;
      return {
        ...role,
        userCount: count,
      };
    });
  }

  async createRole(input: CreateRoleInput, tenantId?: string): Promise<RoleDto> {
    const effectiveTenantId = tenantId || 'TENANT_DEFAULT';
    const duplicate = Array.from(this.roles.values()).some(
      (r) => r.code === input.code && (!tenantId || r.tenantId === tenantId || r.isSystem)
    );
    if (duplicate) {
      throw new ConflictException(`Role code ${input.code} already exists`);
    }

    const id = `role_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const role: RoleDto = {
      id,
      tenantId: effectiveTenantId,
      name: input.name,
      code: input.code,
      description: input.description,
      dataScope: input.dataScope || 'ORG_ONLY',
      permissions: input.permissions || [],
      userCount: 0,
      isSystem: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      const prisma = getPrismaClient();
      await prisma.role.create({
        data: {
          id,
          tenantId: effectiveTenantId,
          name: input.name,
          code: input.code,
          description: input.description || null,
          dataScope: input.dataScope || 'ORG_ONLY',
        },
      });

      if (input.permissions && input.permissions.length > 0) {
        for (const p of input.permissions) {
          await prisma.rolePermission.create({
            data: {
              roleId: id,
              permission: p,
            },
          });
        }
      }
    } catch (err: any) {
      console.warn('[UserService] Role db persistence skipped or failed:', err.message);
    }

    this.roles.set(id, role);
    return role;
  }

  async updateRole(id: string, input: UpdateRoleInput, tenantId?: string): Promise<RoleDto> {
    const role = this.roles.get(id);
    if (!role) {
      throw new NotFoundException(`Role ${id} not found`);
    }

    if (tenantId && role.tenantId && role.tenantId !== tenantId) {
      throw new NotFoundException(`Role ${id} not found`);
    }

    if (input.name !== undefined) role.name = input.name;
    if (input.description !== undefined) role.description = input.description;
    if (input.dataScope !== undefined) role.dataScope = input.dataScope;
    if (input.permissions !== undefined) role.permissions = input.permissions;

    role.updatedAt = new Date().toISOString();

    try {
      const prisma = getPrismaClient();
      const updateData: any = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.dataScope !== undefined) updateData.dataScope = input.dataScope;
      if (Object.keys(updateData).length > 0) {
        await prisma.role.update({
          where: { id },
          data: updateData,
        });
      }
    } catch (err: any) {
      console.warn('[UserService] Role db update skipped or failed:', err.message);
    }

    const count = Array.from(this.users.values()).filter(
      (u) =>
        (u.roles as string[]).includes(role.code) && (!tenantId || u.tenantId === tenantId)
    ).length;

    return {
      ...role,
      userCount: count,
    };
  }

  async deleteRole(id: string, tenantId?: string): Promise<{ success: boolean }> {
    const role = this.roles.get(id);
    if (!role) {
      throw new NotFoundException(`Role ${id} not found`);
    }

    if (role.isSystem) {
      throw new BadRequestException('Cannot delete system builtin role');
    }

    if (tenantId && role.tenantId && role.tenantId !== tenantId) {
      throw new NotFoundException(`Role ${id} not found`);
    }

    const isAssigned = Array.from(this.users.values()).some((u) =>
      (u.roles as string[]).includes(role.code)
    );
    if (isAssigned) {
      throw new BadRequestException('Role is currently assigned to users and cannot be deleted');
    }

    try {
      const prisma = getPrismaClient();
      await prisma.rolePermission.deleteMany({ where: { roleId: id } });
      await prisma.role.delete({ where: { id } });
    } catch (err: any) {
      console.warn('[UserService] Role delete skipped or failed:', err.message);
    }

    this.roles.delete(id);
    return { success: true };
  }

  async updateRolePermissions(
    id: string,
    permissions: string[],
    tenantId?: string,
    dataScope?: RoleDataScope
  ): Promise<RoleDto> {
    const role = this.roles.get(id);
    if (!role) {
      throw new NotFoundException(`Role ${id} not found`);
    }

    if (tenantId && role.tenantId && role.tenantId !== tenantId) {
      throw new NotFoundException(`Role ${id} not found`);
    }

    try {
      const prisma = getPrismaClient();
      await prisma.rolePermission.deleteMany({ where: { roleId: id } });
      for (const p of permissions) {
        await prisma.rolePermission.create({
          data: { roleId: id, permission: p },
        });
      }
      if (dataScope) {
        await prisma.role.update({
          where: { id },
          data: { dataScope },
        });
      }
    } catch (err: any) {
      console.warn('[UserService] Role permissions db update skipped or failed:', err.message);
    }

    role.permissions = permissions;
    if (dataScope) {
      role.dataScope = dataScope;
    }
    role.updatedAt = new Date().toISOString();

    const count = Array.from(this.users.values()).filter(
      (u) =>
        (u.roles as string[]).includes(role.code) && (!tenantId || u.tenantId === tenantId)
    ).length;

    return {
      ...role,
      userCount: count,
    };
  }

  getPermissionTree(): PermissionTreeNode[] {
    return DEFAULT_PERMISSION_TREE;
  }
}
