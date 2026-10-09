import test from 'node:test';
import assert from 'node:assert/strict';
import { TenantContext, CommunicationLogRepository } from '../index.js';
import { CommunicationDirection, CommunicationChannel } from '@car-control/contracts';

test('CommunicationLogRepository Test Suite', async (t) => {
  const repo = new CommunicationLogRepository();

  await t.test('1. Throws error if operated without TenantContext', async () => {
    await assert.rejects(
      async () => {
        await repo.log({
          deviceNo: 'DEV001',
          direction: CommunicationDirection.UPLINK,
          channel: CommunicationChannel.MQTT,
          topic: 'v1/devices/DEV001/telemetry',
          payload: { test: true },
        } as any);
      },
      {
        message: /TenantContext required/,
      }
    );
  });

  await t.test('2. Records communication log with tenant isolation and auto-generated fields', async () => {
    // Tenant A logs an entry
    const entryA = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => {
        return repo.log({
          vehicleId: 'veh_001',
          deviceNo: 'DEV001',
          traceId: 'trace-111',
          requestId: 'req-111',
          direction: CommunicationDirection.UPLINK,
          channel: CommunicationChannel.MQTT,
          topic: 'v1/devices/DEV001/telemetry',
          payload: { lat: 22.5, lng: 114.0 },
        });
      }
    );

    assert.ok(entryA.id);
    assert.ok(entryA.createdAt instanceof Date);
    assert.equal(entryA.tenantId, 'TENANT_A');
    assert.equal(entryA.vehicleId, 'veh_001');

    // Tenant B logs an entry
    const entryB = await TenantContext.run(
      { tenantId: 'TENANT_B', userId: 'USER_B' },
      async () => {
        return repo.log({
          vehicleId: 'veh_002',
          deviceNo: 'DEV002',
          traceId: 'trace-222',
          direction: CommunicationDirection.DOWNLINK,
          channel: CommunicationChannel.HTTP,
          topic: 'v1/commands/send',
          payload: { command: 'LOCK' },
        });
      }
    );

    assert.equal(entryB.tenantId, 'TENANT_B');

    // Query under Tenant A: sees entryA, doesn't see entryB
    const logsA = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => repo.query()
    );
    assert.equal(logsA.length, 1);
    assert.equal(logsA[0].id, entryA.id);

    // Query under Tenant B: sees entryB, doesn't see entryA
    const logsB = await TenantContext.run(
      { tenantId: 'TENANT_B', userId: 'USER_B' },
      async () => repo.query()
    );
    assert.equal(logsB.length, 1);
    assert.equal(logsB[0].id, entryB.id);
  });

  await t.test('3. Query filtering by vehicleId, deviceNo, and traceId', async () => {
    // Tenant A records additional logs
    await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => {
        await repo.log({
          vehicleId: 'veh_001',
          deviceNo: 'DEV001',
          traceId: 'trace-333',
          direction: CommunicationDirection.DOWNLINK,
          channel: CommunicationChannel.MQTT,
          topic: 'v1/devices/DEV001/cmd',
          payload: { action: 'DOOR_LOCK' },
        });

        await repo.log({
          vehicleId: 'veh_999',
          deviceNo: 'DEV999',
          traceId: 'trace-444',
          direction: CommunicationDirection.UPLINK,
          channel: CommunicationChannel.TCP,
          topic: 'raw/stream',
          payload: { data: 'hello' },
        });
      }
    );

    // Filter by vehicleId = 'veh_001' -> expects 2 logs (trace-111, trace-333)
    const byVeh = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => repo.query({ vehicleId: 'veh_001' })
    );
    assert.equal(byVeh.length, 2);

    // Filter by deviceNo = 'DEV999' -> expects 1 log
    const byDevice = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => repo.query({ deviceNo: 'DEV999' })
    );
    assert.equal(byDevice.length, 1);
    assert.equal(byDevice[0].deviceNo, 'DEV999');

    // Filter by traceId = 'trace-333' -> expects 1 log
    const byTrace = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => repo.query({ traceId: 'trace-333' })
    );
    assert.equal(byTrace.length, 1);
    assert.equal(byTrace[0].traceId, 'trace-333');

    // Filter non-matching criteria -> returns empty array
    const emptyResult = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => repo.query({ traceId: 'non-existent-trace' })
    );
    assert.equal(emptyResult.length, 0);
  });
});
