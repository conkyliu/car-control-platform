import test from 'node:test';
import assert from 'node:assert/strict';
import { TenantContext, AlarmRepository } from '../index.js';
import { AlarmType, AlarmLevel, AlarmStatus } from '@car-control/contracts';

test('AlarmRepository Test Suite', async (t) => {
  const repo = new AlarmRepository();

  await t.test('1. Throws error if operated without TenantContext', async () => {
    await assert.rejects(
      async () => {
        await repo.create({
          projectId: 'proj_01',
          vehicleId: 'veh_01',
          deviceNo: 'DEV001',
          alarmType: AlarmType.LOW_BATTERY,
          alarmLevel: AlarmLevel.WARNING,
          status: AlarmStatus.PENDING,
          triggeredAt: new Date(),
        } as any);
      },
      {
        message: /TenantContext required/,
      }
    );
  });

  let createdAlarmA1Id: string;
  let createdAlarmA2Id: string;

  await t.test('2. Creates alarm records and enforces tenant isolation on findById', async () => {
    // Create alarm under Tenant A
    const alarmA1 = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => {
        return repo.create({
          projectId: 'proj_01',
          vehicleId: 'veh_001',
          deviceNo: 'DEV001',
          alarmType: AlarmType.LOW_BATTERY,
          alarmLevel: AlarmLevel.WARNING,
          status: AlarmStatus.PENDING,
          message: 'Battery level below 15%',
          triggeredAt: new Date('2026-10-09T10:00:00Z'),
        });
      }
    );

    assert.ok(alarmA1.id);
    assert.equal(alarmA1.tenantId, 'TENANT_A');
    assert.equal(alarmA1.status, AlarmStatus.PENDING);
    createdAlarmA1Id = alarmA1.id;

    // Create second alarm under Tenant A
    const alarmA2 = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => {
        return repo.create({
          projectId: 'proj_01',
          vehicleId: 'veh_002',
          deviceNo: 'DEV002',
          alarmType: AlarmType.OVERSPEED,
          alarmLevel: AlarmLevel.CRITICAL,
          status: AlarmStatus.PENDING,
          message: 'Speed exceeded 120km/h',
          triggeredAt: new Date('2026-10-09T10:05:00Z'),
        });
      }
    );
    createdAlarmA2Id = alarmA2.id;

    // Tenant A finds alarm
    const foundA = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => repo.findById(createdAlarmA1Id)
    );
    assert.ok(foundA);
    assert.equal(foundA?.id, createdAlarmA1Id);

    // Tenant B cannot find Tenant A alarm
    const foundB = await TenantContext.run(
      { tenantId: 'TENANT_B', userId: 'USER_B' },
      async () => repo.findById(createdAlarmA1Id)
    );
    assert.equal(foundB, null);
  });

  await t.test('3. list with filters and tenant isolation', async () => {
    // Tenant B creates an alarm
    await TenantContext.run(
      { tenantId: 'TENANT_B', userId: 'USER_B' },
      async () => {
        return repo.create({
          projectId: 'proj_02',
          vehicleId: 'veh_001', // same vehicleId string but under Tenant B
          deviceNo: 'DEV003',
          alarmType: AlarmType.VIBRATION,
          alarmLevel: AlarmLevel.INFO,
          status: AlarmStatus.PENDING,
          triggeredAt: new Date(),
        });
      }
    );

    // Tenant A list all
    const listA = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => repo.list()
    );
    assert.equal(listA.length, 2);

    // Tenant A list by vehicleId
    const listAVeh1 = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => repo.list({ vehicleId: 'veh_001' })
    );
    assert.equal(listAVeh1.length, 1);
    assert.equal(listAVeh1[0].id, createdAlarmA1Id);

    // Tenant B list all
    const listB = await TenantContext.run(
      { tenantId: 'TENANT_B', userId: 'USER_B' },
      async () => repo.list()
    );
    assert.equal(listB.length, 1);
    assert.equal(listB[0].deviceNo, 'DEV003');
  });

  await t.test('4. updateStatus transitions and terminal state enforcement', async () => {
    // Transition PENDING -> PROCESSED under Tenant A
    const updated = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => {
        return repo.updateStatus(createdAlarmA1Id, AlarmStatus.PROCESSED, 'OP_999', 'Resolved issue');
      }
    );

    assert.equal(updated.status, AlarmStatus.PROCESSED);
    assert.equal(updated.operatorId, 'OP_999');
    assert.equal(updated.remark, 'Resolved issue');
    assert.ok(updated.processedAt);

    // PROCESSED is a terminal state; attempting to update to IGNORED or PENDING must throw
    await assert.rejects(
      async () => {
        await TenantContext.run(
          { tenantId: 'TENANT_A', userId: 'USER_A' },
          async () => repo.updateStatus(createdAlarmA1Id, AlarmStatus.IGNORED, 'OP_999')
        );
      },
      {
        message: /Invalid alarm status transition/,
      }
    );

    await assert.rejects(
      async () => {
        await TenantContext.run(
          { tenantId: 'TENANT_A', userId: 'USER_A' },
          async () => repo.updateStatus(createdAlarmA1Id, AlarmStatus.PENDING, 'OP_999')
        );
      },
      {
        message: /Invalid alarm status transition/,
      }
    );

    // Tenant B cannot update Tenant A's alarm
    await assert.rejects(
      async () => {
        await TenantContext.run(
          { tenantId: 'TENANT_B', userId: 'USER_B' },
          async () => repo.updateStatus(createdAlarmA2Id, AlarmStatus.PROCESSED, 'OP_888')
        );
      },
      {
        message: /not found/,
      }
    );

    // PENDING -> IGNORED transition on alarmA2
    const ignored = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => repo.updateStatus(createdAlarmA2Id, AlarmStatus.IGNORED, 'OP_999', 'False alarm')
    );
    assert.equal(ignored.status, AlarmStatus.IGNORED);

    // IGNORED is also terminal; attempting transition must throw
    await assert.rejects(
      async () => {
        await TenantContext.run(
          { tenantId: 'TENANT_A', userId: 'USER_A' },
          async () => repo.updateStatus(createdAlarmA2Id, AlarmStatus.PROCESSED, 'OP_999')
        );
      },
      {
        message: /Invalid alarm status transition/,
      }
    );
  });
});
