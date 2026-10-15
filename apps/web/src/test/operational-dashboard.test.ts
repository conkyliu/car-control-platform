import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  type OperationsKpiSummary,
  type HourlyTrendPoint,
  type CommandRankItem,
  type AlarmHourlyDistribution,
  type FleetComposition,
  type DashboardStreamItem,
  type DashboardSnapshotDto,
  calculateKpiSummary,
  aggregateCommandRanking,
  aggregateAlarmHourlyDistribution,
  calculateFleetComposition,
  generateMockRealtimeEvent,
  SEED_DASHBOARD_SNAPSHOT,
  isApiError,
} from '../views/dashboard/dashboard-core.ts';
import {
  fetchDashboardSnapshotApi,
  fetchDashboardRealtimeStreamApi,
  getInMemoryDashboardSnapshot,
  setInMemoryDashboardSnapshot,
  resetInMemoryDashboardSnapshot,
  appendDashboardStreamEvent,
} from '../api/dashboard.ts';
import { ApiError } from '../api/client.ts';
import { RoutePath, getMenuRoutes } from '../router/routes.ts';

describe('Operational Dashboard Cockpit Core & TDD Test Suite', () => {
  beforeEach(() => {
    resetInMemoryDashboardSnapshot();
  });

  describe('1. Production Seed Data Invariants (SEED_DASHBOARD_SNAPSHOT)', () => {
    it('provides comprehensive KPI summary metrics matching operational scale', () => {
      const { kpi } = SEED_DASHBOARD_SNAPSHOT;
      assert.ok(kpi, 'KPI summary must be defined');
      assert.equal(typeof kpi.totalVehicles, 'number');
      assert.equal(typeof kpi.onlineVehicles, 'number');
      assert.equal(typeof kpi.offlineVehicles, 'number');
      assert.equal(kpi.totalVehicles, kpi.onlineVehicles + kpi.offlineVehicles);
      assert.ok(kpi.totalVehicles >= 10000, 'Total fleet scale should be >= 10,000');
      assert.ok(kpi.onlineRate >= 80 && kpi.onlineRate <= 100);
      assert.ok(kpi.todayCommands > 0);
      assert.ok(kpi.commandSuccessRate >= 98 && kpi.commandSuccessRate <= 100);
      assert.ok(kpi.todayAlarms > 0);
      assert.ok(kpi.alarmProcessRate >= 90 && kpi.alarmProcessRate <= 100);
      assert.ok(kpi.alarmCriticalCount >= 0);
      assert.ok(kpi.activeUsers > 0);
      assert.ok(kpi.userActiveRate > 0 && kpi.userActiveRate <= 100);
      assert.ok(kpi.activeOtaPlans > 0);
      assert.ok(kpi.otaUpgradingVehicles > 0);
    });

    it('contains full 24-hour trend series with valid online, moving and idle counts', () => {
      const { hourlyTrend } = SEED_DASHBOARD_SNAPSHOT;
      assert.equal(hourlyTrend.length, 24, 'Hourly trend must contain exactly 24 hours');

      for (let i = 0; i < 24; i++) {
        const expectedHour = String(i).padStart(2, '0');
        const point = hourlyTrend[i]!;
        assert.equal(point.hour, expectedHour);
        assert.ok(point.onlineCount >= point.movingCount + point.idleCount);
        assert.ok(point.onlineRate >= 0 && point.onlineRate <= 100);
      }
    });

    it('contains high-frequency ranking covering all 13 standard car control commands', () => {
      const { commandRanking } = SEED_DASHBOARD_SNAPSHOT;
      assert.equal(commandRanking.length, 13, 'Must contain all 13 standard commands');

      // Verify descending sort order by call count
      for (let i = 0; i < commandRanking.length - 1; i++) {
        assert.ok(
          commandRanking[i]!.count >= commandRanking[i + 1]!.count,
          `Item at ${i} (${commandRanking[i]!.count}) must be >= item at ${i + 1} (${commandRanking[i + 1]!.count})`
        );
      }

      // Verify percentage calculations
      const totalPct = commandRanking.reduce((sum, item) => sum + item.percentage, 0);
      assert.ok(
        Math.abs(totalPct - 100) < 1.0,
        `Total percentage sum should be close to 100, got ${totalPct}`
      );

      for (const item of commandRanking) {
        assert.ok(item.commandCode.length > 0);
        assert.ok(item.commandName.length > 0);
        assert.ok(item.category.length > 0);
        assert.ok(item.categoryLabel.length > 0);
        assert.ok(item.successRate >= 90 && item.successRate <= 100);
      }
    });

    it('contains 24-hour alarm distribution across critical, warning, and info levels', () => {
      const { alarmDistribution } = SEED_DASHBOARD_SNAPSHOT;
      assert.equal(alarmDistribution.length, 24, 'Alarm distribution must have 24 hours');

      let criticalSum = 0;
      let totalSum = 0;

      for (let i = 0; i < 24; i++) {
        const expectedHour = String(i).padStart(2, '0');
        const dist = alarmDistribution[i]!;
        assert.equal(dist.hour, expectedHour);
        assert.equal(dist.total, dist.critical + dist.warning + dist.info);
        criticalSum += dist.critical;
        totalSum += dist.total;
      }

      assert.equal(totalSum, SEED_DASHBOARD_SNAPSHOT.kpi.todayAlarms);
      assert.equal(criticalSum, SEED_DASHBOARD_SNAPSHOT.kpi.alarmCriticalCount);
    });

    it('contains fleet powertrain distribution and top 5 firmware versions', () => {
      const { fleetComposition } = SEED_DASHBOARD_SNAPSHOT;
      const { powertrainDistribution, topFirmwareVersions } = fleetComposition;

      assert.ok(powertrainDistribution.EV > 0);
      assert.ok(powertrainDistribution.PHEV > 0);
      assert.ok(powertrainDistribution.REEV > 0);
      assert.ok(powertrainDistribution.ICE > 0);

      const fleetTotal =
        powertrainDistribution.EV +
        powertrainDistribution.PHEV +
        powertrainDistribution.REEV +
        powertrainDistribution.ICE;
      assert.equal(fleetTotal, SEED_DASHBOARD_SNAPSHOT.kpi.totalVehicles);

      assert.equal(topFirmwareVersions.length, 5);
      const versionPctSum = topFirmwareVersions.reduce((acc, v) => acc + v.percentage, 0);
      assert.ok(Math.abs(versionPctSum - 100) < 1.0);
    });

    it('contains realtime operations stream items with valid types and target routes', () => {
      const { realtimeStream } = SEED_DASHBOARD_SNAPSHOT;
      assert.ok(realtimeStream.length >= 6);

      const validTypes = new Set(['COMMAND', 'ALARM', 'OTA', 'VEHICLE']);
      const validLevels = new Set(['INFO', 'WARNING', 'CRITICAL']);

      for (const item of realtimeStream) {
        assert.ok(item.id.length > 0);
        assert.ok(item.timestamp.length > 0);
        assert.ok(item.timestampFormatted.length > 0);
        assert.ok(validTypes.has(item.type));
        assert.ok(validLevels.has(item.level));
        assert.ok(item.title.length > 0);
        assert.ok(item.content.length > 0);
        if (item.targetRoute) {
          assert.ok(item.targetRoute.startsWith('/'));
        }
      }
    });
  });

  describe('2. KPI Math Aggregation & Zero-Division Defense (calculateKpiSummary)', () => {
    it('calculates metrics accurately from input vehicle and event collections', () => {
      const vehicles = [
        { deviceOnlineStatus: 'ONLINE' },
        { deviceOnlineStatus: 'ONLINE' },
        { deviceOnlineStatus: 'ONLINE' },
        { deviceOnlineStatus: 'OFFLINE' },
      ];
      const commands = [
        { status: 'SUCCESS' },
        { status: 'SUCCESS' },
        { status: 'FAILED' },
      ];
      const alarms = [
        { status: 'PROCESSED', alarmLevel: 'CRITICAL' },
        { status: 'IGNORED', alarmLevel: 'WARNING' },
        { status: 'PENDING', alarmLevel: 'INFO' },
        { status: 'PENDING', alarmLevel: 'CRITICAL' },
      ];
      const otaPlans = [
        { status: 'IN_PROGRESS', upgradingVehicles: 15 },
        { status: 'PAUSED', upgradingVehicles: 5 },
        { status: 'COMPLETED', upgradingVehicles: 0 },
      ];

      const kpi = calculateKpiSummary({
        vehicles,
        commands,
        alarms,
        otaPlans,
        userStats: { activeUsers: 500, userActiveRate: 60.5 },
        growthRates: { vehicleGrowthRate: 2.1, commandGrowthRate: 8.5 },
      });

      assert.equal(kpi.totalVehicles, 4);
      assert.equal(kpi.onlineVehicles, 3);
      assert.equal(kpi.offlineVehicles, 1);
      assert.equal(kpi.onlineRate, 75); // 3 / 4 * 100 = 75.0%
      assert.equal(kpi.vehicleGrowthRate, 2.1);

      assert.equal(kpi.todayCommands, 3);
      assert.equal(kpi.commandSuccessRate, 66.7); // 2 / 3 * 100 = 66.7%
      assert.equal(kpi.commandGrowthRate, 8.5);

      assert.equal(kpi.todayAlarms, 4);
      assert.equal(kpi.alarmProcessRate, 50); // 2 / 4 * 100 = 50.0%
      assert.equal(kpi.alarmCriticalCount, 2);

      assert.equal(kpi.activeUsers, 500);
      assert.equal(kpi.userActiveRate, 60.5);

      assert.equal(kpi.activeOtaPlans, 2); // IN_PROGRESS + PAUSED
      assert.equal(kpi.otaUpgradingVehicles, 20); // 15 + 5
    });

    it('safely handles empty datasets without division by zero or NaN', () => {
      const kpi = calculateKpiSummary({
        vehicles: [],
        commands: [],
        alarms: [],
        otaPlans: [],
      });

      assert.equal(kpi.totalVehicles, 0);
      assert.equal(kpi.onlineVehicles, 0);
      assert.equal(kpi.offlineVehicles, 0);
      assert.equal(kpi.onlineRate, 0);
      assert.equal(kpi.todayCommands, 0);
      assert.equal(kpi.commandSuccessRate, 0);
      assert.equal(kpi.todayAlarms, 0);
      assert.equal(kpi.alarmProcessRate, 0);
      assert.equal(kpi.alarmCriticalCount, 0);
      assert.equal(kpi.activeUsers, 0);
      assert.equal(kpi.userActiveRate, 0);
      assert.equal(kpi.activeOtaPlans, 0);
      assert.equal(kpi.otaUpgradingVehicles, 0);
    });

    it('supports direct numeric summary object input', () => {
      const kpi = calculateKpiSummary({
        totalVehicles: 100,
        onlineVehicles: 85,
        todayCommands: 1000,
        commandSuccessCount: 990,
        todayAlarms: 20,
        alarmProcessedCount: 18,
        alarmCriticalCount: 1,
        activeUsers: 300,
        userActiveRate: 70,
        activeOtaPlans: 2,
        otaUpgradingVehicles: 40,
        vehicleGrowthRate: 1.5,
        commandGrowthRate: 10.2,
      });

      assert.equal(kpi.totalVehicles, 100);
      assert.equal(kpi.onlineVehicles, 85);
      assert.equal(kpi.offlineVehicles, 15);
      assert.equal(kpi.onlineRate, 85);
      assert.equal(kpi.todayCommands, 1000);
      assert.equal(kpi.commandSuccessRate, 99.0);
      assert.equal(kpi.alarmProcessRate, 90.0);
      assert.equal(kpi.alarmCriticalCount, 1);
    });
  });

  describe('3. Command Ranking Aggregation (aggregateCommandRanking)', () => {
    it('aggregates command counts, sorts descending, and calculates success rates and shares', () => {
      const rawCommands = [
        { commandCode: 'CMD_LOCK', status: 'SUCCESS' },
        { commandCode: 'CMD_LOCK', status: 'SUCCESS' },
        { commandCode: 'CMD_LOCK', status: 'FAILED' },
        { commandCode: 'CMD_UNLOCK', status: 'SUCCESS' },
        { commandCode: 'CMD_UNLOCK', status: 'SUCCESS' },
        { commandCode: 'CMD_AC_START', status: 'SUCCESS' },
      ];

      const ranking = aggregateCommandRanking(rawCommands);

      assert.equal(ranking.length, 3);
      assert.equal(ranking[0]!.commandCode, 'CMD_LOCK');
      assert.equal(ranking[0]!.count, 3);
      assert.equal(ranking[0]!.successCount, 2);
      assert.equal(ranking[0]!.successRate, 66.7);
      assert.equal(ranking[0]!.percentage, 50.0); // 3 / 6 * 100 = 50.0%

      assert.equal(ranking[1]!.commandCode, 'CMD_UNLOCK');
      assert.equal(ranking[1]!.count, 2);
      assert.equal(ranking[1]!.successCount, 2);
      assert.equal(ranking[1]!.successRate, 100.0);
      assert.equal(ranking[1]!.percentage, 33.3);

      assert.equal(ranking[2]!.commandCode, 'CMD_AC_START');
      assert.equal(ranking[2]!.count, 1);
      assert.equal(ranking[2]!.percentage, 16.7);
    });

    it('maps known command dictionary labels and category classifications', () => {
      const ranking = aggregateCommandRanking([
        { commandCode: 'CMD_LOCK', status: 'SUCCESS' },
        { commandCode: 'CMD_AC_START', status: 'SUCCESS' },
        { commandCode: 'CMD_ENGINE_START', status: 'SUCCESS' },
        { commandCode: 'CMD_WINDOW_OPEN', status: 'SUCCESS' },
      ]);

      const lock = ranking.find((r) => r.commandCode === 'CMD_LOCK');
      assert.ok(lock);
      assert.equal(lock.commandName, '车辆上锁');
      assert.equal(lock.category, 'DOOR_BODY');

      const ac = ranking.find((r) => r.commandCode === 'CMD_AC_START');
      assert.ok(ac);
      assert.equal(ac.commandName, '开启空调');
      assert.equal(ac.category, 'CABIN_CLIMATE');
    });

    it('returns empty array when command list is empty', () => {
      const ranking = aggregateCommandRanking([]);
      assert.deepEqual(ranking, []);
    });
  });

  describe('4. 24-Hour Alarm Hourly Distribution (aggregateAlarmHourlyDistribution)', () => {
    it('aggregates alarms across 24 hourly buckets by severity level', () => {
      const now = new Date('2026-10-15T00:00:00Z');
      const time08 = new Date('2026-10-15T08:15:00').toISOString();
      const time08_2 = new Date('2026-10-15T08:45:00').toISOString();
      const time14 = new Date('2026-10-15T14:20:00').toISOString();

      const alarms = [
        { triggeredAt: time08, alarmLevel: 'CRITICAL' },
        { triggeredAt: time08_2, alarmLevel: 'WARNING' },
        { triggeredAt: time14, alarmLevel: 'INFO' },
      ];

      const distribution = aggregateAlarmHourlyDistribution(alarms);
      assert.equal(distribution.length, 24);

      const hour08 = distribution.find((d) => d.hour === '08');
      assert.ok(hour08);
      assert.equal(hour08.critical, 1);
      assert.equal(hour08.warning, 1);
      assert.equal(hour08.info, 0);
      assert.equal(hour08.total, 2);

      const hour14 = distribution.find((d) => d.hour === '14');
      assert.ok(hour14);
      assert.equal(hour14.critical, 0);
      assert.equal(hour14.warning, 0);
      assert.equal(hour14.info, 1);
      assert.equal(hour14.total, 1);

      const hour00 = distribution.find((d) => d.hour === '00');
      assert.ok(hour00);
      assert.equal(hour00.total, 0);
    });

    it('returns 24 empty slots when alarms list is empty', () => {
      const dist = aggregateAlarmHourlyDistribution([]);
      assert.equal(dist.length, 24);
      assert.ok(dist.every((d) => d.total === 0 && d.critical === 0 && d.warning === 0 && d.info === 0));
    });
  });

  describe('5. Fleet Composition & Version Calculation (calculateFleetComposition)', () => {
    it('computes powertrain counts and top firmware versions with percentages', () => {
      const vehicles = [
        { powertrain: 'EV', firmwareVersion: 'v2.4.1' },
        { powertrain: 'EV', firmwareVersion: 'v2.4.1' },
        { powertrain: 'PHEV', firmwareVersion: 'v2.4.0' },
        { powertrain: 'REEV', firmwareVersion: 'v2.3.8' },
        { powertrain: 'ICE', firmwareVersion: 'v2.2.0' },
      ];

      const comp = calculateFleetComposition(vehicles);

      assert.equal(comp.powertrainDistribution.EV, 2);
      assert.equal(comp.powertrainDistribution.PHEV, 1);
      assert.equal(comp.powertrainDistribution.REEV, 1);
      assert.equal(comp.powertrainDistribution.ICE, 1);

      assert.equal(comp.topFirmwareVersions.length, 4);
      assert.equal(comp.topFirmwareVersions[0]!.version, 'v2.4.1');
      assert.equal(comp.topFirmwareVersions[0]!.count, 2);
      assert.equal(comp.topFirmwareVersions[0]!.percentage, 40.0);
    });

    it('handles vehicles without explicit powertrain or firmware version', () => {
      const vehicles = [
        {},
        { powertrain: 'EV' },
      ];
      const comp = calculateFleetComposition(vehicles);
      assert.equal(comp.powertrainDistribution.EV, 2); // Default to EV
      assert.equal(comp.topFirmwareVersions.length, 0);
    });

    it('safely handles empty vehicle array', () => {
      const comp = calculateFleetComposition([]);
      assert.equal(comp.powertrainDistribution.EV, 0);
      assert.equal(comp.powertrainDistribution.PHEV, 0);
      assert.equal(comp.powertrainDistribution.REEV, 0);
      assert.equal(comp.powertrainDistribution.ICE, 0);
      assert.deepEqual(comp.topFirmwareVersions, []);
    });
  });

  describe('6. Realtime Mock Event Generator (generateMockRealtimeEvent)', () => {
    it('creates well-formed stream events with formatted time and navigation routes', () => {
      const event1 = generateMockRealtimeEvent(0);
      assert.ok(event1.id.startsWith('stream-'));
      assert.ok(event1.timestamp.length > 0);
      assert.ok(event1.timestampFormatted.length > 0);
      assert.ok(event1.title.length > 0);
      assert.ok(event1.content.length > 0);
      assert.ok(event1.targetRoute);

      const event2 = generateMockRealtimeEvent(1);
      assert.notEqual(event1.id, event2.id);
    });
  });

  describe('7. API Client Methods & Offline State Mutations (api/dashboard.ts)', () => {
    it('fetchDashboardSnapshotApi retrieves default TODAY snapshot', async () => {
      const snapshot = await fetchDashboardSnapshotApi('TODAY');
      assert.ok(snapshot);
      assert.equal(snapshot.kpi.totalVehicles, SEED_DASHBOARD_SNAPSHOT.kpi.totalVehicles);
      assert.equal(snapshot.hourlyTrend.length, 24);
      assert.equal(snapshot.commandRanking.length, 13);
    });

    it('fetchDashboardSnapshotApi scales metrics for LAST_7_DAYS and LAST_30_DAYS', async () => {
      const snap7d = await fetchDashboardSnapshotApi('LAST_7_DAYS');
      assert.ok(snap7d.kpi.todayCommands > SEED_DASHBOARD_SNAPSHOT.kpi.todayCommands);
      assert.ok(snap7d.kpi.todayAlarms > SEED_DASHBOARD_SNAPSHOT.kpi.todayAlarms);

      const snap30d = await fetchDashboardSnapshotApi('LAST_30_DAYS');
      assert.ok(snap30d.kpi.todayCommands > snap7d.kpi.todayCommands);
      assert.ok(snap30d.kpi.todayAlarms > snap7d.kpi.todayAlarms);
    });

    it('fetchDashboardRealtimeStreamApi returns latest operational stream items', async () => {
      const stream = await fetchDashboardRealtimeStreamApi();
      assert.ok(Array.isArray(stream));
      assert.ok(stream.length >= 6);
    });

    it('appendDashboardStreamEvent prepends new item to in-memory snapshot stream', async () => {
      const initialStream = await fetchDashboardRealtimeStreamApi();
      const initialCount = initialStream.length;

      const newEvent: DashboardStreamItem = {
        id: 'test-event-999',
        timestamp: new Date().toISOString(),
        timestampFormatted: '12:00:00',
        type: 'COMMAND',
        level: 'INFO',
        title: '测试事件',
        content: '自动化测试新增的推流条目',
        targetRoute: RoutePath.COMMANDS,
      };

      appendDashboardStreamEvent(newEvent);

      const updatedStream = await fetchDashboardRealtimeStreamApi();
      assert.equal(updatedStream.length, initialCount + 1);
      assert.equal(updatedStream[0]!.id, 'test-event-999');
    });

    it('resetInMemoryDashboardSnapshot restores initial seed state', async () => {
      const snapshot = getInMemoryDashboardSnapshot();
      snapshot.kpi.totalVehicles = 999999;
      setInMemoryDashboardSnapshot(snapshot);

      assert.equal(getInMemoryDashboardSnapshot().kpi.totalVehicles, 999999);
      resetInMemoryDashboardSnapshot();
      assert.equal(
        getInMemoryDashboardSnapshot().kpi.totalVehicles,
        SEED_DASHBOARD_SNAPSHOT.kpi.totalVehicles
      );
    });

    it('isApiError identifies ApiError instances and duck-typed error objects', () => {
      const err = new ApiError('Dashboard failed', 500);
      assert.ok(isApiError(err));

      const duckErr = { name: 'ApiError', statusCode: 404, message: 'Not found' };
      assert.ok(isApiError(duckErr));

      const genericErr = new Error('Generic error');
      assert.equal(isApiError(genericErr), false);
      assert.equal(isApiError(null), false);
      assert.equal(isApiError(undefined), false);
    });

    it('strictly preserves the 14-menu constant invariant (getMenuRoutes().length === 14)', () => {
      const menuRoutes = getMenuRoutes();
      assert.equal(
        menuRoutes.length,
        14,
        `Expected exactly 14 navigation menu routes, but found ${menuRoutes.length}`
      );
      assert.ok(menuRoutes.some((r) => r.path === RoutePath.DASHBOARD));
    });
  });
});
