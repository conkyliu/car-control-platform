import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  OtaVehicleTaskStatus,
  OTA_VEHICLE_TASK_STATUS_METADATA,
  type OtaVehicleTaskRecord,
  type OtaPlanSummary,
  type OtaPlanDetailDto,
  calculatePlanTaskSummary,
  calculateGlobalOtaStats,
  filterVehicleTasks,
  isValidVehicleTaskStatusTransition,
  SEED_OTA_PLAN_DETAILS,
} from '../views/ota/ota-dashboard-core.ts';
import {
  fetchOtaPlanExecutionDetailApi,
  retryFailedVehiclesApi,
  retrySingleVehicleTaskApi,
  subscribeRealtimeOtaProgress,
  getInMemoryOtaPlanDetails,
  resetInMemoryOtaPlanDetails,
  setInMemoryOtaPlanDetails,
} from '../api/ota-dashboard.ts';
import { SEED_OTA_PLANS, OtaPlanStatus } from '../views/ota/ota-plan-core.ts';
import { ApiError } from '../api/client.ts';

describe('OTA Batch Execution Dashboard Core Domain, Calculation & API Test Suite', () => {
  beforeEach(() => {
    resetInMemoryOtaPlanDetails();
  });

  describe('1. OtaVehicleTaskStatus Enum & Metadata Dictionary', () => {
    it('defines all 7 vehicle upgrade task lifecycle statuses', () => {
      assert.equal(OtaVehicleTaskStatus.PENDING, 'PENDING');
      assert.equal(OtaVehicleTaskStatus.DOWNLOADING, 'DOWNLOADING');
      assert.equal(OtaVehicleTaskStatus.DOWNLOADED, 'DOWNLOADED');
      assert.equal(OtaVehicleTaskStatus.UPGRADING, 'UPGRADING');
      assert.equal(OtaVehicleTaskStatus.SUCCESS, 'SUCCESS');
      assert.equal(OtaVehicleTaskStatus.FAILED, 'FAILED');
      assert.equal(OtaVehicleTaskStatus.CANCELLED, 'CANCELLED');
    });

    it('contains comprehensive metadata for all statuses with labels, tags, and badge statuses', () => {
      const statuses = Object.values(OtaVehicleTaskStatus);
      assert.equal(statuses.length, 7);

      for (const st of statuses) {
        const meta = OTA_VEHICLE_TASK_STATUS_METADATA[st];
        assert.ok(meta, `Metadata for status [${st}] must exist`);
        assert.equal(meta.status, st);
        assert.ok(meta.label && meta.label.length > 0);
        assert.ok(meta.color);
        assert.ok(meta.tagColor);
        assert.ok(meta.badgeStatus);
        assert.ok(meta.description);
      }
    });

    it('maps semantic colors conforming to design tokens', () => {
      assert.equal(OTA_VEHICLE_TASK_STATUS_METADATA[OtaVehicleTaskStatus.SUCCESS].badgeStatus, 'success');
      assert.equal(OTA_VEHICLE_TASK_STATUS_METADATA[OtaVehicleTaskStatus.FAILED].badgeStatus, 'error');
      assert.equal(OTA_VEHICLE_TASK_STATUS_METADATA[OtaVehicleTaskStatus.DOWNLOADING].badgeStatus, 'processing');
      assert.equal(OTA_VEHICLE_TASK_STATUS_METADATA[OtaVehicleTaskStatus.UPGRADING].badgeStatus, 'warning');
    });
  });

  describe('2. State Machine Transitions (isValidVehicleTaskStatusTransition)', () => {
    it('allows valid progressive lifecycle transitions', () => {
      assert.equal(
        isValidVehicleTaskStatusTransition(OtaVehicleTaskStatus.PENDING, OtaVehicleTaskStatus.DOWNLOADING),
        true
      );
      assert.equal(
        isValidVehicleTaskStatusTransition(OtaVehicleTaskStatus.DOWNLOADING, OtaVehicleTaskStatus.DOWNLOADED),
        true
      );
      assert.equal(
        isValidVehicleTaskStatusTransition(OtaVehicleTaskStatus.DOWNLOADED, OtaVehicleTaskStatus.UPGRADING),
        true
      );
      assert.equal(
        isValidVehicleTaskStatusTransition(OtaVehicleTaskStatus.UPGRADING, OtaVehicleTaskStatus.SUCCESS),
        true
      );
    });

    it('allows transitions to FAILED or CANCELLED from executing stages', () => {
      assert.equal(
        isValidVehicleTaskStatusTransition(OtaVehicleTaskStatus.DOWNLOADING, OtaVehicleTaskStatus.FAILED),
        true
      );
      assert.equal(
        isValidVehicleTaskStatusTransition(OtaVehicleTaskStatus.UPGRADING, OtaVehicleTaskStatus.FAILED),
        true
      );
      assert.equal(
        isValidVehicleTaskStatusTransition(OtaVehicleTaskStatus.PENDING, OtaVehicleTaskStatus.CANCELLED),
        true
      );
      assert.equal(
        isValidVehicleTaskStatusTransition(OtaVehicleTaskStatus.DOWNLOADING, OtaVehicleTaskStatus.CANCELLED),
        true
      );
      assert.equal(
        isValidVehicleTaskStatusTransition(OtaVehicleTaskStatus.UPGRADING, OtaVehicleTaskStatus.CANCELLED),
        true
      );
    });

    it('allows retry from FAILED back to PENDING or DOWNLOADING', () => {
      assert.equal(
        isValidVehicleTaskStatusTransition(OtaVehicleTaskStatus.FAILED, OtaVehicleTaskStatus.PENDING),
        true
      );
      assert.equal(
        isValidVehicleTaskStatusTransition(OtaVehicleTaskStatus.FAILED, OtaVehicleTaskStatus.DOWNLOADING),
        true
      );
      assert.equal(
        isValidVehicleTaskStatusTransition(OtaVehicleTaskStatus.FAILED, OtaVehicleTaskStatus.CANCELLED),
        true
      );
    });

    it('strictly guards SUCCESS and CANCELLED as terminal states', () => {
      assert.equal(
        isValidVehicleTaskStatusTransition(OtaVehicleTaskStatus.SUCCESS, OtaVehicleTaskStatus.FAILED),
        false
      );
      assert.equal(
        isValidVehicleTaskStatusTransition(OtaVehicleTaskStatus.SUCCESS, OtaVehicleTaskStatus.PENDING),
        false
      );
      assert.equal(
        isValidVehicleTaskStatusTransition(OtaVehicleTaskStatus.CANCELLED, OtaVehicleTaskStatus.PENDING),
        false
      );
      assert.equal(
        isValidVehicleTaskStatusTransition(OtaVehicleTaskStatus.CANCELLED, OtaVehicleTaskStatus.DOWNLOADING),
        false
      );
    });

    it('rejects invalid jumps', () => {
      assert.equal(
        isValidVehicleTaskStatusTransition(OtaVehicleTaskStatus.PENDING, OtaVehicleTaskStatus.SUCCESS),
        false
      );
      assert.equal(
        isValidVehicleTaskStatusTransition(OtaVehicleTaskStatus.PENDING, OtaVehicleTaskStatus.UPGRADING),
        false
      );
    });
  });

  describe('3. Summary Metrics & Circuit Breaker Logic (calculatePlanTaskSummary)', () => {
    it('returns zeroed stats when task list is empty', () => {
      const summary = calculatePlanTaskSummary([]);
      assert.equal(summary.totalVehicles, 0);
      assert.equal(summary.successCount, 0);
      assert.equal(summary.failedCount, 0);
      assert.equal(summary.successRate, 0);
      assert.equal(summary.failureRate, 0);
      assert.equal(summary.overallProgress, 0);
      assert.equal(summary.isCircuitBreakerTriggered, false);
    });

    it('accurately counts each stage and computes rates', () => {
      const mockTasks: Partial<OtaVehicleTaskRecord>[] = [
        { id: '1', status: OtaVehicleTaskStatus.SUCCESS, totalProgress: 100 },
        { id: '2', status: OtaVehicleTaskStatus.SUCCESS, totalProgress: 100 },
        { id: '3', status: OtaVehicleTaskStatus.UPGRADING, totalProgress: 75 },
        { id: '4', status: OtaVehicleTaskStatus.DOWNLOADING, totalProgress: 40 },
        { id: '5', status: OtaVehicleTaskStatus.PENDING, totalProgress: 0 },
      ];

      const summary = calculatePlanTaskSummary(mockTasks as OtaVehicleTaskRecord[]);
      assert.equal(summary.totalVehicles, 5);
      assert.equal(summary.successCount, 2);
      assert.equal(summary.upgradingCount, 1);
      assert.equal(summary.downloadingCount, 1);
      assert.equal(summary.pendingCount, 1);
      assert.equal(summary.failedCount, 0);
      assert.equal(summary.successRate, 40.0);
      assert.equal(summary.failureRate, 0.0);
      assert.equal(summary.overallProgress, 63); // (100 + 100 + 75 + 40 + 0) / 5 = 63%
      assert.equal(summary.isCircuitBreakerTriggered, false);
    });

    it('triggers circuit breaker when failureRate >= failureThresholdPercent (default 5%)', () => {
      // 20 vehicles, 1 failed => 5.0% failure rate => triggers 5% threshold
      const tasks: Partial<OtaVehicleTaskRecord>[] = [
        { id: 'f-1', status: OtaVehicleTaskStatus.FAILED, totalProgress: 30 },
        ...Array.from({ length: 19 }, (_, i) => ({
          id: `s-${i}`,
          status: OtaVehicleTaskStatus.SUCCESS,
          totalProgress: 100,
        })),
      ];

      const summary = calculatePlanTaskSummary(tasks as OtaVehicleTaskRecord[], 5);
      assert.equal(summary.totalVehicles, 20);
      assert.equal(summary.failedCount, 1);
      assert.equal(summary.failureRate, 5.0);
      assert.equal(summary.isCircuitBreakerTriggered, true);
    });

    it('does not trigger circuit breaker when failureRate is strictly below threshold', () => {
      // 25 vehicles, 1 failed => 4.0% failure rate => below 5.0% threshold
      const tasks: Partial<OtaVehicleTaskRecord>[] = [
        { id: 'f-1', status: OtaVehicleTaskStatus.FAILED, totalProgress: 20 },
        ...Array.from({ length: 24 }, (_, i) => ({
          id: `s-${i}`,
          status: OtaVehicleTaskStatus.SUCCESS,
          totalProgress: 100,
        })),
      ];

      const summary = calculatePlanTaskSummary(tasks as OtaVehicleTaskRecord[], 5);
      assert.equal(summary.totalVehicles, 25);
      assert.equal(summary.failedCount, 1);
      assert.equal(summary.failureRate, 4.0);
      assert.equal(summary.isCircuitBreakerTriggered, false);
    });

    it('supports custom failure threshold percentage', () => {
      // 10 vehicles, 1 failed => 10.0% failure rate
      const tasks: Partial<OtaVehicleTaskRecord>[] = [
        { id: 'f-1', status: OtaVehicleTaskStatus.FAILED, totalProgress: 10 },
        ...Array.from({ length: 9 }, (_, i) => ({
          id: `s-${i}`,
          status: OtaVehicleTaskStatus.SUCCESS,
          totalProgress: 100,
        })),
      ];

      // Threshold = 15% -> not triggered
      const s1 = calculatePlanTaskSummary(tasks as OtaVehicleTaskRecord[], 15);
      assert.equal(s1.failureRate, 10.0);
      assert.equal(s1.isCircuitBreakerTriggered, false);

      // Threshold = 8% -> triggered
      const s2 = calculatePlanTaskSummary(tasks as OtaVehicleTaskRecord[], 8);
      assert.equal(s2.isCircuitBreakerTriggered, true);
    });
  });

  describe('4. Global OTA KPI Calculation (calculateGlobalOtaStats)', () => {
    it('aggregates cross-plan metrics correctly', () => {
      const stats = calculateGlobalOtaStats(SEED_OTA_PLANS);
      assert.ok(stats.activePlansCount >= 1, 'Should count active plans');
      assert.ok(stats.totalVehiclesCovered > 0, 'Should tally covered vehicles');
      assert.ok(typeof stats.globalSuccessRate === 'number');
      assert.ok(stats.circuitBreakerAlertCount >= 1, 'Should detect aborted/breaker plans in seeds');
    });
  });

  describe('5. Task Multi-dimensional Filtering (filterVehicleTasks)', () => {
    const mockTasks: OtaVehicleTaskRecord[] = [
      {
        id: 't-1',
        planId: 'p-1',
        vehicleId: 'v-1',
        plateNumber: '粤B·D12345',
        vin: 'LFPH2E023N1000001',
        modelName: '极氪 001',
        currentVersion: 'v2.3.0',
        targetVersion: 'v2.4.1',
        status: OtaVehicleTaskStatus.DOWNLOADING,
        downloadProgress: 60,
        installProgress: 0,
        totalProgress: 30,
        retries: 0,
        maxRetries: 2,
      },
      {
        id: 't-2',
        planId: 'p-1',
        vehicleId: 'v-2',
        plateNumber: '沪A·98765D',
        vin: 'LFPH2E023N1000002',
        modelName: '汉 EV',
        currentVersion: 'v2.3.0',
        targetVersion: 'v2.4.1',
        status: OtaVehicleTaskStatus.FAILED,
        downloadProgress: 100,
        installProgress: 45,
        totalProgress: 72,
        retries: 1,
        maxRetries: 2,
        errorCode: 'ERR_ECU_FLASH_CRC',
        errorMessage: 'ECU 烧录校验 CRC 校验不匹配',
      },
      {
        id: 't-3',
        planId: 'p-1',
        vehicleId: 'v-3',
        plateNumber: '京A·66888',
        vin: 'LFPH2E023N1000003',
        modelName: 'Model Y',
        currentVersion: 'v2.3.0',
        targetVersion: 'v2.4.1',
        status: OtaVehicleTaskStatus.SUCCESS,
        downloadProgress: 100,
        installProgress: 100,
        totalProgress: 100,
        retries: 0,
        maxRetries: 2,
      },
    ];

    it('filters by plate number or vin keyword', () => {
      const byPlate = filterVehicleTasks(mockTasks, { keyword: '粤B' });
      assert.equal(byPlate.length, 1);
      assert.equal(byPlate[0].plateNumber, '粤B·D12345');

      const byVin = filterVehicleTasks(mockTasks, { keyword: '1000002' });
      assert.equal(byVin.length, 1);
      assert.equal(byVin[0].vin, 'LFPH2E023N1000002');
    });

    it('filters by status', () => {
      const failed = filterVehicleTasks(mockTasks, { status: OtaVehicleTaskStatus.FAILED });
      assert.equal(failed.length, 1);
      assert.equal(failed[0].id, 't-2');
    });

    it('filters by errorCode', () => {
      const filtered = filterVehicleTasks(mockTasks, { errorCode: 'FLASH_CRC' });
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].errorCode, 'ERR_ECU_FLASH_CRC');
    });

    it('returns all when query is empty or ALL', () => {
      const res = filterVehicleTasks(mockTasks, { status: 'ALL', keyword: '' });
      assert.equal(res.length, 3);
    });
  });

  describe('6. Seed Dataset Integrity (SEED_OTA_PLAN_DETAILS)', () => {
    it('provides seed detail for all 4 seed plans', () => {
      const planIds = SEED_OTA_PLANS.map((p) => p.id);
      for (const pid of planIds) {
        const detail = SEED_OTA_PLAN_DETAILS[pid];
        assert.ok(detail, `Detail for seed plan [${pid}] must exist`);
        assert.ok(detail.plan);
        assert.ok(detail.summary);
        assert.ok(Array.isArray(detail.vehicleTasks));
        assert.equal(detail.vehicleTasks.length, detail.plan.targetVehicleCount);
      }
    });

    it('ensures plan-bms-202609-04 has circuit breaker triggered', () => {
      const breakerPlan = SEED_OTA_PLAN_DETAILS['plan-bms-202609-04'];
      assert.ok(breakerPlan);
      assert.ok(breakerPlan.summary.failureRate >= 5.0);
      assert.equal(breakerPlan.summary.isCircuitBreakerTriggered, true);
      assert.ok(breakerPlan.vehicleTasks.some((t) => t.status === OtaVehicleTaskStatus.FAILED));
    });

    it('ensures vehicle tasks have detailed step logs for drawer display', () => {
      const runningPlan = SEED_OTA_PLAN_DETAILS['plan-tbox-202610-01'];
      const taskWithLogs = runningPlan.vehicleTasks.find((t) => t.logs && t.logs.length > 0);
      assert.ok(taskWithLogs, 'At least one task should include execution logs');
      assert.ok(taskWithLogs.logs![0].action);
      assert.ok(taskWithLogs.logs![0].timestamp);
    });
  });

  describe('7. API Client Methods & Offline Fallback (api/ota-dashboard.ts)', () => {
    it('fetchOtaPlanExecutionDetailApi retrieves plan detail DTO', async () => {
      const detail = await fetchOtaPlanExecutionDetailApi('plan-tbox-202610-01');
      assert.ok(detail);
      assert.equal(detail.plan.id, 'plan-tbox-202610-01');
      assert.ok(detail.summary.totalVehicles > 0);
      assert.ok(detail.vehicleTasks.length > 0);
    });

    it('fetchOtaPlanExecutionDetailApi throws 404 ApiError on unknown planId', async () => {
      await assert.rejects(
        async () => {
          await fetchOtaPlanExecutionDetailApi('unknown-plan-999');
        },
        (err: any) => {
          assert.equal(err.statusCode, 404);
          return true;
        }
      );
    });

    it('retrySingleVehicleTaskApi resets failed task to PENDING and recalculates summary', async () => {
      const planId = 'plan-bms-202609-04';
      const detailBefore = await fetchOtaPlanExecutionDetailApi(planId);
      const failedTask = detailBefore.vehicleTasks.find((t) => t.status === OtaVehicleTaskStatus.FAILED);
      assert.ok(failedTask, 'Failed task must exist in breaker plan');

      const initialRetries = failedTask.retries;
      const updatedTask = await retrySingleVehicleTaskApi(planId, failedTask.id);

      assert.equal(updatedTask.id, failedTask.id);
      assert.equal(updatedTask.status, OtaVehicleTaskStatus.PENDING);
      assert.equal(updatedTask.retries, initialRetries + 1);
      assert.equal(updatedTask.errorCode, undefined);
      assert.equal(updatedTask.errorMessage, undefined);

      // Verify that the plan detail in memory was refreshed and summary updated
      const detailAfter = await fetchOtaPlanExecutionDetailApi(planId);
      const refreshedTask = detailAfter.vehicleTasks.find((t) => t.id === failedTask.id);
      assert.equal(refreshedTask?.status, OtaVehicleTaskStatus.PENDING);
      assert.equal(detailAfter.summary.failedCount, detailBefore.summary.failedCount - 1);
    });

    it('retrySingleVehicleTaskApi throws 400 ApiError when task is not FAILED', async () => {
      const planId = 'plan-mcu-202609-03';
      const detail = await fetchOtaPlanExecutionDetailApi(planId);
      const successTask = detail.vehicleTasks.find((t) => t.status === OtaVehicleTaskStatus.SUCCESS);
      assert.ok(successTask);

      await assert.rejects(
        async () => {
          await retrySingleVehicleTaskApi(planId, successTask.id);
        },
        (err: any) => {
          assert.equal(err.statusCode, 400);
          return true;
        }
      );
    });

    it('retryFailedVehiclesApi retries all failed tasks in a plan', async () => {
      const planId = 'plan-bms-202609-04';
      const updatedDetail = await retryFailedVehiclesApi(planId);

      assert.equal(updatedDetail.summary.failedCount, 0);
      assert.equal(updatedDetail.summary.failureRate, 0);
      assert.equal(updatedDetail.summary.isCircuitBreakerTriggered, false);
      assert.ok(
        updatedDetail.vehicleTasks.every((t) => t.status !== OtaVehicleTaskStatus.FAILED),
        'All failed tasks should have been reset to PENDING'
      );
    });

    it('subscribeRealtimeOtaProgress returns an unsubscribe function and invokes callback', (t, done) => {
      const planId = 'plan-tbox-202610-01';
      let callCount = 0;
      const unsubscribe = subscribeRealtimeOtaProgress(planId, (task) => {
        assert.ok(task);
        assert.equal(task.planId, planId);
        callCount++;
        unsubscribe();
        done();
      });
      assert.equal(typeof unsubscribe, 'function');
    });

    it('resetInMemoryOtaPlanDetails restores original mock state', async () => {
      const planId = 'plan-bms-202609-04';
      await retryFailedVehiclesApi(planId);
      const detailMutated = await fetchOtaPlanExecutionDetailApi(planId);
      assert.equal(detailMutated.summary.failedCount, 0);

      resetInMemoryOtaPlanDetails();
      const detailRestored = await fetchOtaPlanExecutionDetailApi(planId);
      assert.ok(detailRestored.summary.failedCount > 0);
    });
  });
});
