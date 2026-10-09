import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TenantContext,
  FirmwareRepository,
  OtaPlanRepository,
  OtaTaskRepository,
} from '../index.js';
import {
  FirmwareStatus,
  OtaPlanStatus,
  OtaTaskStatus,
  OtaStep,
  OtaTargetType,
  DEFAULT_OTA_PRE_CHECK,
} from '@car-control/contracts';

test('FirmwareRepository Test Suite', async (t) => {
  const repo = new FirmwareRepository();

  await t.test('1. Throws error if operated without TenantContext', async () => {
    await assert.rejects(
      async () => {
        await repo.create({
          name: 'TBox-v1.0.0',
          version: '1.0.0',
          targetModelId: 'MODEL_ALPHA',
          hardwareVersion: 'HW-V1.0',
          fileUrl: 'https://ota.car-control.com/firmwares/v1.0.0.bin',
          fileSizeBytes: 1048576,
          checksumSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        });
      },
      {
        message: /TenantContext required/,
      }
    );
  });

  let fw1Id: string;

  await t.test('2. Creates firmware package and enforces tenant isolation on findById', async () => {
    const fw1 = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => {
        return repo.create({
          name: 'TBox-v1.0.0',
          version: '1.0.0',
          targetModelId: 'MODEL_ALPHA',
          hardwareVersion: 'HW-V1.0',
          fileUrl: 'https://ota.car-control.com/firmwares/v1.0.0.bin',
          fileSizeBytes: 1048576,
          checksumSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          description: 'Initial release',
        });
      }
    );

    assert.ok(fw1.id);
    assert.equal(fw1.tenantId, 'TENANT_A');
    assert.equal(fw1.status, FirmwareStatus.ACTIVE);
    assert.ok(fw1.createdAt);
    fw1Id = fw1.id;

    // Tenant A can find it
    const foundA = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => repo.findById(fw1Id)
    );
    assert.ok(foundA);
    assert.equal(foundA?.version, '1.0.0');

    // Tenant B cannot find it
    const foundB = await TenantContext.run(
      { tenantId: 'TENANT_B', userId: 'USER_B' },
      async () => repo.findById(fw1Id)
    );
    assert.equal(foundB, null);
  });

  await t.test('3. findByVersion and duplicate version protection', async () => {
    // Tenant A finds by version and model
    const found = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => repo.findByVersion('1.0.0', 'MODEL_ALPHA')
    );
    assert.ok(found);
    assert.equal(found?.id, fw1Id);

    // Not found with different model
    const notFound = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => repo.findByVersion('1.0.0', 'MODEL_BETA')
    );
    assert.equal(notFound, null);

    // Tenant A cannot create duplicate version for same model
    await assert.rejects(
      async () => {
        await TenantContext.run(
          { tenantId: 'TENANT_A', userId: 'USER_A' },
          async () => {
            return repo.create({
              name: 'TBox-v1.0.0-duplicate',
              version: '1.0.0',
              targetModelId: 'MODEL_ALPHA',
              hardwareVersion: 'HW-V1.0',
              fileUrl: 'https://ota.car-control.com/firmwares/v1.0.0-dup.bin',
              fileSizeBytes: 1048576,
              checksumSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            });
          }
        );
      },
      {
        message: /already exists/,
      }
    );

    // Tenant B CAN create the same version for the same model (multi-tenant isolation)
    const fwTenantB = await TenantContext.run(
      { tenantId: 'TENANT_B', userId: 'USER_B' },
      async () => {
        return repo.create({
          name: 'TBox-v1.0.0-TenantB',
          version: '1.0.0',
          targetModelId: 'MODEL_ALPHA',
          hardwareVersion: 'HW-V1.0',
          fileUrl: 'https://ota.car-control.com/firmwares/v1.0.0-b.bin',
          fileSizeBytes: 1048576,
          checksumSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        });
      }
    );
    assert.ok(fwTenantB.id);
    assert.equal(fwTenantB.tenantId, 'TENANT_B');
  });

  await t.test('4. list with targetModelId and status filters', async () => {
    // Tenant A creates a deprecated package
    await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => {
        return repo.create({
          name: 'TBox-v0.9.0',
          version: '0.9.0',
          targetModelId: 'MODEL_BETA',
          hardwareVersion: 'HW-V1.0',
          fileUrl: 'https://ota.car-control.com/firmwares/v0.9.0.bin',
          fileSizeBytes: 1048576,
          checksumSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          status: FirmwareStatus.DEPRECATED,
        });
      }
    );

    // Tenant A lists all
    const allA = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => repo.list()
    );
    assert.equal(allA.length, 2);

    // Tenant A lists MODEL_ALPHA only
    const modelAlphaList = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => repo.list({ targetModelId: 'MODEL_ALPHA' })
    );
    assert.equal(modelAlphaList.length, 1);
    assert.equal(modelAlphaList[0].version, '1.0.0');

    // Tenant A lists ACTIVE status only
    const activeList = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => repo.list({ status: FirmwareStatus.ACTIVE })
    );
    assert.equal(activeList.length, 1);
    assert.equal(activeList[0].version, '1.0.0');

    // Tenant B lists all (only has 1)
    const allB = await TenantContext.run(
      { tenantId: 'TENANT_B', userId: 'USER_B' },
      async () => repo.list()
    );
    assert.equal(allB.length, 1);
  });
});

test('OtaPlanRepository Test Suite', async (t) => {
  const repo = new OtaPlanRepository();

  await t.test('1. Throws error if operated without TenantContext', async () => {
    await assert.rejects(
      async () => {
        await repo.create({
          name: 'Plan 2026 Q4 Alpha',
          firmwareId: 'fw_001',
          targetType: OtaTargetType.MODEL,
          targetIds: ['MODEL_ALPHA'],
          batchSize: 50,
          batchIntervalSec: 300,
          maxRetries: 3,
          preCheckRequired: DEFAULT_OTA_PRE_CHECK,
        });
      },
      {
        message: /TenantContext required/,
      }
    );
  });

  let planA1Id: string;
  let planA2Id: string;

  await t.test('2. Creates plan and enforces tenant isolation', async () => {
    const planA1 = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => {
        return repo.create({
          name: 'Plan 2026 Q4 Alpha',
          firmwareId: 'fw_001',
          targetType: OtaTargetType.MODEL,
          targetIds: ['MODEL_ALPHA'],
          batchSize: 50,
          batchIntervalSec: 300,
          maxRetries: 3,
          preCheckRequired: DEFAULT_OTA_PRE_CHECK,
          totalDevices: 100,
        });
      }
    );

    assert.ok(planA1.id);
    assert.equal(planA1.tenantId, 'TENANT_A');
    assert.equal(planA1.status, OtaPlanStatus.DRAFT);
    assert.equal(planA1.totalDevices, 100);
    assert.equal(planA1.successDevices, 0);
    assert.equal(planA1.failedDevices, 0);
    planA1Id = planA1.id;

    const planA2 = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => {
        return repo.create({
          name: 'Plan 2026 Q4 Beta',
          firmwareId: 'fw_002',
          targetType: OtaTargetType.MODEL,
          targetIds: ['MODEL_BETA'],
          batchSize: 20,
          batchIntervalSec: 120,
          maxRetries: 2,
          preCheckRequired: DEFAULT_OTA_PRE_CHECK,
        });
      }
    );
    planA2Id = planA2.id;

    // Tenant A finds planA1
    const foundA = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => repo.findById(planA1Id)
    );
    assert.ok(foundA);
    assert.equal(foundA?.id, planA1Id);

    // Tenant B cannot find planA1
    const foundB = await TenantContext.run(
      { tenantId: 'TENANT_B', userId: 'USER_B' },
      async () => repo.findById(planA1Id)
    );
    assert.equal(foundB, null);
  });

  await t.test('3. list with filters and tenant isolation', async () => {
    // Tenant B creates a plan
    await TenantContext.run(
      { tenantId: 'TENANT_B', userId: 'USER_B' },
      async () => {
        return repo.create({
          name: 'Plan Tenant B',
          firmwareId: 'fw_001',
          targetType: OtaTargetType.ALL,
          targetIds: [],
          batchSize: 10,
          batchIntervalSec: 60,
          maxRetries: 1,
          preCheckRequired: DEFAULT_OTA_PRE_CHECK,
        });
      }
    );

    // Tenant A lists all
    const listA = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => repo.list()
    );
    assert.equal(listA.length, 2);

    // Tenant A lists by firmwareId
    const listAFw1 = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => repo.list({ firmwareId: 'fw_001' })
    );
    assert.equal(listAFw1.length, 1);
    assert.equal(listAFw1[0].id, planA1Id);

    // Tenant B lists all
    const listB = await TenantContext.run(
      { tenantId: 'TENANT_B', userId: 'USER_B' },
      async () => repo.list()
    );
    assert.equal(listB.length, 1);
  });

  await t.test('4. updateStatus transitions and terminal state enforcement', async () => {
    // DRAFT -> SCHEDULED
    const scheduled = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => repo.updateStatus(planA1Id, OtaPlanStatus.SCHEDULED)
    );
    assert.equal(scheduled.status, OtaPlanStatus.SCHEDULED);

    // SCHEDULED -> EXECUTING
    const executing = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => repo.updateStatus(planA1Id, OtaPlanStatus.EXECUTING)
    );
    assert.equal(executing.status, OtaPlanStatus.EXECUTING);

    // EXECUTING -> PAUSED -> EXECUTING
    await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => repo.updateStatus(planA1Id, OtaPlanStatus.PAUSED)
    );
    await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => repo.updateStatus(planA1Id, OtaPlanStatus.EXECUTING)
    );

    // EXECUTING -> COMPLETED (Terminal)
    const completed = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => repo.updateStatus(planA1Id, OtaPlanStatus.COMPLETED)
    );
    assert.equal(completed.status, OtaPlanStatus.COMPLETED);

    // COMPLETED is terminal: cannot transition to any other status
    await assert.rejects(
      async () => {
        await TenantContext.run(
          { tenantId: 'TENANT_A', userId: 'USER_A' },
          async () => repo.updateStatus(planA1Id, OtaPlanStatus.EXECUTING)
        );
      },
      {
        message: /Invalid OTA plan status transition/,
      }
    );

    // Cross-tenant protection: Tenant B cannot update Tenant A's plan
    await assert.rejects(
      async () => {
        await TenantContext.run(
          { tenantId: 'TENANT_B', userId: 'USER_B' },
          async () => repo.updateStatus(planA2Id, OtaPlanStatus.CANCELLED)
        );
      },
      {
        message: /not found/,
      }
    );

    // Cancel planA2: DRAFT -> CANCELLED (Terminal)
    const cancelled = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => repo.updateStatus(planA2Id, OtaPlanStatus.CANCELLED)
    );
    assert.equal(cancelled.status, OtaPlanStatus.CANCELLED);

    // CANCELLED cannot transition
    await assert.rejects(
      async () => {
        await TenantContext.run(
          { tenantId: 'TENANT_A', userId: 'USER_A' },
          async () => repo.updateStatus(planA2Id, OtaPlanStatus.DRAFT)
        );
      },
      {
        message: /Invalid OTA plan status transition/,
      }
    );
  });

  await t.test('5. updateCounters atomic increments and isolation', async () => {
    const updated = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => repo.updateCounters(planA1Id, { success: 5, failed: 2 })
    );
    assert.equal(updated.successDevices, 5);
    assert.equal(updated.failedDevices, 2);

    const updatedMore = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => repo.updateCounters(planA1Id, { success: 3 })
    );
    assert.equal(updatedMore.successDevices, 8);
    assert.equal(updatedMore.failedDevices, 2);

    // Tenant B cannot update Tenant A counters
    await assert.rejects(
      async () => {
        await TenantContext.run(
          { tenantId: 'TENANT_B', userId: 'USER_B' },
          async () => repo.updateCounters(planA1Id, { success: 1 })
        );
      },
      {
        message: /not found/,
      }
    );
  });
});

test('OtaTaskRepository Test Suite', async (t) => {
  const repo = new OtaTaskRepository();

  await t.test('1. Throws error if operated without TenantContext', async () => {
    await assert.rejects(
      async () => {
        await repo.create({
          planId: 'plan_001',
          vehicleId: 'veh_001',
          deviceNo: 'DEV001',
          firmwareVersion: '1.0.0',
        });
      },
      {
        message: /TenantContext required/,
      }
    );
  });

  let task1Id: string;
  let task2Id: string;

  await t.test('2. Creates task, findByPlanAndDevice and listByPlan with tenant isolation', async () => {
    const task1 = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => {
        return repo.create({
          planId: 'plan_001',
          vehicleId: 'veh_001',
          deviceNo: 'DEV001',
          firmwareVersion: '1.0.0',
        });
      }
    );

    assert.ok(task1.id);
    assert.equal(task1.tenantId, 'TENANT_A');
    assert.equal(task1.status, OtaTaskStatus.QUEUED);
    assert.equal(task1.currentStep, OtaStep.DOWNLOADING);
    assert.equal(task1.progressPercent, 0);
    assert.equal(task1.retryCount, 0);
    task1Id = task1.id;

    const task2 = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => {
        return repo.create({
          planId: 'plan_001',
          vehicleId: 'veh_002',
          deviceNo: 'DEV002',
          firmwareVersion: '1.0.0',
        });
      }
    );
    task2Id = task2.id;

    // Tenant A findByPlanAndDevice
    const foundA = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => repo.findByPlanAndDevice('plan_001', 'DEV001')
    );
    assert.ok(foundA);
    assert.equal(foundA?.id, task1Id);

    // Tenant B cannot find Tenant A task
    const foundB = await TenantContext.run(
      { tenantId: 'TENANT_B', userId: 'USER_B' },
      async () => repo.findByPlanAndDevice('plan_001', 'DEV001')
    );
    assert.equal(foundB, null);

    // Tenant A listByPlan
    const listA = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => repo.listByPlan('plan_001')
    );
    assert.equal(listA.length, 2);

    // Tenant B listByPlan returns empty
    const listB = await TenantContext.run(
      { tenantId: 'TENANT_B', userId: 'USER_B' },
      async () => repo.listByPlan('plan_001')
    );
    assert.equal(listB.length, 0);
  });

  await t.test('3. updateProgress full lifecycle and validation', async () => {
    // QUEUED -> NOTIFIED
    const notified = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => {
        return repo.updateProgress(task1Id, {
          status: OtaTaskStatus.NOTIFIED,
          step: OtaStep.DOWNLOADING,
          percent: 0,
        });
      }
    );
    assert.equal(notified.status, OtaTaskStatus.NOTIFIED);
    assert.ok(notified.notifiedAt);

    // NOTIFIED -> DOWNLOADING (25%)
    const dl25 = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => {
        return repo.updateProgress(task1Id, {
          status: OtaTaskStatus.DOWNLOADING,
          step: OtaStep.DOWNLOADING,
          percent: 25,
        });
      }
    );
    assert.equal(dl25.status, OtaTaskStatus.DOWNLOADING);
    assert.equal(dl25.progressPercent, 25);

    // DOWNLOADING (50%) - same status, progress advancement
    const dl50 = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => {
        return repo.updateProgress(task1Id, {
          status: OtaTaskStatus.DOWNLOADING,
          step: OtaStep.DOWNLOADING,
          percent: 50,
        });
      }
    );
    assert.equal(dl50.status, OtaTaskStatus.DOWNLOADING);
    assert.equal(dl50.progressPercent, 50);

    // DOWNLOADING -> VERIFYING (100%)
    const verifying = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => {
        return repo.updateProgress(task1Id, {
          status: OtaTaskStatus.VERIFYING,
          step: OtaStep.VERIFYING,
          percent: 100,
        });
      }
    );
    assert.equal(verifying.status, OtaTaskStatus.VERIFYING);

    // VERIFYING -> FLASHING (100%)
    const flashing = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => {
        return repo.updateProgress(task1Id, {
          status: OtaTaskStatus.FLASHING,
          step: OtaStep.FLASHING,
          percent: 100,
        });
      }
    );
    assert.equal(flashing.status, OtaTaskStatus.FLASHING);

    // FLASHING -> SUCCESS (Terminal)
    const success = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => {
        return repo.updateProgress(task1Id, {
          status: OtaTaskStatus.SUCCESS,
          step: OtaStep.SUCCESS,
          percent: 100,
        });
      }
    );
    assert.equal(success.status, OtaTaskStatus.SUCCESS);
    assert.ok(success.finishedAt);

    // Terminal state protection: SUCCESS cannot be updated further
    await assert.rejects(
      async () => {
        await TenantContext.run(
          { tenantId: 'TENANT_A', userId: 'USER_A' },
          async () => {
            return repo.updateProgress(task1Id, {
              status: OtaTaskStatus.FAILED,
              step: OtaStep.FAILED,
              percent: 100,
            });
          }
        );
      },
      {
        message: /already in terminal status/,
      }
    );
  });

  await t.test('4. updateProgress failure, terminal protection, and reason tracking', async () => {
    // task2: QUEUED -> SKIPPED_UNSAFE (due to pre-check failure)
    const skipped = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => {
        return repo.updateProgress(task2Id, {
          status: OtaTaskStatus.SKIPPED_UNSAFE,
          step: OtaStep.FAILED,
          percent: 0,
          reason: 'Engine is running',
        });
      }
    );
    assert.equal(skipped.status, OtaTaskStatus.SKIPPED_UNSAFE);
    assert.equal(skipped.failureReason, 'Engine is running');
    assert.ok(skipped.finishedAt);

    // SKIPPED_UNSAFE is terminal: cannot be updated
    await assert.rejects(
      async () => {
        await TenantContext.run(
          { tenantId: 'TENANT_A', userId: 'USER_A' },
          async () => {
            return repo.updateProgress(task2Id, {
              status: OtaTaskStatus.NOTIFIED,
              step: OtaStep.DOWNLOADING,
              percent: 0,
            });
          }
        );
      },
      {
        message: /already in terminal status/,
      }
    );
  });

  await t.test('5. incrementRetry and cross-tenant isolation', async () => {
    // Create task3
    const task3 = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => {
        return repo.create({
          planId: 'plan_002',
          vehicleId: 'veh_003',
          deviceNo: 'DEV003',
          firmwareVersion: '1.0.0',
        });
      }
    );

    assert.equal(task3.retryCount, 0);

    // Increment retry
    const retried1 = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => repo.incrementRetry(task3.id)
    );
    assert.equal(retried1.retryCount, 1);

    const retried2 = await TenantContext.run(
      { tenantId: 'TENANT_A', userId: 'USER_A' },
      async () => repo.incrementRetry(task3.id)
    );
    assert.equal(retried2.retryCount, 2);

    // Tenant B cannot increment Tenant A task retry
    await assert.rejects(
      async () => {
        await TenantContext.run(
          { tenantId: 'TENANT_B', userId: 'USER_B' },
          async () => repo.incrementRetry(task3.id)
        );
      },
      {
        message: /not found/,
      }
    );
  });
});
