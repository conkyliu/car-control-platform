import test from 'node:test';
import assert from 'node:assert/strict';
import { Permission, RoleCode } from '@car-control/contracts';
import { UserService } from '../user/user.service.js';
import { TenantService } from '../tenant/tenant.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthService } from '../auth/auth.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { Reflector } from '@nestjs/core';

test('Gate 1: Platform Safe (Auth, RBAC, Multi-Tenant & Audit) Acceptance Suite', async (t) => {
  const userService = new UserService();
  const tenantService = new TenantService();
  const auditService = new AuditService();
  const authService = new AuthService(userService, tenantService, auditService);

  await t.test('1. Login with valid credentials returns Access Token and Refresh Token', async () => {
    const res = await authService.login(
      {
        username: 'admin',
        password: 'AdminPassword123!',
      },
      '127.0.0.1'
    );

    assert.ok(res.accessToken);
    assert.ok(res.refreshToken);
    assert.equal(res.user.username, 'admin');
    assert.equal(res.user.tenantId, 'TENANT_DEFAULT');
    assert.ok(res.user.roles.includes(RoleCode.TENANT_ADMIN));
    assert.ok(res.user.permissions.includes(Permission.AUDIT_READ));

    // 验签验证 Token 载荷
    const verified = authService.validateToken(res.accessToken);
    assert.equal(verified.username, 'admin');
    assert.equal(verified.tenantId, 'TENANT_DEFAULT');
  });

  await t.test('2. Login with invalid password fails with 401', async () => {
    await assert.rejects(
      async () => {
        await authService.login({
          username: 'admin',
          password: 'WrongPassword!',
        });
      },
      {
        name: 'UnauthorizedException',
        message: 'Invalid username or password',
      }
    );
  });

  await t.test('3. JWT Refresh Token rotation works and revokes old token', async () => {
    const initialLogin = await authService.login({
      username: 'operator',
      password: 'OperatorPassword123!',
    });

    const oldRefreshToken = initialLogin.refreshToken;

    // 第一次刷新成功
    const refreshRes = await authService.refresh({ refreshToken: oldRefreshToken });
    assert.ok(refreshRes.accessToken);
    assert.ok(refreshRes.refreshToken);
    assert.notEqual(refreshRes.refreshToken, oldRefreshToken);

    // 尝试重放旧的 Refresh Token，被拦截拒绝
    await assert.rejects(
      async () => {
        await authService.refresh({ refreshToken: oldRefreshToken });
      },
      {
        name: 'UnauthorizedException',
        message: 'Invalid or revoked refresh token',
      }
    );
  });

  await t.test('4. RBAC Permissions Guard enforces authorization (403 Forbidden)', async () => {
    const reflector = new Reflector();
    const guard = new PermissionsGuard(reflector);

    // 模拟管理员请求拥有 AUDIT_READ 权限
    const adminReq = {
      user: {
        sub: 'usr_admin',
        tenantId: 'TENANT_DEFAULT',
        permissions: [Permission.AUDIT_READ],
      },
    };

    // 模拟普通操作员请求未拥有 AUDIT_READ 权限
    const operatorReq = {
      user: {
        sub: 'usr_operator',
        tenantId: 'TENANT_DEFAULT',
        permissions: [Permission.VEHICLE_READ],
      },
    };

    const mockContext = (req: any, required: Permission[]) =>
      ({
        switchToHttp: () => ({ getRequest: () => req }),
        getHandler: () => {},
        getClass: () => {},
      } as any);

    // 注入元数据模拟 @RequirePermissions(Permission.AUDIT_READ)
    reflector.getAllAndOverride = () => [Permission.AUDIT_READ];

    // 管理员放行
    const adminAllowed = guard.canActivate(mockContext(adminReq, [Permission.AUDIT_READ]));
    assert.equal(adminAllowed, true);

    // 操作员被 403 拦截
    assert.throws(
      () => {
        guard.canActivate(mockContext(operatorReq, [Permission.AUDIT_READ]));
      },
      {
        name: 'ForbiddenException',
        message: /Missing required permission/,
      }
    );
  });

  await t.test('5. Tenant isolation: Audit logs of Tenant A are invisible to Tenant B', async () => {
    // 租户 B 的用户登录
    await authService.login({
      username: 'guest_b',
      password: 'GuestPassword123!',
    });

    const tenantALogs = auditService.getTenantAuditLogs('TENANT_DEFAULT');
    const tenantBLogs = auditService.getTenantAuditLogs('TENANT_B');

    assert.ok(tenantALogs.length > 0);
    assert.ok(tenantBLogs.length > 0);

    // 租户 A 的日志中绝对不含租户 B 的数据
    assert.equal(
      tenantALogs.some((l) => l.tenantId === 'TENANT_B'),
      false
    );
    // 租户 B 的日志中绝对不含租户 A 的数据
    assert.equal(
      tenantBLogs.some((l) => l.tenantId === 'TENANT_DEFAULT'),
      false
    );
  });

  await t.test('6. Quota enforcement prevents exceeding quotaDeviceCount', () => {
    // TENANT_B 配额为 50
    assert.doesNotThrow(() => {
      tenantService.assertQuotaAvailable('TENANT_B', 49);
    });

    // 达到 50 台配额被拒绝
    assert.throws(
      () => {
        tenantService.assertQuotaAvailable('TENANT_B', 50);
      },
      {
        name: 'BadRequestException',
        message: /Quota Exceeded/,
      }
    );
  });

  await t.test('7. Critical operations generate traceable AuditLog with traceId', async () => {
    const logs = auditService.getTenantAuditLogs('TENANT_DEFAULT');
    const loginLog = logs.find((l) => l.action === 'USER_LOGIN');

    assert.ok(loginLog);
    assert.ok(loginLog!.traceId);
    assert.equal(loginLog!.resourceType, 'AUTH');
    assert.ok(loginLog!.createdAt);
  });
});
