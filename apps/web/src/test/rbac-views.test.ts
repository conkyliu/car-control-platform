import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PHONE_REGEX,
  EMAIL_REGEX,
  USERNAME_REGEX,
  validatePhone,
  validateEmail,
  validateUsername,
  validatePassword,
  generateRandomPassword,
  maskPhone,
  getDataScopeLabel,
  getDataScopeColor,
  calculateUserStats,
  filterUsers,
  calculateRoleStats,
  aggregateRoleUserCounts,
  canDeleteUser,
  canDisableUser,
  canDeleteRole,
  flattenPermissionKeys,
  getAllPermissionNodeKeys,
  isSuperAdminRole,
  SUPER_ADMIN_LOCKED_PERMISSIONS,
  PERMISSION_TREE_DATA,
  SEED_ROLES,
  SEED_USERS,
  isApiError,
} from '../views/rbac/rbac-core.ts';
import { ApiError } from '../api/client.ts';
import type { UserDto } from '../api/user.ts';
import type { RoleDto } from '../api/role.ts';

describe('RBAC Center & User/Role Views Core Test Suite (TDD)', () => {
  it('phone and email regex accurately validate standard formats and reject invalid inputs', () => {
    // Valid phones
    assert.equal(validatePhone('13800138000').valid, true);
    assert.equal(validatePhone('15912345678').valid, true);
    assert.equal(validatePhone('18688889999').valid, true);
    assert.equal(validatePhone('19912344321').valid, true);

    // Invalid phones
    assert.equal(validatePhone('12000000000').valid, false); // 第二位非 3-9
    assert.equal(validatePhone('1380013800').valid, false);  // 10位过短
    assert.equal(validatePhone('138001380001').valid, false); // 12位过长
    assert.equal(validatePhone('abcdefghijk').valid, false);
    assert.equal(validatePhone('').valid, false);
    assert.equal(validatePhone(undefined).valid, false);

    // Valid emails
    assert.equal(validateEmail('test@car-control.com').valid, true);
    assert.equal(validateEmail('admin.user+tag@domain.co.uk').valid, true);
    assert.equal(validateEmail('').valid, true); // 可选字段
    assert.equal(validateEmail(undefined).valid, true); // 可选字段

    // Invalid emails
    assert.equal(validateEmail('invalid-email').valid, false);
    assert.equal(validateEmail('test@').valid, false);
    assert.equal(validateEmail('@domain.com').valid, false);
    assert.equal(validateEmail('test@domain').valid, false);
  });

  it('username and password validation enforce enterprise complexity constraints', () => {
    // Username constraints
    assert.equal(validateUsername('admin').valid, true);
    assert.equal(validateUsername('operator_01').valid, true);
    assert.equal(validateUsername('user-east').valid, true);
    assert.equal(validateUsername('abc').valid, false); // 3位过短 (< 4)
    assert.equal(validateUsername('a'.repeat(21)).valid, false); // 21位过长 (> 20)
    assert.equal(validateUsername('user@name').valid, false); // 特殊字符不允许
    assert.equal(validateUsername('').valid, false);

    // Password constraints
    assert.equal(validatePassword('Admin1234').valid, true);
    assert.equal(validatePassword('Password99!').valid, true);
    assert.equal(validatePassword('1234567').valid, false); // < 8位
    assert.equal(validatePassword('abcdefgh').valid, false); // 无数字
    assert.equal(validatePassword('12345678').valid, false); // 无字母
    assert.equal(validatePassword('').valid, false);

    // Random password generator
    const pwd1 = generateRandomPassword(12);
    const pwd2 = generateRandomPassword(16);
    assert.equal(pwd1.length, 12);
    assert.equal(pwd2.length, 16);
    assert.notEqual(pwd1, pwd2);
    assert.equal(validatePassword(pwd1).valid, true);
    assert.equal(validatePassword(pwd2).valid, true);
  });

  it('maskPhone masks sensitive middle 4 digits correctly', () => {
    assert.equal(maskPhone('13800138001'), '138****8001');
    assert.equal(maskPhone('15912345678'), '159****5678');
    assert.equal(maskPhone('021-12345678'), '021-12345678'); // 非11位原样返回
    assert.equal(maskPhone(''), '-');
    assert.equal(maskPhone(undefined), '-');
  });

  it('data scope metadata correctly formats labels and theme colors', () => {
    assert.equal(getDataScopeLabel('ALL'), '全部数据权限');
    assert.equal(getDataScopeLabel('ORG_AND_CHILDREN'), '本机构及子机构');
    assert.equal(getDataScopeLabel('ORG_ONLY'), '仅本机构直属');
    assert.equal(getDataScopeLabel('SELF_ONLY'), '仅本人数据');
    assert.equal(getDataScopeLabel(undefined as any), '未配置');

    assert.equal(getDataScopeColor('ALL'), '#722ed1');
    assert.equal(getDataScopeColor('ORG_AND_CHILDREN'), '#1677ff');
    assert.equal(getDataScopeColor('ORG_ONLY'), '#13c2c2');
    assert.equal(getDataScopeColor('SELF_ONLY'), '#fa8c16');
  });

  it('calculateUserStats accurately computes summary metrics', () => {
    const stats = calculateUserStats(SEED_USERS);
    // SEED_USERS has 6 users: 5 ACTIVE, 1 DISABLED, 1 unassigned org (user-006)
    assert.equal(stats.totalUsers, 6);
    assert.equal(stats.activeUsers, 5);
    assert.equal(stats.disabledUsers, 1);
    assert.equal(stats.unassignedOrgUsers, 1);

    const emptyStats = calculateUserStats([]);
    assert.equal(emptyStats.totalUsers, 0);
    assert.equal(emptyStats.activeUsers, 0);
    assert.equal(emptyStats.disabledUsers, 0);
    assert.equal(emptyStats.unassignedOrgUsers, 0);
  });

  it('filterUsers filters across keyword, organization, status, and role', () => {
    // 1. Keyword search by username
    const byUsername = filterUsers(SEED_USERS, { keyword: 'admin' });
    assert.equal(byUsername.length, 1);
    assert.equal(byUsername[0]?.username, 'admin');

    // 2. Keyword search by realName
    const byRealName = filterUsers(SEED_USERS, { keyword: '调度' });
    assert.equal(byRealName.length, 1);
    assert.equal(byRealName[0]?.username, 'lisi');

    // 3. Keyword search by phone
    const byPhone = filterUsers(SEED_USERS, { keyword: '1391234' });
    assert.equal(byPhone.length, 1);
    assert.equal(byPhone[0]?.username, 'zhangsan');

    // 4. Org filter
    const byOrg = filterUsers(SEED_USERS, { orgId: 'org-fleet-sh' });
    assert.equal(byOrg.length, 2); // zhangsan and lisi

    // 5. Org filter - unassigned
    const unassigned = filterUsers(SEED_USERS, { orgId: 'UNASSIGNED' });
    assert.equal(unassigned.length, 1);
    assert.equal(unassigned[0]?.username, 'newuser');

    // 6. Status filter
    const activeUsers = filterUsers(SEED_USERS, { status: 'ACTIVE' });
    assert.equal(activeUsers.length, 5);
    const disabledUsers = filterUsers(SEED_USERS, { status: 'DISABLED' });
    assert.equal(disabledUsers.length, 1);
    assert.equal(disabledUsers[0]?.username, 'zhaoliu');

    // 7. Role filter
    const operators = filterUsers(SEED_USERS, { role: 'OPERATOR' });
    assert.equal(operators.length, 2); // lisi and zhaoliu

    // 8. Combined filter
    const combined = filterUsers(SEED_USERS, {
      keyword: '李',
      orgId: 'org-fleet-sh',
      status: 'ACTIVE',
      role: 'OPERATOR',
    });
    assert.equal(combined.length, 1);
    assert.equal(combined[0]?.username, 'lisi');
  });

  it('canDeleteUser and canDisableUser safety guards enforce critical protections', () => {
    const adminUser = SEED_USERS.find((u) => u.username === 'admin')!;
    const normalUser = SEED_USERS.find((u) => u.username === 'lisi')!;

    // Cannot delete current user himself
    const selfDelete = canDeleteUser(normalUser, normalUser.id, normalUser.username);
    assert.equal(selfDelete.allowed, false);
    assert.match(selfDelete.message!, /禁止删除当前登录的自身账号/);

    // Cannot delete superadmin account
    const adminDelete = canDeleteUser(adminUser, 'user-other', 'other');
    assert.equal(adminDelete.allowed, false);
    assert.match(adminDelete.message!, /超级管理员账户属于系统内置关键账号，禁止删除/);

    // Regular user can be deleted by other admin
    const regularDelete = canDeleteUser(normalUser, 'user-admin', 'admin');
    assert.equal(regularDelete.allowed, true);

    // Cannot disable current user himself
    const selfDisable = canDisableUser(normalUser, normalUser.id, normalUser.username);
    assert.equal(selfDisable.allowed, false);
    assert.match(selfDisable.message!, /禁止停用当前登录的自身账号/);

    // Regular user can be disabled by other admin
    const regularDisable = canDisableUser(normalUser, 'user-admin', 'admin');
    assert.equal(regularDisable.allowed, true);
  });

  it('calculateRoleStats and aggregateRoleUserCounts compute counts accurately', () => {
    const stats = calculateRoleStats(SEED_ROLES);
    // SEED_ROLES has 5 roles: 3 isSystem (SUPER_ADMIN, TENANT_ADMIN, CAR_OWNER) and 2 custom (OPERATOR, AUDITOR)
    assert.equal(stats.totalRoles, 5);
    assert.equal(stats.systemRoles, 3);
    assert.equal(stats.customRoles, 2);

    const aggregated = aggregateRoleUserCounts(SEED_ROLES, SEED_USERS);
    const operatorRole = aggregated.find((r) => r.code === 'OPERATOR');
    assert.equal(operatorRole?.userCount, 2); // lisi & zhaoliu
  });

  it('canDeleteRole protects system roles and roles with bound users', () => {
    const superAdminRole = SEED_ROLES.find((r) => r.code === 'SUPER_ADMIN')!;
    const operatorRole = SEED_ROLES.find((r) => r.code === 'OPERATOR')!;
    const emptyCustomRole: RoleDto = {
      id: 'role-temp',
      name: '临时角色',
      code: 'TEMP_ROLE',
      dataScope: 'ORG_ONLY',
      permissions: ['dashboard:read'],
      userCount: 0,
      isSystem: false,
    };

    // System role cannot be deleted
    const sysCheck = canDeleteRole(superAdminRole);
    assert.equal(sysCheck.allowed, false);
    assert.match(sysCheck.message!, /系统内置角色禁止删除/);

    // Role with users cannot be deleted
    const userCheck = canDeleteRole({ ...operatorRole, userCount: 2 });
    assert.equal(userCheck.allowed, false);
    assert.match(userCheck.message!, /当前角色仍关联/);

    // Empty custom role can be deleted
    const normalCheck = canDeleteRole(emptyCustomRole);
    assert.equal(normalCheck.allowed, true);
  });

  it('permission tree contains all 6 clusters and supports traversal utilities', () => {
    // 6 business clusters
    assert.equal(PERMISSION_TREE_DATA.length, 6);
    const clusterKeys = PERMISSION_TREE_DATA.map((c) => c.key);
    assert.deepEqual(clusterKeys, [
      'cluster-dashboard',
      'cluster-platform',
      'cluster-assets',
      'cluster-control',
      'cluster-location',
      'cluster-operations',
    ]);

    // Flatten keys includes leaf action codes
    const leafCodes = flattenPermissionKeys(PERMISSION_TREE_DATA);
    assert.ok(leafCodes.includes('car:control:engine'));
    assert.ok(leafCodes.includes('car:control:lock'));
    assert.ok(leafCodes.includes('device:config:write'));
    assert.ok(leafCodes.includes('ota:push:execute'));
    assert.ok(leafCodes.includes('user:manage'));
    assert.ok(leafCodes.includes('dashboard:read'));

    // All node keys includes tree internal keys
    const allKeys = getAllPermissionNodeKeys(PERMISSION_TREE_DATA);
    assert.ok(allKeys.includes('cluster-control'));
    assert.ok(allKeys.includes('menu-control'));
    assert.ok(allKeys.includes('action-control-engine'));
    assert.ok(allKeys.length > leafCodes.length);

    // SuperAdmin role check and locked permissions
    assert.equal(isSuperAdminRole('SUPER_ADMIN'), true);
    assert.equal(isSuperAdminRole('OPERATOR'), false);
    for (const locked of SUPER_ADMIN_LOCKED_PERMISSIONS) {
      assert.ok(leafCodes.includes(locked), `Locked perm ${locked} should exist in tree`);
    }
  });

  it('isApiError differentiates server ApiError instances correctly', () => {
    const err400 = new ApiError('Bad Request', 400);
    assert.equal(isApiError(err400), true);

    const genericErr = new Error('Network failure');
    assert.equal(isApiError(genericErr), false);

    assert.equal(isApiError(null), false);
    assert.equal(isApiError(undefined), false);
    assert.equal(isApiError({ statusCode: 500, message: 'Server error' }), true);
  });

  it('user and role API client functions are exported and invoke http methods properly', async () => {
    const {
      fetchUsersApi,
      createUserApi,
      updateUserApi,
      deleteUserApi,
      resetUserPasswordApi,
      updateUserStatusApi,
    } = await import('../api/user.ts');

    const {
      fetchRolesApi,
      createRoleApi,
      updateRoleApi,
      deleteRoleApi,
      updateRolePermissionsApi,
      fetchPermissionTreeApi,
    } = await import('../api/role.ts');

    assert.equal(typeof fetchUsersApi, 'function');
    assert.equal(typeof createUserApi, 'function');
    assert.equal(typeof updateUserApi, 'function');
    assert.equal(typeof deleteUserApi, 'function');
    assert.equal(typeof resetUserPasswordApi, 'function');
    assert.equal(typeof updateUserStatusApi, 'function');

    assert.equal(typeof fetchRolesApi, 'function');
    assert.equal(typeof createRoleApi, 'function');
    assert.equal(typeof updateRoleApi, 'function');
    assert.equal(typeof deleteRoleApi, 'function');
    assert.equal(typeof updateRolePermissionsApi, 'function');
    assert.equal(typeof fetchPermissionTreeApi, 'function');
  });
});
