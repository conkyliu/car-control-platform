import test from 'node:test';
import assert from 'node:assert/strict';
import { Reflector } from '@nestjs/core';
import {
  Permission,
  RoleCode,
  UserDto,
  CreateUserInput,
  UpdateUserInput,
  RoleDto,
  CreateRoleInput,
  UpdateRoleInput,
  PermissionTreeNode,
} from '@car-control/contracts';
import { UserService } from '../user/user.service.js';
import { UserController } from '../user/user.controller.js';
import { RoleController } from '../user/role.controller.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';

test('UserController & RoleController Acceptance Suite', async (t) => {
  const userService = new UserService();
  const userController = new UserController(userService);
  const roleController = new RoleController(userService);
  const reflector = new Reflector();

  const mockAdminReq = {
    user: {
      sub: 'usr_admin',
      tenantId: 'TENANT_DEFAULT',
      roles: [RoleCode.SUPER_ADMIN],
      permissions: [Permission.USER_MANAGE],
    },
    headers: {},
  };

  const mockTenantAReq = {
    user: {
      sub: 'usr_tenant_a',
      tenantId: 'TENANT_A',
      roles: [RoleCode.TENANT_ADMIN],
      permissions: [Permission.USER_MANAGE],
    },
    headers: {},
  };

  const mockTenantBReq = {
    user: {
      sub: 'usr_tenant_b',
      tenantId: 'TENANT_B',
      roles: [RoleCode.TENANT_ADMIN],
      permissions: [Permission.USER_MANAGE],
    },
    headers: {},
  };

  await t.test('1. User listing and keyword/status/role filtering', async () => {
    const allUsers = await userController.listUsers({}, mockAdminReq);
    assert.ok(Array.isArray(allUsers));
    assert.ok(allUsers.length >= 2, 'Should include default seed users');

    const adminUser = allUsers.find((u) => u.username === 'admin');
    assert.ok(adminUser);
    assert.equal(adminUser.status, 'ACTIVE');
    assert.ok(adminUser.roles.includes('TENANT_ADMIN'));

    // Filter by keyword
    const keywordUsers = await userController.listUsers({ keyword: 'operator' }, mockAdminReq);
    assert.ok(keywordUsers.some((u: UserDto) => u.username === 'operator'));
    assert.ok(!keywordUsers.some((u: UserDto) => u.username === 'admin'));

    // Filter by role
    const operatorRoleUsers = await userController.listUsers({ role: 'OPERATOR' }, mockAdminReq);
    assert.ok(operatorRoleUsers.every((u: UserDto) => u.roles.includes('OPERATOR')));

    // Filter by status
    const activeUsers = await userController.listUsers({ status: 'ACTIVE' }, mockAdminReq);
    assert.ok(activeUsers.every((u: UserDto) => u.status === 'ACTIVE'));
  });

  await t.test('2. User creation, duplicate username rejection, and validation', async () => {
    const newUserInput: CreateUserInput = {
      username: 'dispatcher_chen',
      realName: '陈调度员',
      phone: '13812345678',
      email: 'chen@fleet.local',
      orgId: 'org_ops',
      orgName: '运营调度中心',
      roles: ['OPERATOR'],
      password: 'StrongPassword123!',
      status: 'ACTIVE',
    };

    const created = await userController.createUser(newUserInput, mockTenantAReq);
    assert.ok(created.id);
    assert.equal(created.username, 'dispatcher_chen');
    assert.equal(created.realName, '陈调度员');
    assert.equal(created.phone, '13812345678');
    assert.equal(created.tenantId, 'TENANT_A');
    assert.deepEqual(created.roles, ['OPERATOR']);
    assert.equal(created.status, 'ACTIVE');

    // Duplicate username conflict
    await assert.rejects(
      async () => {
        await userController.createUser(
          {
            username: 'dispatcher_chen',
            realName: '重复用户名用户',
            phone: '13900000000',
            roles: ['OPERATOR'],
          },
          mockTenantAReq
        );
      },
      {
        name: 'ConflictException',
      }
    );
  });

  await t.test('3. User modification and non-existent user handling', async () => {
    const users = await userController.listUsers({ keyword: 'dispatcher_chen' }, mockTenantAReq);
    const target = users[0];
    assert.ok(target);

    const updated = await userController.updateUser(
      target.id,
      {
        realName: '陈高级调度员',
        phone: '13899998888',
        email: 'chen_senior@fleet.local',
      },
      mockTenantAReq
    );

    assert.equal(updated.id, target.id);
    assert.equal(updated.realName, '陈高级调度员');
    assert.equal(updated.phone, '13899998888');
    assert.equal(updated.email, 'chen_senior@fleet.local');

    // Non-existent user throws NotFoundException
    await assert.rejects(
      async () => {
        await userController.updateUser('non_existent_id', { realName: '测试' }, mockTenantAReq);
      },
      {
        name: 'NotFoundException',
      }
    );
  });

  await t.test('4. User password reset', async () => {
    const users = await userController.listUsers({ keyword: 'dispatcher_chen' }, mockTenantAReq);
    const target = users[0];

    const resetRes = await userController.resetPassword(
      target.id,
      { password: 'NewSecurePassword888!' },
      mockTenantAReq
    );
    assert.deepEqual(resetRes, { success: true });

    // Verify user can be fetched and still exists
    const after = await userService.findById(target.id);
    assert.ok(after);
    assert.ok(after.passwordHash);
  });

  await t.test('5. User status toggle (ACTIVE -> DISABLED -> ACTIVE)', async () => {
    const users = await userController.listUsers({ keyword: 'dispatcher_chen' }, mockTenantAReq);
    const target = users[0];

    // Disable user
    const disableRes = await userController.updateUserStatus(target.id, { status: 'DISABLED' }, mockTenantAReq);
    assert.deepEqual(disableRes, { success: true });

    const afterDisabled = await userService.findById(target.id);
    assert.equal(afterDisabled?.status, 'DISABLED');

    // Enable user back
    const enableRes = await userController.updateUserStatus(target.id, { status: 'ACTIVE' }, mockTenantAReq);
    assert.deepEqual(enableRes, { success: true });

    const afterEnabled = await userService.findById(target.id);
    assert.equal(afterEnabled?.status, 'ACTIVE');

    // Invalid status rejected
    await assert.rejects(
      async () => {
        await userController.updateUserStatus(target.id, { status: 'UNKNOWN' as any }, mockTenantAReq);
      },
      {
        name: 'BadRequestException',
      }
    );
  });

  await t.test('6. User deletion and protection for root admin', async () => {
    // Root admin deletion should be blocked
    const adminUsers = await userController.listUsers({ keyword: 'admin' }, mockAdminReq);
    const admin = adminUsers.find((u: UserDto) => u.username === 'admin');
    assert.ok(admin);

    await assert.rejects(
      async () => {
        await userController.deleteUser(admin.id, mockAdminReq);
      },
      {
        name: 'BadRequestException',
      }
    );

    // Normal user deletion succeeds
    const users = await userController.listUsers({ keyword: 'dispatcher_chen' }, mockTenantAReq);
    const target = users[0];
    assert.ok(target);

    const delRes = await userController.deleteUser(target.id, mockTenantAReq);
    assert.deepEqual(delRes, { success: true });

    const checkGone = await userService.findById(target.id);
    assert.equal(checkGone, undefined);
  });

  await t.test('7. Role listing and seed roles verification', async () => {
    const roles = await roleController.listRoles(undefined, mockAdminReq);
    assert.ok(Array.isArray(roles));
    assert.ok(roles.length >= 4, 'Should include at least 4 seed roles');

    const superAdminRole = roles.find((r) => r.code === 'SUPER_ADMIN');
    assert.ok(superAdminRole);
    assert.equal(superAdminRole.isSystem, true);
    assert.equal(superAdminRole.dataScope, 'ALL');
    assert.ok(superAdminRole.permissions.length > 0);

    const tenantAdminRole = roles.find((r) => r.code === 'TENANT_ADMIN');
    assert.ok(tenantAdminRole);
    assert.equal(tenantAdminRole.isSystem, true);

    const operatorRole = roles.find((r) => r.code === 'OPERATOR');
    assert.ok(operatorRole);

    const carOwnerRole = roles.find((r) => r.code === 'CAR_OWNER');
    assert.ok(carOwnerRole);
  });

  await t.test('8. Role creation, duplicate rejection and validation', async () => {
    const newRoleInput: CreateRoleInput = {
      name: '安防合规审计员',
      code: 'SECURITY_AUDITOR',
      description: '专注安全与合规审计，拥有全量日志查看权限',
      dataScope: 'ORG_ONLY',
      permissions: ['audit:read', 'telemetry:read'],
    };

    const created = await roleController.createRole(newRoleInput, mockTenantAReq);
    assert.ok(created.id);
    assert.equal(created.name, '安防合规审计员');
    assert.equal(created.code, 'SECURITY_AUDITOR');
    assert.equal(created.dataScope, 'ORG_ONLY');
    assert.deepEqual(created.permissions, ['audit:read', 'telemetry:read']);
    assert.equal(created.tenantId, 'TENANT_A');
    assert.equal(created.isSystem, false);

    // Duplicate code rejection
    await assert.rejects(
      async () => {
        await roleController.createRole(
          {
            name: '重复角色',
            code: 'SECURITY_AUDITOR',
          },
          mockTenantAReq
        );
      },
      {
        name: 'ConflictException',
      }
    );
  });

  await t.test('9. Role modification and permission update', async () => {
    const roles = await roleController.listRoles(undefined, mockTenantAReq);
    const auditorRole = roles.find((r: RoleDto) => r.code === 'SECURITY_AUDITOR');
    assert.ok(auditorRole);

    // Update metadata
    const updated = await roleController.updateRole(
      auditorRole.id,
      {
        name: '高级合规审计官',
        description: '负责全局日志审查与告警消警合规审计',
      },
      mockTenantAReq
    );
    assert.equal(updated.name, '高级合规审计官');
    assert.equal(updated.description, '负责全局日志审查与告警消警合规审计');

    // Update fine-grained permissions and data scope
    const updatedPerms = await roleController.updateRolePermissions(
      auditorRole.id,
      {
        permissions: ['audit:read', 'telemetry:read', 'alarm:read'],
        dataScope: 'ORG_AND_CHILDREN',
      },
      mockTenantAReq
    );
    assert.deepEqual(updatedPerms.permissions, ['audit:read', 'telemetry:read', 'alarm:read']);
    assert.equal(updatedPerms.dataScope, 'ORG_AND_CHILDREN');
  });

  await t.test('10. Role deletion safety constraints (system role & role in use)', async () => {
    const roles = await roleController.listRoles(undefined, mockTenantAReq);
    const tenantAdminRole = roles.find((r: RoleDto) => r.code === 'TENANT_ADMIN');
    assert.ok(tenantAdminRole);

    // System role cannot be deleted
    await assert.rejects(
      async () => {
        await roleController.deleteRole(tenantAdminRole.id, mockTenantAReq);
      },
      {
        name: 'BadRequestException',
      }
    );

    // Delete custom created role
    const auditorRole = roles.find((r: RoleDto) => r.code === 'SECURITY_AUDITOR');
    assert.ok(auditorRole);

    const delRes = await roleController.deleteRole(auditorRole.id, mockTenantAReq);
    assert.deepEqual(delRes, { success: true });

    // Non-existent role deletion throws NotFoundException
    await assert.rejects(
      async () => {
        await roleController.deleteRole('non_existent_role_id', mockTenantAReq);
      },
      {
        name: 'NotFoundException',
      }
    );
  });

  await t.test('11. Permission tree retrieval returns complete 6-cluster hierarchy', async () => {
    const tree = await roleController.getPermissionTree();
    assert.ok(Array.isArray(tree));
    assert.ok(tree.length >= 6, 'Should include at least 6 primary clusters');

    const clusterKeys = tree.map((n: PermissionTreeNode) => n.key);
    assert.ok(clusterKeys.includes('cluster-dashboard'));
    assert.ok(clusterKeys.includes('cluster-platform'));
    assert.ok(clusterKeys.includes('cluster-assets'));
    assert.ok(clusterKeys.includes('cluster-control'));
    assert.ok(clusterKeys.includes('cluster-location'));
    assert.ok(clusterKeys.includes('cluster-operations'));

    const controlCluster = tree.find((n: PermissionTreeNode) => n.key === 'cluster-control');
    assert.ok(controlCluster);
    assert.ok(controlCluster.children && controlCluster.children.length > 0);
  });

  await t.test('12. Multi-tenant security isolation across users and roles', async () => {
    // Tenant A creates a user and a custom role
    const userA = await userController.createUser(
      {
        username: 'user_in_tenant_a',
        realName: '租户A员工',
        phone: '13811110001',
        roles: ['OPERATOR'],
      },
      mockTenantAReq
    );

    const roleA = await roleController.createRole(
      {
        name: '租户A专属质检员',
        code: 'ROLE_QA_TENANT_A',
      },
      mockTenantAReq
    );

    // Tenant B queries user list: user_in_tenant_a must NOT be visible
    const tenantBUsers = await userController.listUsers({}, mockTenantBReq);
    assert.ok(!tenantBUsers.some((u: UserDto) => u.username === 'user_in_tenant_a'));

    // Tenant B attempts to update or delete Tenant A's user: rejected with 404
    await assert.rejects(
      async () => {
        await userController.updateUser(userA.id, { realName: '入侵修改' }, mockTenantBReq);
      },
      {
        name: 'NotFoundException',
      }
    );

    await assert.rejects(
      async () => {
        await userController.deleteUser(userA.id, mockTenantBReq);
      },
      {
        name: 'NotFoundException',
      }
    );

    // Tenant B queries roles: custom role of Tenant A must NOT be visible
    const tenantBRoles = await roleController.listRoles(undefined, mockTenantBReq);
    assert.ok(!tenantBRoles.some((r: RoleDto) => r.code === 'ROLE_QA_TENANT_A'));

    // Tenant B attempts to update or delete Tenant A's role: rejected with 404
    await assert.rejects(
      async () => {
        await roleController.updateRole(roleA.id, { name: '入侵修改' }, mockTenantBReq);
      },
      {
        name: 'NotFoundException',
      }
    );

    await assert.rejects(
      async () => {
        await roleController.deleteRole(roleA.id, mockTenantBReq);
      },
      {
        name: 'NotFoundException',
      }
    );
  });

  await t.test('13. RBAC permission metadata check on all controller endpoints', async () => {
    const userEndpoints = [
      userController.listUsers,
      userController.createUser,
      userController.updateUser,
      userController.deleteUser,
      userController.resetPassword,
      userController.updateUserStatus,
    ];

    for (const endpoint of userEndpoints) {
      const perms = reflector.get('permissions', endpoint);
      assert.deepEqual(perms, [Permission.USER_MANAGE], `User endpoint ${endpoint.name} should require USER_MANAGE`);
    }

    const roleEndpoints = [
      roleController.listRoles,
      roleController.createRole,
      roleController.updateRole,
      roleController.deleteRole,
      roleController.updateRolePermissions,
      roleController.getPermissionTree,
    ];

    for (const endpoint of roleEndpoints) {
      const perms = reflector.get('permissions', endpoint);
      assert.deepEqual(perms, [Permission.USER_MANAGE], `Role endpoint ${endpoint.name} should require USER_MANAGE`);
    }
  });

  await t.test('14. PermissionsGuard enforcement with mock execution context', async () => {
    const guard = new PermissionsGuard(reflector);

    const makeContext = (user: any, handler: any, controllerClass: any) => ({
      getHandler: () => handler,
      getClass: () => controllerClass,
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as any);

    const authorizedUser = {
      tenantId: 'TENANT_DEFAULT',
      permissions: [Permission.USER_MANAGE],
    };

    const unauthorizedUser = {
      tenantId: 'TENANT_DEFAULT',
      permissions: [Permission.VEHICLE_READ],
    };

    // Authorized should pass
    const canPass = guard.canActivate(makeContext(authorizedUser, userController.listUsers, UserController));
    assert.equal(canPass, true);

    // Unauthorized should throw 403 ForbiddenException
    assert.throws(
      () => {
        guard.canActivate(makeContext(unauthorizedUser, userController.listUsers, UserController));
      },
      {
        name: 'ForbiddenException',
      }
    );
  });
});
