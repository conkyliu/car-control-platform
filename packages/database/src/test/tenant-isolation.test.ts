import test from 'node:test';
import assert from 'node:assert/strict';
import { TenantContext, VehicleRepository } from '../index.js';

test('Multi-Tenant Data Isolation Test Suite', async (t) => {
  const repo = new VehicleRepository();

  await t.test('1. Throws security error when executed without TenantContext', async () => {
    assert.throws(
      () => {
        TenantContext.getRequired();
      },
      {
        message: /TenantContext required/,
      }
    );
  });

  await t.test('2. Strict isolation: Tenant A records are invisible to Tenant B', async () => {
    // 租户 A 创建一辆车
    const vehicleA = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => {
        return repo.create({
          id: 'veh_001',
          projectId: 'proj_a',
          vin: 'VIN_AAA_123',
          plateNumber: '粤B11111',
          brandId: 'brand_tesla',
          modelId: 'model_y',
          deviceId: 'dev_001',
          status: 'NORMAL',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    );

    assert.equal(vehicleA.tenantId, 'TENANT_A');

    // 租户 A 可正常查到自己的车
    const foundByA = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => repo.findById('veh_001')
    );
    assert.ok(foundByA);
    assert.equal(foundByA!.id, 'veh_001');

    // 租户 B 尝试查询租户 A 的车 (越权拦截)
    const foundByB = await TenantContext.run(
      { tenantId: 'TENANT_B', userId: 'USER_B' },
      async () => repo.findById('veh_001')
    );
    assert.equal(foundByB, null);

    // 租户 B 尝试按 VIN 查询租户 A 的车
    const foundByVinB = await TenantContext.run(
      { tenantId: 'TENANT_B', userId: 'USER_B' },
      async () => repo.findByVin('VIN_AAA_123')
    );
    assert.equal(foundByVinB, null);

    // 租户 B 尝试删除租户 A 的车
    const deletedByB = await TenantContext.run(
      { tenantId: 'TENANT_B', userId: 'USER_B' },
      async () => repo.delete('veh_001')
    );
    assert.equal(deletedByB, false);

    // 租户 A 的车依旧安然无恙
    const stillExistsInA = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => repo.findById('veh_001')
    );
    assert.ok(stillExistsInA);
  });

  await t.test('3. List queries only return current tenant data', async () => {
    // 租户 B 创建一辆自己的车
    await TenantContext.run(
      { tenantId: 'TENANT_B', userId: 'USER_B' },
      async () => {
        return repo.create({
          id: 'veh_002',
          projectId: 'proj_b',
          vin: 'VIN_BBB_456',
          plateNumber: '粤B22222',
          brandId: 'brand_byd',
          modelId: 'model_han',
          deviceId: 'dev_002',
          status: 'NORMAL',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    );

    const listA = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => repo.findMany()
    );
    assert.equal(listA.length, 1);
    assert.equal(listA[0].id, 'veh_001');

    const listB = await TenantContext.run(
      { tenantId: 'TENANT_B', userId: 'USER_B' },
      async () => repo.findMany()
    );
    assert.equal(listB.length, 1);
    assert.equal(listB[0].id, 'veh_002');
  });
});
