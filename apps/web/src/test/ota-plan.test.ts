import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  UpgradeMode,
  ScheduleType,
  OtaPlanStatus,
  type OtaSafetyPreconditions,
  type OtaExecutionConfig,
  type OtaPlanDto,
  type CreateOtaPlanInput,
  type OtaPlanQueryParams,
  UPGRADE_MODE_METADATA,
  SCHEDULE_TYPE_METADATA,
  OTA_PLAN_STATUS_METADATA,
  validatePlanBasicInfo,
  validateSafetyPreconditions,
  validateExecutionConfig,
  isVehicleModelCompatible,
  filterEligibleVehicles,
  isValidPlanStatusTransition,
  isTerminalPlanStatus,
  SEED_OTA_PLANS,
} from '../views/ota/ota-plan-core.ts';
import {
  FirmwareType,
  FirmwareStatus,
  type FirmwarePackageDto,
  SEED_FIRMWARE_PACKAGES,
} from '../views/ota/firmware-core.ts';
import {
  type VehicleDto,
  SEED_VEHICLES,
} from '../views/vehicle/vehicle-core.ts';
import {
  fetchOtaPlansApi,
  fetchOtaPlanDetailApi,
  createOtaPlanApi,
  cancelOtaPlanApi,
  pauseOtaPlanApi,
  resumeOtaPlanApi,
  resetInMemoryOtaPlans,
  getInMemoryOtaPlans,
} from '../api/ota-plan.ts';
import { ApiError } from '../api/client.ts';

describe('OTA Batch Upgrade Planning Wizard Core Domain, State Machine & API Test Suite', () => {
  beforeEach(() => {
    resetInMemoryOtaPlans();
  });

  describe('1. UpgradeMode, ScheduleType & OtaPlanStatus Domain Models & Metadata', () => {
    it('defines UpgradeMode (SILENT vs USER_CONFIRM) with labels and tags', () => {
      assert.equal(UpgradeMode.SILENT, 'SILENT');
      assert.equal(UpgradeMode.USER_CONFIRM, 'USER_CONFIRM');

      const silentMeta = UPGRADE_MODE_METADATA[UpgradeMode.SILENT];
      assert.ok(silentMeta, 'SILENT metadata must exist');
      assert.ok(silentMeta.label.includes('静默'));
      assert.ok(silentMeta.tagColor);
      assert.ok(silentMeta.description);

      const confirmMeta = UPGRADE_MODE_METADATA[UpgradeMode.USER_CONFIRM];
      assert.ok(confirmMeta, 'USER_CONFIRM metadata must exist');
      assert.ok(confirmMeta.label.includes('确认'));
      assert.ok(confirmMeta.tagColor);
      assert.ok(confirmMeta.description);
    });

    it('defines ScheduleType (IMMEDIATE vs SCHEDULED) with descriptions', () => {
      assert.equal(ScheduleType.IMMEDIATE, 'IMMEDIATE');
      assert.equal(ScheduleType.SCHEDULED, 'SCHEDULED');

      const immMeta = SCHEDULE_TYPE_METADATA[ScheduleType.IMMEDIATE];
      assert.ok(immMeta.label.includes('立即'));
      const schMeta = SCHEDULE_TYPE_METADATA[ScheduleType.SCHEDULED];
      assert.ok(schMeta.label.includes('定时') || schMeta.label.includes('预约'));
    });

    it('defines all 6 OtaPlanStatus values with badges, colors and descriptions', () => {
      const statuses = [
        OtaPlanStatus.DRAFT,
        OtaPlanStatus.SCHEDULED,
        OtaPlanStatus.RUNNING,
        OtaPlanStatus.PAUSED,
        OtaPlanStatus.COMPLETED,
        OtaPlanStatus.ABORTED,
      ];

      assert.equal(statuses.length, 6);
      for (const st of statuses) {
        const meta = OTA_PLAN_STATUS_METADATA[st];
        assert.ok(meta, `Status [${st}] metadata must exist`);
        assert.ok(meta.label && meta.label.length > 0);
        assert.ok(meta.color);
        assert.ok(meta.badgeStatus);
        assert.ok(meta.description);
      }
    });
  });

  describe('2. Validation Rules (Basic Info, Safety Preconditions, Execution Config)', () => {
    const publishedFirmware: FirmwarePackageDto = {
      id: 'fw-tbox-241',
      name: 'T-Box 5G双频高精定位通信终端固件',
      firmwareType: FirmwareType.TBOX,
      version: 'v2.4.1',
      fileSize: 16567808,
      fileSizeFormatted: '15.8 MB',
      sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      applicableModelIds: ['model-et7', 'model-es8'],
      applicableModelNames: ['蔚来 ET7 2024款', '蔚来 ES8 旗舰版'],
      status: FirmwareStatus.PUBLISHED,
      releaseNotes: '升级测试',
      uploadedBy: '系统架构师_王工',
      createdAt: '2026-09-15T08:20:00Z',
      updatedAt: '2026-09-18T10:30:00Z',
    };

    const draftFirmware: FirmwarePackageDto = {
      ...publishedFirmware,
      id: 'fw-draft-001',
      status: FirmwareStatus.DRAFT,
    };

    describe('validatePlanBasicInfo', () => {
      it('accepts valid name (2~50 chars) with published firmware', () => {
        const res = validatePlanBasicInfo({
          name: '2026 Q4 全系 T-Box 固件升级计划',
          firmware: publishedFirmware,
        });
        assert.equal(res.valid, true);
        assert.equal(Object.keys(res.errors).length, 0);
      });

      it('rejects missing or empty plan name', () => {
        const res1 = validatePlanBasicInfo({ name: '', firmware: publishedFirmware });
        assert.equal(res1.valid, false);
        assert.ok(res1.errors.name);

        const res2 = validatePlanBasicInfo({ name: ' ', firmware: publishedFirmware });
        assert.equal(res2.valid, false);
        assert.ok(res2.errors.name);
      });

      it('rejects plan name with length < 2 or > 50 chars', () => {
        const resShort = validatePlanBasicInfo({ name: 'A', firmware: publishedFirmware });
        assert.equal(resShort.valid, false);
        assert.ok(resShort.errors.name.includes('2'));

        const resLong = validatePlanBasicInfo({
          name: 'A'.repeat(51),
          firmware: publishedFirmware,
        });
        assert.equal(resLong.valid, false);
        assert.ok(resLong.errors.name.includes('50'));
      });

      it('rejects missing firmware or non-published firmware (e.g. DRAFT)', () => {
        const resNoFw = validatePlanBasicInfo({
          name: '合法升级计划名称',
          firmware: null,
        });
        assert.equal(resNoFw.valid, false);
        assert.ok(resNoFw.errors.firmware);

        const resDraftFw = validatePlanBasicInfo({
          name: '合法升级计划名称',
          firmware: draftFirmware,
        });
        assert.equal(resDraftFw.valid, false);
        assert.ok(resDraftFw.errors.firmware.includes('PUBLISHED'));
      });
    });

    describe('validateSafetyPreconditions', () => {
      it('accepts compliant safety settings (minBatterySoc in 20~80, requireStationary=true)', () => {
        const pre: OtaSafetyPreconditions = {
          minBatterySoc: 30,
          requireStationary: true,
          requireNotCharging: false,
        };
        const res = validateSafetyPreconditions(pre);
        assert.equal(res.valid, true);
        assert.equal(Object.keys(res.errors).length, 0);
      });

      it('rejects minBatterySoc outside 20~80 range', () => {
        const lowRes = validateSafetyPreconditions({
          minBatterySoc: 15,
          requireStationary: true,
        });
        assert.equal(lowRes.valid, false);
        assert.ok(lowRes.errors.minBatterySoc.includes('20%'));

        const highRes = validateSafetyPreconditions({
          minBatterySoc: 85,
          requireStationary: true,
        });
        assert.equal(highRes.valid, false);
        assert.ok(highRes.errors.minBatterySoc.includes('80%'));
      });

      it('strictly requires requireStationary to be true to prevent in-motion flashing', () => {
        const inMotionRes = validateSafetyPreconditions({
          minBatterySoc: 30,
          requireStationary: false,
        });
        assert.equal(inMotionRes.valid, false);
        assert.ok(inMotionRes.errors.requireStationary);
        assert.ok(inMotionRes.errors.requireStationary.includes('静止'));
      });
    });

    describe('validateExecutionConfig', () => {
      it('accepts standard execution config (positive timeouts, retries 0~3, threshold 1~20%)', () => {
        const cfg: OtaExecutionConfig = {
          downloadTimeoutMin: 30,
          installTimeoutMin: 45,
          maxRetries: 2,
          failureThresholdPercent: 5,
        };
        const res = validateExecutionConfig(cfg);
        assert.equal(res.valid, true);
        assert.equal(Object.keys(res.errors).length, 0);
      });

      it('rejects zero or negative timeouts', () => {
        const res1 = validateExecutionConfig({
          downloadTimeoutMin: 0,
          installTimeoutMin: 45,
          maxRetries: 1,
          failureThresholdPercent: 5,
        });
        assert.equal(res1.valid, false);
        assert.ok(res1.errors.downloadTimeoutMin);

        const res2 = validateExecutionConfig({
          downloadTimeoutMin: 30,
          installTimeoutMin: -10,
          maxRetries: 1,
          failureThresholdPercent: 5,
        });
        assert.equal(res2.valid, false);
        assert.ok(res2.errors.installTimeoutMin);
      });

      it('rejects maxRetries outside 0~3 or non-integer', () => {
        const resNegative = validateExecutionConfig({
          downloadTimeoutMin: 30,
          installTimeoutMin: 45,
          maxRetries: -1,
          failureThresholdPercent: 5,
        });
        assert.equal(resNegative.valid, false);
        assert.ok(resNegative.errors.maxRetries);

        const resOver = validateExecutionConfig({
          downloadTimeoutMin: 30,
          installTimeoutMin: 45,
          maxRetries: 4,
          failureThresholdPercent: 5,
        });
        assert.equal(resOver.valid, false);
        assert.ok(resOver.errors.maxRetries);
      });

      it('rejects failureThresholdPercent outside 1%~20%', () => {
        const resZero = validateExecutionConfig({
          downloadTimeoutMin: 30,
          installTimeoutMin: 45,
          maxRetries: 2,
          failureThresholdPercent: 0,
        });
        assert.equal(resZero.valid, false);
        assert.ok(resZero.errors.failureThresholdPercent);

        const resHigh = validateExecutionConfig({
          downloadTimeoutMin: 30,
          installTimeoutMin: 45,
          maxRetries: 2,
          failureThresholdPercent: 25,
        });
        assert.equal(resHigh.valid, false);
        assert.ok(resHigh.errors.failureThresholdPercent);
      });
    });
  });

  describe('3. Vehicle Eligibility & Model Compatibility Filtering', () => {
    const testFirmware: FirmwarePackageDto = {
      id: 'fw-tbox-241',
      name: 'T-Box 5G双频高精定位通信终端固件',
      firmwareType: FirmwareType.TBOX,
      version: 'v2.4.1',
      fileSize: 16567808,
      fileSizeFormatted: '15.8 MB',
      sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      applicableModelIds: ['model-et7', 'model-es8'],
      applicableModelNames: ['蔚来 ET7 2024款', '蔚来 ES8 旗舰版'],
      status: FirmwareStatus.PUBLISHED,
      releaseNotes: '升级测试',
      uploadedBy: '系统架构师_王工',
      createdAt: '2026-09-15T08:20:00Z',
      updatedAt: '2026-09-18T10:30:00Z',
    };

    const mockVehicles: VehicleDto[] = [
      {
        id: 'veh-compat-1',
        vin: 'LFPH2E023N1000001',
        plateNumber: '粤B·D12345',
        projectId: 'proj-gz-01',
        brandId: 'brand-nio',
        modelId: 'model-et7',
        modelName: '蔚来 ET7 2024款',
        deviceOnlineStatus: 'ONLINE',
        status: 'NORMAL',
        telemetry: { speed: 0, fuelOrBatteryLevel: 85 },
      },
      {
        id: 'veh-compat-2',
        vin: 'LFPH2E023N1000002',
        plateNumber: '粤B·D67890',
        projectId: 'proj-gz-01',
        brandId: 'brand-nio',
        modelId: 'model-es8',
        modelName: '蔚来 ES8 旗舰版',
        deviceOnlineStatus: 'OFFLINE',
        status: 'NORMAL',
        telemetry: { speed: 0, fuelOrBatteryLevel: 45 },
      },
      {
        id: 'veh-incompat-3',
        vin: 'LFPH2E023N1000003',
        plateNumber: '粤B·D99999',
        projectId: 'proj-gz-01',
        brandId: 'brand-byd',
        modelId: 'model-han-ev',
        modelName: '比亚迪 汉EV 智尊版',
        deviceOnlineStatus: 'ONLINE',
        status: 'NORMAL',
        telemetry: { speed: 0, fuelOrBatteryLevel: 75 },
      },
    ];

    it('identifies compatible vehicle models by id or name', () => {
      assert.equal(isVehicleModelCompatible(mockVehicles[0], testFirmware), true);
      assert.equal(isVehicleModelCompatible(mockVehicles[1], testFirmware), true);
      assert.equal(isVehicleModelCompatible(mockVehicles[2], testFirmware), false);
    });

    it('treats firmware with empty applicableModelIds as universal', () => {
      const universalFw: FirmwarePackageDto = {
        ...testFirmware,
        applicableModelIds: [],
        applicableModelNames: [],
      };
      assert.equal(isVehicleModelCompatible(mockVehicles[2], universalFw), true);
    });

    it('filters eligible vehicles by firmware models and optional query criteria', () => {
      const matched = filterEligibleVehicles(mockVehicles, testFirmware);
      assert.equal(matched.length, 2);
      assert.equal(matched[0].id, 'veh-compat-1');
      assert.equal(matched[1].id, 'veh-compat-2');

      // Test keyword filter
      const kwMatched = filterEligibleVehicles(mockVehicles, testFirmware, { keyword: '12345' });
      assert.equal(kwMatched.length, 1);
      assert.equal(kwMatched[0].id, 'veh-compat-1');

      // Test onlyOnline filter
      const onlineMatched = filterEligibleVehicles(mockVehicles, testFirmware, { onlyOnline: true });
      assert.equal(onlineMatched.length, 1);
      assert.equal(onlineMatched[0].id, 'veh-compat-1');
    });
  });

  describe('4. Lifecycle State Transition Guard (isValidPlanStatusTransition)', () => {
    it('allows valid forward transitions from DRAFT and SCHEDULED', () => {
      assert.equal(isValidPlanStatusTransition(OtaPlanStatus.DRAFT, OtaPlanStatus.SCHEDULED), true);
      assert.equal(isValidPlanStatusTransition(OtaPlanStatus.DRAFT, OtaPlanStatus.RUNNING), true);
      assert.equal(isValidPlanStatusTransition(OtaPlanStatus.DRAFT, OtaPlanStatus.ABORTED), true);

      assert.equal(isValidPlanStatusTransition(OtaPlanStatus.SCHEDULED, OtaPlanStatus.RUNNING), true);
      assert.equal(isValidPlanStatusTransition(OtaPlanStatus.SCHEDULED, OtaPlanStatus.ABORTED), true);
    });

    it('allows pausing, resuming and completing from RUNNING', () => {
      assert.equal(isValidPlanStatusTransition(OtaPlanStatus.RUNNING, OtaPlanStatus.PAUSED), true);
      assert.equal(isValidPlanStatusTransition(OtaPlanStatus.RUNNING, OtaPlanStatus.COMPLETED), true);
      assert.equal(isValidPlanStatusTransition(OtaPlanStatus.RUNNING, OtaPlanStatus.ABORTED), true);

      assert.equal(isValidPlanStatusTransition(OtaPlanStatus.PAUSED, OtaPlanStatus.RUNNING), true);
      assert.equal(isValidPlanStatusTransition(OtaPlanStatus.PAUSED, OtaPlanStatus.ABORTED), true);
    });

    it('strictly guards COMPLETED and ABORTED as terminal irreversible states', () => {
      assert.equal(isTerminalPlanStatus(OtaPlanStatus.COMPLETED), true);
      assert.equal(isTerminalPlanStatus(OtaPlanStatus.ABORTED), true);
      assert.equal(isTerminalPlanStatus(OtaPlanStatus.RUNNING), false);

      assert.equal(isValidPlanStatusTransition(OtaPlanStatus.COMPLETED, OtaPlanStatus.RUNNING), false);
      assert.equal(isValidPlanStatusTransition(OtaPlanStatus.COMPLETED, OtaPlanStatus.DRAFT), false);
      assert.equal(isValidPlanStatusTransition(OtaPlanStatus.ABORTED, OtaPlanStatus.RUNNING), false);
      assert.equal(isValidPlanStatusTransition(OtaPlanStatus.ABORTED, OtaPlanStatus.DRAFT), false);
    });

    it('rejects transition to the exact same state', () => {
      assert.equal(isValidPlanStatusTransition(OtaPlanStatus.RUNNING, OtaPlanStatus.RUNNING), false);
      assert.equal(isValidPlanStatusTransition(OtaPlanStatus.DRAFT, OtaPlanStatus.DRAFT), false);
    });
  });

  describe('5. Seed Production OTA Plans (SEED_OTA_PLANS)', () => {
    it('contains at least 4 realistic production plans covering key statuses', () => {
      assert.ok(SEED_OTA_PLANS.length >= 4);
      const statuses = new Set(SEED_OTA_PLANS.map((p) => p.status));
      assert.ok(statuses.has(OtaPlanStatus.RUNNING), 'Must have RUNNING seed');
      assert.ok(statuses.has(OtaPlanStatus.SCHEDULED), 'Must have SCHEDULED seed');
      assert.ok(statuses.has(OtaPlanStatus.COMPLETED), 'Must have COMPLETED seed');
      assert.ok(statuses.has(OtaPlanStatus.ABORTED), 'Must have ABORTED seed');
    });

    it('ensures each seed plan adheres to schema and valid configurations', () => {
      for (const plan of SEED_OTA_PLANS) {
        assert.ok(plan.id, 'Plan id required');
        assert.ok(plan.name && plan.name.length >= 2, 'Plan name valid length');
        assert.ok(plan.firmwareId, 'Firmware id required');
        assert.ok(plan.targetVehicleIds.length > 0, 'Target vehicles must be specified');
        assert.equal(plan.targetVehicleCount, plan.targetVehicleIds.length);

        const safeCheck = validateSafetyPreconditions(plan.safetyPreconditions);
        assert.equal(safeCheck.valid, true, `Safety preconditions invalid for plan ${plan.id}`);

        const cfgCheck = validateExecutionConfig(plan.executionConfig);
        assert.equal(cfgCheck.valid, true, `Execution config invalid for plan ${plan.id}`);
      }
    });
  });

  describe('6. API Client Integration & In-Memory Offline State Mutations', () => {
    it('fetchOtaPlansApi retrieves all seed plans and filters by keyword and status', async () => {
      const all = await fetchOtaPlansApi();
      assert.equal(all.length, SEED_OTA_PLANS.length);

      const runningList = await fetchOtaPlansApi({ status: OtaPlanStatus.RUNNING });
      assert.ok(runningList.length >= 1);
      assert.ok(runningList.every((p) => p.status === OtaPlanStatus.RUNNING));

      const kwList = await fetchOtaPlansApi({ keyword: 'T-Box' });
      assert.ok(kwList.length >= 1);
      assert.ok(kwList.every((p) => p.name.includes('T-Box') || p.firmwareName.includes('T-Box')));
    });

    it('fetchOtaPlanDetailApi retrieves single plan or throws error for non-existent', async () => {
      const firstSeed = SEED_OTA_PLANS[0];
      const detail = await fetchOtaPlanDetailApi(firstSeed.id);
      assert.equal(detail.id, firstSeed.id);
      assert.equal(detail.name, firstSeed.name);

      await assert.rejects(
        async () => {
          await fetchOtaPlanDetailApi('non-existent-plan-id');
        },
        (err: any) => {
          return err.message.includes('未找到') || err.message.includes('不存在');
        }
      );
    });

    it('createOtaPlanApi validates input, saves plan to pool, and returns created DTO', async () => {
      const newPlanInput: CreateOtaPlanInput = {
        name: '测试批量部署计划 20261015',
        firmwareId: 'fw-tbox-241',
        upgradeMode: UpgradeMode.SILENT,
        scheduleType: ScheduleType.IMMEDIATE,
        safetyPreconditions: {
          minBatterySoc: 35,
          requireStationary: true,
          requireNotCharging: true,
        },
        executionConfig: {
          downloadTimeoutMin: 25,
          installTimeoutMin: 40,
          maxRetries: 2,
          failureThresholdPercent: 5,
        },
        targetVehicleIds: ['veh-001', 'veh-002'],
      };

      const created = await createOtaPlanApi(newPlanInput);
      assert.ok(created.id);
      assert.equal(created.name, newPlanInput.name);
      assert.equal(created.targetVehicleCount, 2);
      assert.equal(created.status, OtaPlanStatus.RUNNING); // IMMEDIATE plans transition to RUNNING

      // Verify in-memory persistence
      const all = await fetchOtaPlansApi();
      const found = all.find((p) => p.id === created.id);
      assert.ok(found);
      assert.equal(found?.name, newPlanInput.name);
    });

    it('pauseOtaPlanApi and resumeOtaPlanApi toggle RUNNING and PAUSED states', async () => {
      const runningPlan = SEED_OTA_PLANS.find((p) => p.status === OtaPlanStatus.RUNNING);
      assert.ok(runningPlan);

      const paused = await pauseOtaPlanApi(runningPlan.id);
      assert.equal(paused.status, OtaPlanStatus.PAUSED);

      const resumed = await resumeOtaPlanApi(runningPlan.id);
      assert.equal(resumed.status, OtaPlanStatus.RUNNING);
    });

    it('cancelOtaPlanApi aborts an active plan with reason and guards terminal plans', async () => {
      const scheduledPlan = SEED_OTA_PLANS.find((p) => p.status === OtaPlanStatus.SCHEDULED);
      assert.ok(scheduledPlan);

      const aborted = await cancelOtaPlanApi(scheduledPlan.id, '运维人员手动紧急取消');
      assert.equal(aborted.status, OtaPlanStatus.ABORTED);
      assert.equal(aborted.abortReason, '运维人员手动紧急取消');

      // Attempting to cancel already aborted plan should fail
      await assert.rejects(
        async () => {
          await cancelOtaPlanApi(scheduledPlan.id, '再次取消');
        },
        (err: any) => err.message.includes('不可流转') || err.message.includes('终态')
      );
    });
  });
});
