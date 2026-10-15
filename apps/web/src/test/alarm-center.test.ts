import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  AlarmType,
  AlarmLevel,
  AlarmStatus,
  type AlarmRecord,
  type AlarmQueryParams,
  isTerminalAlarmStatus,
  isValidAlarmStatusTransition,
  ALARM_TYPE_METADATA,
  ALARM_LEVEL_METADATA,
  ALARM_STATUS_METADATA,
  calculateAlarmStats,
  filterAlarms,
  SEED_ALARMS,
  isApiError,
} from '../views/alarm/alarm-core.ts';
import {
  fetchAlarmsApi,
  fetchAlarmDetailApi,
  processAlarmApi,
  resetInMemoryAlarms,
  getInMemoryAlarms,
} from '../api/alarm.ts';
import { ApiError } from '../api/client.ts';

describe('Alarm Center Core Domain, State Machine & API Test Suite', () => {
  beforeEach(() => {
    resetInMemoryAlarms();
  });

  describe('1. 8 Alarm Types Completeness & Metadata Specification', () => {
    const REQUIRED_ALARM_TYPES = [
      AlarmType.LOW_BATTERY,
      AlarmType.VIBRATION,
      AlarmType.OVERSPEED,
      AlarmType.POWER_CUT,
      AlarmType.SOS,
      AlarmType.TOW_AWAY,
      AlarmType.GEOFENCE_IN,
      AlarmType.GEOFENCE_OUT,
    ];

    it('contains all 8 required vehicle alarm types', () => {
      assert.equal(REQUIRED_ALARM_TYPES.length, 8);
      for (const type of REQUIRED_ALARM_TYPES) {
        assert.ok(type, `Alarm type ${type} must be defined`);
      }
    });

    it('provides comprehensive metadata for every one of the 8 alarm types', () => {
      for (const type of REQUIRED_ALARM_TYPES) {
        const meta = ALARM_TYPE_METADATA[type];
        assert.ok(meta, `Metadata for alarm type [${type}] must exist`);
        assert.ok(meta.label && meta.label.length > 0, `Type [${type}] must have a non-empty label`);
        assert.ok(meta.icon && meta.icon.length > 0, `Type [${type}] must have an icon`);
        assert.ok(meta.tagColor && meta.tagColor.length > 0, `Type [${type}] must have a tagColor`);
        assert.ok(
          [AlarmLevel.INFO, AlarmLevel.WARNING, AlarmLevel.CRITICAL].includes(meta.defaultLevel),
          `Type [${type}] must have a valid defaultLevel`
        );
        assert.ok(meta.guide && meta.guide.length > 5, `Type [${type}] must have an operational guide`);
      }
    });

    it('defines 3 alarm levels (INFO, WARNING, CRITICAL) with colors and tags', () => {
      const levels = [AlarmLevel.INFO, AlarmLevel.WARNING, AlarmLevel.CRITICAL];
      for (const lvl of levels) {
        const meta = ALARM_LEVEL_METADATA[lvl];
        assert.ok(meta, `Level [${lvl}] metadata must exist`);
        assert.ok(meta.label, `Level [${lvl}] must have label`);
        assert.ok(meta.color, `Level [${lvl}] must have color`);
        assert.ok(meta.tagColor, `Level [${lvl}] must have tagColor`);
      }
    });

    it('defines 3 alarm statuses (PENDING, PROCESSED, IGNORED) with labels and badges', () => {
      const statuses = [AlarmStatus.PENDING, AlarmStatus.PROCESSED, AlarmStatus.IGNORED];
      for (const st of statuses) {
        const meta = ALARM_STATUS_METADATA[st];
        assert.ok(meta, `Status [${st}] metadata must exist`);
        assert.ok(meta.label, `Status [${st}] must have label`);
        assert.ok(meta.badgeStatus, `Status [${st}] must have badgeStatus`);
      }
    });
  });

  describe('2. Terminal State Protection & State Machine Invariant', () => {
    it('accurately identifies PROCESSED and IGNORED as absolute terminal states', () => {
      assert.equal(isTerminalAlarmStatus(AlarmStatus.PENDING), false);
      assert.equal(isTerminalAlarmStatus(AlarmStatus.PROCESSED), true);
      assert.equal(isTerminalAlarmStatus(AlarmStatus.IGNORED), true);
    });

    it('permits valid transitions only from PENDING to PROCESSED or IGNORED', () => {
      assert.equal(isValidAlarmStatusTransition(AlarmStatus.PENDING, AlarmStatus.PROCESSED), true);
      assert.equal(isValidAlarmStatusTransition(AlarmStatus.PENDING, AlarmStatus.IGNORED), true);
    });

    it('strictly prohibits backwards or cross-terminal transitions from PROCESSED', () => {
      assert.equal(isValidAlarmStatusTransition(AlarmStatus.PROCESSED, AlarmStatus.PENDING), false);
      assert.equal(isValidAlarmStatusTransition(AlarmStatus.PROCESSED, AlarmStatus.IGNORED), false);
      assert.equal(isValidAlarmStatusTransition(AlarmStatus.PROCESSED, AlarmStatus.PROCESSED), false);
    });

    it('strictly prohibits backwards or cross-terminal transitions from IGNORED', () => {
      assert.equal(isValidAlarmStatusTransition(AlarmStatus.IGNORED, AlarmStatus.PENDING), false);
      assert.equal(isValidAlarmStatusTransition(AlarmStatus.IGNORED, AlarmStatus.PROCESSED), false);
      assert.equal(isValidAlarmStatusTransition(AlarmStatus.IGNORED, AlarmStatus.IGNORED), false);
    });
  });

  describe('3. Statistics Calculation (calculateAlarmStats)', () => {
    it('safely handles empty alarm list without throwing or producing NaN', () => {
      const stats = calculateAlarmStats([]);
      assert.deepEqual(stats, {
        total: 0,
        pending: 0,
        processed: 0,
        ignored: 0,
        criticalCount: 0,
        warningCount: 0,
        infoCount: 0,
        processRate: 0,
        todayCount: 0,
      });
    });

    it('accurately computes summary metrics for mixed records', () => {
      const sampleAlarms: AlarmRecord[] = [
        {
          id: 'test-1',
          tenantId: 't-1',
          projectId: 'p-1',
          vehicleId: 'v-1',
          deviceNo: 'DEV-01',
          alarmType: AlarmType.SOS,
          alarmLevel: AlarmLevel.CRITICAL,
          status: AlarmStatus.PENDING,
          triggeredAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'test-2',
          tenantId: 't-1',
          projectId: 'p-1',
          vehicleId: 'v-2',
          deviceNo: 'DEV-02',
          alarmType: AlarmType.LOW_BATTERY,
          alarmLevel: AlarmLevel.WARNING,
          status: AlarmStatus.PROCESSED,
          triggeredAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'test-3',
          tenantId: 't-1',
          projectId: 'p-1',
          vehicleId: 'v-3',
          deviceNo: 'DEV-03',
          alarmType: AlarmType.OVERSPEED,
          alarmLevel: AlarmLevel.INFO,
          status: AlarmStatus.IGNORED,
          triggeredAt: '2026-01-01T00:00:00Z',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 'test-4',
          tenantId: 't-1',
          projectId: 'p-1',
          vehicleId: 'v-4',
          deviceNo: 'DEV-04',
          alarmType: AlarmType.POWER_CUT,
          alarmLevel: AlarmLevel.CRITICAL,
          status: AlarmStatus.PROCESSED,
          triggeredAt: '2026-01-01T00:00:00Z',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ];

      const stats = calculateAlarmStats(sampleAlarms);
      assert.equal(stats.total, 4);
      assert.equal(stats.pending, 1);
      assert.equal(stats.processed, 2);
      assert.equal(stats.ignored, 1);
      assert.equal(stats.criticalCount, 2);
      assert.equal(stats.warningCount, 1);
      assert.equal(stats.infoCount, 1);
      // Process rate: (2 processed + 1 ignored) / 4 = 75.0%
      assert.equal(stats.processRate, 75);
      assert.equal(stats.todayCount, 2);
    });

    it('calculates 100% processRate when all alarms are in terminal status', () => {
      const records: AlarmRecord[] = [
        {
          id: 'test-1',
          tenantId: 't-1',
          projectId: 'p-1',
          vehicleId: 'v-1',
          deviceNo: 'DEV-01',
          alarmType: AlarmType.VIBRATION,
          alarmLevel: AlarmLevel.WARNING,
          status: AlarmStatus.PROCESSED,
          triggeredAt: '2026-10-10T00:00:00Z',
          createdAt: '2026-10-10T00:00:00Z',
          updatedAt: '2026-10-10T00:00:00Z',
        },
        {
          id: 'test-2',
          tenantId: 't-1',
          projectId: 'p-1',
          vehicleId: 'v-2',
          deviceNo: 'DEV-02',
          alarmType: AlarmType.TOW_AWAY,
          alarmLevel: AlarmLevel.CRITICAL,
          status: AlarmStatus.IGNORED,
          triggeredAt: '2026-10-10T00:00:00Z',
          createdAt: '2026-10-10T00:00:00Z',
          updatedAt: '2026-10-10T00:00:00Z',
        },
      ];
      const stats = calculateAlarmStats(records);
      assert.equal(stats.processRate, 100);
      assert.equal(stats.pending, 0);
    });
  });

  describe('4. Multi-dimensional Filtering (filterAlarms)', () => {
    it('filters alarms by keyword across plate, vin, deviceNo, message, and operator', () => {
      const resultsByPlate = filterAlarms(SEED_ALARMS, { keyword: '粤B·F10293' });
      assert.ok(resultsByPlate.length >= 1);
      assert.ok(resultsByPlate.every((a) => a.plateNumber?.includes('粤B·F10293') || a.vin?.includes('粤B·F10293')));

      const resultsByVin = filterAlarms(SEED_ALARMS, { keyword: 'LSVAA2180E2034912' });
      assert.ok(resultsByVin.length >= 1);
      assert.equal(resultsByVin[0].vin, 'LSVAA2180E2034912');

      const resultsByDevice = filterAlarms(SEED_ALARMS, { keyword: 'TBOX-SZ-001' });
      assert.ok(resultsByDevice.length >= 1);
      assert.equal(resultsByDevice[0].deviceNo, 'TBOX-SZ-001');
    });

    it('filters alarms by specific alarmType', () => {
      const sosAlarms = filterAlarms(SEED_ALARMS, { alarmType: AlarmType.SOS });
      assert.ok(sosAlarms.length >= 1);
      assert.ok(sosAlarms.every((a) => a.alarmType === AlarmType.SOS));
    });

    it('filters alarms by alarmLevel', () => {
      const criticalAlarms = filterAlarms(SEED_ALARMS, { alarmLevel: AlarmLevel.CRITICAL });
      assert.ok(criticalAlarms.length >= 1);
      assert.ok(criticalAlarms.every((a) => a.alarmLevel === AlarmLevel.CRITICAL));
    });

    it('filters alarms by status', () => {
      const pendingAlarms = filterAlarms(SEED_ALARMS, { status: AlarmStatus.PENDING });
      assert.ok(pendingAlarms.length >= 1);
      assert.ok(pendingAlarms.every((a) => a.status === AlarmStatus.PENDING));

      const processedAlarms = filterAlarms(SEED_ALARMS, { status: AlarmStatus.PROCESSED });
      assert.ok(processedAlarms.length >= 1);
      assert.ok(processedAlarms.every((a) => a.status === AlarmStatus.PROCESSED));
    });

    it('filters alarms by date range', () => {
      const filtered = filterAlarms(SEED_ALARMS, {
        startDate: '2026-10-15T00:00:00Z',
        endDate: '2026-10-15T23:59:59Z',
      });
      assert.ok(filtered.length >= 1);
      for (const item of filtered) {
        const time = new Date(item.triggeredAt).getTime();
        assert.ok(time >= new Date('2026-10-15T00:00:00Z').getTime());
        assert.ok(time <= new Date('2026-10-15T23:59:59Z').getTime());
      }
    });
  });

  describe('5. High-Fidelity Seed Alarms Completeness (SEED_ALARMS)', () => {
    it('contains at least 12 realistic alarm records', () => {
      assert.ok(SEED_ALARMS.length >= 12, `Expected >= 12 seed alarms, got ${SEED_ALARMS.length}`);
    });

    it('covers all 8 alarm types across the seed dataset', () => {
      const presentTypes = new Set(SEED_ALARMS.map((a) => a.alarmType));
      const requiredTypes = Object.values(AlarmType);
      for (const type of requiredTypes) {
        assert.ok(presentTypes.has(type), `Seed dataset must contain alarm type ${type}`);
      }
    });

    it('covers all 3 alarm statuses (PENDING, PROCESSED, IGNORED)', () => {
      const presentStatuses = new Set(SEED_ALARMS.map((a) => a.status));
      assert.ok(presentStatuses.has(AlarmStatus.PENDING), 'Must contain PENDING alarms');
      assert.ok(presentStatuses.has(AlarmStatus.PROCESSED), 'Must contain PROCESSED alarms');
      assert.ok(presentStatuses.has(AlarmStatus.IGNORED), 'Must contain IGNORED alarms');
    });

    it('ensures each seed record has complete vehicle, telemetry and coordinate context', () => {
      for (const alarm of SEED_ALARMS) {
        assert.ok(alarm.id, 'alarm.id must exist');
        assert.ok(alarm.vehicleId, 'alarm.vehicleId must exist');
        assert.ok(alarm.deviceNo, 'alarm.deviceNo must exist');
        assert.ok(alarm.plateNumber, 'alarm.plateNumber must exist');
        assert.ok(alarm.vin && alarm.vin.length === 17, 'alarm.vin must be valid 17-char string');
        assert.ok(alarm.triggeredAt, 'alarm.triggeredAt must exist');
        if (alarm.status === AlarmStatus.PROCESSED || alarm.status === AlarmStatus.IGNORED) {
          assert.ok(alarm.processedAt, `Terminal alarm ${alarm.id} must have processedAt`);
          assert.ok(alarm.processedBy, `Terminal alarm ${alarm.id} must have processedBy`);
          assert.ok(alarm.remark, `Terminal alarm ${alarm.id} must have remark`);
        }
      }
    });
  });

  describe('6. REST API Client & Offline In-Memory Fallback Suite', () => {
    it('fetchAlarmsApi returns alarms and supports query filtering', async () => {
      const allAlarms = await fetchAlarmsApi();
      assert.ok(Array.isArray(allAlarms));
      assert.ok(allAlarms.length >= 12);

      const pendingList = await fetchAlarmsApi({ status: AlarmStatus.PENDING });
      assert.ok(pendingList.every((a) => a.status === AlarmStatus.PENDING));
    });

    it('fetchAlarmDetailApi returns single record or throws 404 ApiError', async () => {
      const targetId = SEED_ALARMS[0].id;
      const detail = await fetchAlarmDetailApi(targetId);
      assert.equal(detail.id, targetId);

      await assert.rejects(
        async () => {
          await fetchAlarmDetailApi('non-existent-id');
        },
        (err: unknown) => {
          assert.ok(isApiError(err));
          assert.equal((err as ApiError).statusCode, 404);
          return true;
        }
      );
    });

    it('processAlarmApi updates PENDING alarm to PROCESSED with remark and operator', async () => {
      // Find a pending alarm
      const currentList = getInMemoryAlarms();
      const pendingAlarm = currentList.find((a) => a.status === AlarmStatus.PENDING)!;
      assert.ok(pendingAlarm, 'A pending alarm must exist');

      const result = await processAlarmApi(pendingAlarm.id, {
        status: AlarmStatus.PROCESSED,
        remark: '已电话联系车主，确认系误触SOS按键，车辆处于安全停放状态。',
        operatorId: 'admin-tester',
      });

      assert.equal(result.id, pendingAlarm.id);
      assert.equal(result.status, AlarmStatus.PROCESSED);
      assert.equal(result.remark, '已电话联系车主，确认系误触SOS按键，车辆处于安全停放状态。');
      assert.equal(result.processedBy, 'admin-tester');
      assert.ok(result.processedAt, 'processedAt must be populated');

      // Verify state pool was updated
      const updatedInPool = getInMemoryAlarms().find((a) => a.id === pendingAlarm.id)!;
      assert.equal(updatedInPool.status, AlarmStatus.PROCESSED);
    });

    it('processAlarmApi updates PENDING alarm to IGNORED with audit trail', async () => {
      const currentList = getInMemoryAlarms();
      const pendingAlarm = currentList.find((a) => a.status === AlarmStatus.PENDING)!;
      assert.ok(pendingAlarm, 'A pending alarm must exist');

      const result = await processAlarmApi(pendingAlarm.id, {
        status: AlarmStatus.IGNORED,
        remark: '经调取路口监控排查，为施工路段正常颠簸导致的震动误报，判定忽略。',
        operatorId: 'ops-lead',
      });

      assert.equal(result.status, AlarmStatus.IGNORED);
      assert.equal(result.remark, '经调取路口监控排查，为施工路段正常颠簸导致的震动误报，判定忽略。');
      assert.equal(result.processedBy, 'ops-lead');
    });

    it('processAlarmApi strictly rejects terminal state mutation with 400 ApiError', async () => {
      const currentList = getInMemoryAlarms();
      const terminalAlarm = currentList.find((a) => a.status === AlarmStatus.PROCESSED)!;
      assert.ok(terminalAlarm, 'A processed alarm must exist');

      await assert.rejects(
        async () => {
          await processAlarmApi(terminalAlarm.id, {
            status: AlarmStatus.IGNORED,
            remark: '尝试对已处理告警进行二次篡改',
          });
        },
        (err: unknown) => {
          assert.ok(isApiError(err));
          assert.equal((err as ApiError).statusCode, 400);
          assert.ok((err as Error).message.includes('终态'));
          return true;
        }
      );
    });

    it('processAlarmApi validates remark length (2~200 chars)', async () => {
      const currentList = getInMemoryAlarms();
      const pendingAlarm = currentList.find((a) => a.status === AlarmStatus.PENDING)!;

      // Too short (< 2 chars)
      await assert.rejects(
        async () => {
          await processAlarmApi(pendingAlarm.id, {
            status: AlarmStatus.PROCESSED,
            remark: '1',
          });
        },
        (err: unknown) => {
          assert.ok(isApiError(err));
          assert.equal((err as ApiError).statusCode, 400);
          return true;
        }
      );

      // Too long (> 200 chars)
      const longRemark = '超长备注内容'.repeat(40); // 240 chars
      await assert.rejects(
        async () => {
          await processAlarmApi(pendingAlarm.id, {
            status: AlarmStatus.PROCESSED,
            remark: longRemark,
          });
        },
        (err: unknown) => {
          assert.ok(isApiError(err));
          assert.equal((err as ApiError).statusCode, 400);
          return true;
        }
      );
    });
  });
});
