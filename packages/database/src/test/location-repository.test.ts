import test from 'node:test';
import assert from 'node:assert/strict';
import { TenantContext, LocationRepository } from '../index.js';
import { TelemetryLocationPayload } from '@car-control/contracts';

test('LocationRepository Test Suite', async (t) => {
  const repo = new LocationRepository();

  const mockPoint1: TelemetryLocationPayload = {
    lat: 22.5428,
    lng: 114.0596,
    speed: 60.5,
    altitude: 10,
    heading: 90,
    satellites: 12,
    gpsValid: true,
    timestamp: 1696800000000, // T1
  };

  const mockPoint2: TelemetryLocationPayload = {
    lat: 22.5435,
    lng: 114.0602,
    speed: 62.0,
    altitude: 12,
    heading: 95,
    satellites: 14,
    gpsValid: true,
    timestamp: 1696800060000, // T2 = T1 + 60s
  };

  const mockPoint3: TelemetryLocationPayload = {
    lat: 22.5442,
    lng: 114.0610,
    speed: 58.0,
    altitude: 11,
    heading: 100,
    satellites: 13,
    gpsValid: true,
    timestamp: 1696800120000, // T3 = T1 + 120s
  };

  await t.test('1. Throws error if operated without TenantContext', async () => {
    await assert.rejects(
      async () => {
        await repo.saveLocation('veh_001', mockPoint1);
      },
      {
        message: /TenantContext required/,
      }
    );

    await assert.rejects(
      async () => {
        await repo.getLatestLocation('veh_001');
      },
      {
        message: /TenantContext required/,
      }
    );

    await assert.rejects(
      async () => {
        await repo.getTrajectory('veh_001', new Date(1696800000000), new Date(1696800120000));
      },
      {
        message: /TenantContext required/,
      }
    );
  });

  await t.test('2. Saves and retrieves latest location with tenant isolation', async () => {
    // Tenant A saves location
    await TenantContext.run({ tenantId: 'TENANT_A', userId: 'USER_A' }, async () => {
      await repo.saveLocation('veh_001', mockPoint1);
    });

    // Tenant A can retrieve latest location
    const latestA = await TenantContext.run({ tenantId: 'TENANT_A', userId: 'USER_A' }, async () => {
      return repo.getLatestLocation('veh_001');
    });
    assert.ok(latestA);
    assert.equal(latestA?.lat, 22.5428);
    assert.equal(latestA?.timestamp, 1696800000000);

    // Tenant B cannot retrieve Tenant A's latest location
    const latestB = await TenantContext.run({ tenantId: 'TENANT_B', userId: 'USER_B' }, async () => {
      return repo.getLatestLocation('veh_001');
    });
    assert.equal(latestB, null);

    // Tenant A updates with newer location
    await TenantContext.run({ tenantId: 'TENANT_A', userId: 'USER_A' }, async () => {
      await repo.saveLocation('veh_001', mockPoint2);
    });

    const updatedA = await TenantContext.run({ tenantId: 'TENANT_A', userId: 'USER_A' }, async () => {
      return repo.getLatestLocation('veh_001');
    });
    assert.ok(updatedA);
    assert.equal(updatedA?.lat, 22.5435);
    assert.equal(updatedA?.timestamp, 1696800060000);
  });

  await t.test('3. Trajectory history query and time range filtering', async () => {
    // Tenant A saves point 3
    await TenantContext.run({ tenantId: 'TENANT_A', userId: 'USER_A' }, async () => {
      await repo.saveLocation('veh_001', mockPoint3);
    });

    // Query entire range (covers point 1, 2, 3)
    const allPoints = await TenantContext.run({ tenantId: 'TENANT_A', userId: 'USER_A' }, async () => {
      return repo.getTrajectory(
        'veh_001',
        new Date(1696800000000),
        new Date(1696800120000)
      );
    });
    assert.equal(allPoints.length, 3);
    assert.equal(allPoints[0].timestamp, 1696800000000);
    assert.equal(allPoints[1].timestamp, 1696800060000);
    assert.equal(allPoints[2].timestamp, 1696800120000);

    // Partial range query (covers only point 2)
    const partialPoints = await TenantContext.run({ tenantId: 'TENANT_A', userId: 'USER_A' }, async () => {
      return repo.getTrajectory(
        'veh_001',
        new Date(1696800010000),
        new Date(1696800070000)
      );
    });
    assert.equal(partialPoints.length, 1);
    assert.equal(partialPoints[0].timestamp, 1696800060000);

    // Tenant B queries Tenant A vehicle trajectory -> returns empty array
    const pointsForB = await TenantContext.run({ tenantId: 'TENANT_B', userId: 'USER_B' }, async () => {
      return repo.getTrajectory(
        'veh_001',
        new Date(1696800000000),
        new Date(1696800120000)
      );
    });
    assert.equal(pointsForB.length, 0);
  });
});
