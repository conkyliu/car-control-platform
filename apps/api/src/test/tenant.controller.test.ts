import test from 'node:test';
import assert from 'node:assert/strict';
import { Reflector } from '@nestjs/core';
import {
  Permission,
  CreateTenantInput,
  CreateOrgInput,
  TenantQuotaDto,
  OrgNodeDto,
} from '@car-control/contracts';
import { TenantService } from '../tenant/tenant.service.js';
import { TenantController } from '../tenant/tenant.controller.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';

test('TenantController & OrgTree Acceptance Suite', async (t) => {
  const service = new TenantService();
  const controller = new TenantController(service);
  const reflector = new Reflector();

  await t.test('1. Tenant listing and retrieval', async () => {
    const tenants = await controller.listTenants();
    assert.ok(Array.isArray(tenants));
    assert.ok(tenants.length >= 2, 'Should include default seed tenants');

    const defaultTenant = tenants.find((item) => item.id === 'TENANT_DEFAULT');
    assert.ok(defaultTenant, 'TENANT_DEFAULT should exist');
    assert.equal(defaultTenant.code, 'DEMO_FLEET');
    assert.equal(defaultTenant.status, 'ACTIVE');
    assert.equal(defaultTenant.quotaDeviceCount, 1000);

    const single = await controller.getTenant('TENANT_DEFAULT');
    assert.equal(single.id, 'TENANT_DEFAULT');
    assert.equal(single.name, '示范网约车集团');

    await assert.rejects(
      async () => {
        await controller.getTenant('NON_EXISTENT_TENANT');
      },
      {
        name: 'NotFoundException',
      }
    );
  });

  await t.test('2. Tenant creation and duplicate code rejection', async () => {
    const newTenantInput: CreateTenantInput = {
      name: '智慧出行科技',
      code: 'SMART_MOBILITY',
      quotaDeviceCount: 300,
      quotaVehicleCount: 300,
      creditCode: '91110108MA00000001',
      contactPerson: '赵经理',
      contactPhone: '13911112222',
      description: '专注高品质网约出行服务',
    };

    const created = await controller.createTenant(newTenantInput);
    assert.ok(created.id);
    assert.equal(created.name, '智慧出行科技');
    assert.equal(created.code, 'SMART_MOBILITY');
    assert.equal(created.quotaDeviceCount, 300);
    assert.equal(created.quotaVehicleCount, 300);
    assert.equal(created.status, 'ACTIVE');

    // Duplicate code should be rejected
    await assert.rejects(
      async () => {
        await controller.createTenant({
          name: '重复代码租户',
          code: 'SMART_MOBILITY',
          quotaDeviceCount: 10,
        });
      },
      {
        name: 'ConflictException',
      }
    );
  });

  await t.test('3. Tenant update and modification', async () => {
    const updated = await controller.updateTenant('TENANT_B', {
      name: '快捷汽车租赁（集团）',
      contactPerson: '李总经理',
      description: '华北地区综合租车平台',
    });

    assert.equal(updated.id, 'TENANT_B');
    assert.equal(updated.name, '快捷汽车租赁（集团）');
    assert.equal(updated.contactPerson, '李总经理');
    assert.equal(updated.description, '华北地区综合租车平台');

    // Verify non-existent tenant throws NotFoundException
    await assert.rejects(
      async () => {
        await controller.updateTenant('UNKNOWN_ID', { name: '测试' });
      },
      {
        name: 'NotFoundException',
      }
    );
  });

  await t.test('4. Tenant quota query and adjustment', async () => {
    const quota = await controller.getTenantQuota('TENANT_DEFAULT');
    assert.equal(quota.tenantId, 'TENANT_DEFAULT');
    assert.equal(quota.totalQuota, 1000);
    assert.ok(typeof quota.usedCount === 'number');
    assert.ok(typeof quota.remainingQuota === 'number');
    assert.ok(typeof quota.usagePercentage === 'number');
    assert.equal(quota.remainingQuota, quota.totalQuota - quota.usedCount);

    // Adjust quota
    const adjusted = await controller.adjustTenantQuota('TENANT_DEFAULT', {
      quotaDeviceCount: 2000,
      quotaVehicleCount: 2000,
    });
    assert.equal(adjusted.totalQuota, 2000);
    assert.equal(adjusted.remainingQuota, 2000 - adjusted.usedCount);

    const recheck = await controller.getTenantQuota('TENANT_DEFAULT');
    assert.equal(recheck.totalQuota, 2000);

    // Negative quota should be rejected
    await assert.rejects(
      async () => {
        await controller.adjustTenantQuota('TENANT_DEFAULT', {
          quotaDeviceCount: -10,
        });
      },
      {
        name: 'BadRequestException',
      }
    );
  });

  await t.test('5. Tenant status change (ACTIVE -> SUSPENDED -> ACTIVE)', async () => {
    const suspendRes = await controller.updateTenantStatus('TENANT_B', { status: 'SUSPENDED' });
    assert.deepEqual(suspendRes, { success: true });

    const tenantSuspended = await controller.getTenant('TENANT_B');
    assert.equal(tenantSuspended.status, 'SUSPENDED');

    const activateRes = await controller.updateTenantStatus('TENANT_B', { status: 'ACTIVE' });
    assert.deepEqual(activateRes, { success: true });

    const tenantActive = await controller.getTenant('TENANT_B');
    assert.equal(tenantActive.status, 'ACTIVE');

    // Invalid status should be rejected
    await assert.rejects(
      async () => {
        await controller.updateTenantStatus('TENANT_B', { status: 'INVALID_STATUS' });
      },
      {
        name: 'BadRequestException',
      }
    );
  });

  await t.test('6. Org tree query with default hierarchical seeds', async () => {
    const tree = await controller.getOrgTree('TENANT_DEFAULT');
    assert.ok(Array.isArray(tree));
    assert.ok(tree.length > 0, 'Should have root node(s)');

    const root = tree[0];
    assert.ok(root.name.includes('总部'));
    assert.equal(root.tenantId, 'TENANT_DEFAULT');
    assert.ok(Array.isArray(root.children));
    assert.ok(root.children.length >= 3, 'Root should have at least 3 children');

    const childNames = (root.children || []).map((c: OrgNodeDto) => c.name);
    assert.ok(childNames.some((n: string) => n.includes('运营中心')));
    assert.ok(childNames.some((n: string) => n.includes('技术运维部')));
    assert.ok(childNames.some((n: string) => n.includes('华东分公司')));
  });

  await t.test('7. Org node creation, hierarchical linking and update', async () => {
    // Find HQ root
    const tree = await controller.getOrgTree('TENANT_DEFAULT');
    const root = tree[0];

    // Create child under root
    const newOrgInput: CreateOrgInput = {
      tenantId: 'TENANT_DEFAULT',
      name: '华南分公司',
      code: 'BRANCH_SOUTH',
      parentId: root.id,
      sortOrder: 4,
      leader: '林经理',
      phone: '13800138008',
      description: '负责华南区域运营中心',
    };

    const createdOrg = await controller.createOrg(newOrgInput);
    assert.ok(createdOrg.id);
    assert.equal(createdOrg.name, '华南分公司');
    assert.equal(createdOrg.parentId, root.id);

    // Verify it appears in tree
    const updatedTree = await controller.getOrgTree('TENANT_DEFAULT');
    const updatedRoot = updatedTree[0];
    assert.ok(updatedRoot.children?.some((c: OrgNodeDto) => c.id === createdOrg.id));

    // Update org
    const updatedOrg = await controller.updateOrg(createdOrg.id, {
      name: '华南大区综合运营中心',
      leader: '林总监',
    });
    assert.equal(updatedOrg.name, '华南大区综合运营中心');
    assert.equal(updatedOrg.leader, '林总监');
  });

  await t.test('8. Org node deletion and parent child safety constraint', async () => {
    const tree = await controller.getOrgTree('TENANT_DEFAULT');
    const root = tree[0];

    // Attempting to delete root with children should fail
    await assert.rejects(
      async () => {
        await controller.deleteOrg(root.id);
      },
      {
        name: 'BadRequestException',
      }
    );

    // Create leaf node then delete it
    const leaf = await controller.createOrg({
      tenantId: 'TENANT_DEFAULT',
      name: '临时筹备组',
      code: 'TEMP_PREP',
      parentId: root.id,
      sortOrder: 99,
    });

    const delRes = await controller.deleteOrg(leaf.id);
    assert.deepEqual(delRes, { success: true });

    // Verify leaf is no longer in tree
    const afterTree = await controller.getOrgTree('TENANT_DEFAULT');
    assert.ok(!afterTree[0].children?.some((c: OrgNodeDto) => c.id === leaf.id));

    // Deleting non-existent org should throw NotFoundException
    await assert.rejects(
      async () => {
        await controller.deleteOrg('NON_EXISTENT_ORG');
      },
      {
        name: 'NotFoundException',
      }
    );
  });

  await t.test('9. RBAC permission metadata check on all controller endpoints', async () => {
    const endpoints = [
      controller.listTenants,
      controller.createTenant,
      controller.getTenant,
      controller.updateTenant,
      controller.getTenantQuota,
      controller.adjustTenantQuota,
      controller.updateTenantStatus,
      controller.getOrgTree,
      controller.createOrg,
      controller.updateOrg,
      controller.deleteOrg,
    ];

    for (const endpoint of endpoints) {
      const perms = reflector.get('permissions', endpoint);
      assert.deepEqual(perms, [Permission.TENANT_MANAGE], `Endpoint ${endpoint.name} should require TENANT_MANAGE`);
    }
  });

  await t.test('10. PermissionsGuard enforcement with mock execution context', async () => {
    const guard = new PermissionsGuard(reflector);

    const makeContext = (user: any, handler: any) => ({
      getHandler: () => handler,
      getClass: () => TenantController,
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as any);

    const authorizedUser = {
      tenantId: 'TENANT_DEFAULT',
      permissions: [Permission.TENANT_MANAGE],
    };

    const unauthorizedUser = {
      tenantId: 'TENANT_DEFAULT',
      permissions: [Permission.VEHICLE_READ],
    };

    // Authorized should pass
    const canPass = guard.canActivate(makeContext(authorizedUser, controller.listTenants));
    assert.equal(canPass, true);

    // Unauthorized should throw 403 ForbiddenException
    assert.throws(
      () => {
        guard.canActivate(makeContext(unauthorizedUser, controller.listTenants));
      },
      {
        name: 'ForbiddenException',
      }
    );
  });
});
