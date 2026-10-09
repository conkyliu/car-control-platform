import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { RoleCode, Permission } from '@car-control/contracts';
import { User } from '@car-control/domain-types';
import { PasswordUtil } from '../auth/password.util.js';

@Injectable()
export class UserService {
  private users: Map<string, User> = new Map();
  private usernameIndex: Map<string, string> = new Map(); // username -> id

  constructor() {
    // 预置默认管理员与示范用户
    this.createUser({
      id: 'user_admin_01',
      tenantId: 'TENANT_DEFAULT',
      username: 'admin',
      password: 'AdminPassword123!',
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

    this.createUser({
      id: 'user_operator_01',
      tenantId: 'TENANT_DEFAULT',
      username: 'operator',
      password: 'OperatorPassword123!',
      roles: [RoleCode.OPERATOR],
      permissions: [
        Permission.VEHICLE_READ,
        Permission.VEHICLE_CONTROL,
        Permission.DEVICE_READ,
      ],
    });

    this.createUser({
      id: 'user_guest_01',
      tenantId: 'TENANT_B',
      username: 'guest_b',
      password: 'GuestPassword123!',
      roles: [RoleCode.CAR_OWNER],
      permissions: [Permission.VEHICLE_READ],
    });
  }

  createUser(input: {
    id?: string;
    tenantId: string;
    username: string;
    password: string;
    roles: RoleCode[];
    permissions: Permission[];
  }): User {
    if (this.usernameIndex.has(input.username)) {
      throw new ConflictException(`Username ${input.username} already exists`);
    }

    const id = input.id || `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const user: User = {
      id,
      tenantId: input.tenantId,
      username: input.username,
      passwordHash: PasswordUtil.hashPassword(input.password),
      status: 'ACTIVE',
      roles: input.roles,
      permissions: input.permissions,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.users.set(id, user);
    this.usernameIndex.set(input.username, id);
    return user;
  }

  findByUsername(username: string): User | undefined {
    const id = this.usernameIndex.get(username);
    if (!id) return undefined;
    return this.users.get(id);
  }

  findById(id: string): User | undefined {
    return this.users.get(id);
  }
}
