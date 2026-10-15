import test from 'node:test';
import assert from 'node:assert/strict';
import { Reflector } from '@nestjs/core';
import {
  VehicleRepository,
  DeviceRepository,
  AlarmRepository,
  TenantContext,
  OtaPlanRepository,
} from '@car-control/database';
import { DeviceOnlineStatus } from '@car-control/domain-types';
import {
  Permission,
  CommandCode,
  CommandStatus,
  AlarmType,
  AlarmLevel,
  AlarmStatus,
  CommandRankItem,
} from '@car-control/contracts';
import { DeviceStatusService } from '../device/device-status.service.js';
import { CommandService } from '../command/command.service.js';
import { AlarmService } from '../alarm/alarm.service.js';
import { WebSocketGatewayService } from '../realtime/websocket.gateway.js';
import { InMemoryMessagingAdapter } from '../messaging/in-memory-messaging.adapter.js';
import { AuditService } from '../audit/audit.service.js';
import { DashboardService } from '../dashboard/dashboard.service.js';
import { DashboardController } from '../dashboard/dashboard.controller.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';

test('DashboardController & Operations Cockpit Acceptance Suite', async (t) => {
  const messagingPort = new InMemoryMessagingAdapter();
  const wsGateway = new WebSocketGatewayService();
  const deviceStatusService = new DeviceStatusService();
  const vehicleRepo = new VehicleRepository();
  const deviceRepo = new DeviceRepository();
  const alarmRepo = new AlarmRepository();
  const otaPlanRepo = new OtaPlanRepository();
  const auditService = new AuditService();

  const commandService = new CommandService(
    messagingPort,
    deviceStatusService,
    wsGateway,
    undefined,
    undefined,
    vehicleRepo,
    auditService
  );

  const alarmService = new AlarmService(
    alarmRepo,
    vehicleRepo,
    wsGateway,
    auditService,
    messagingPort,
    deviceStatusService
  );

  const dashboardService = new DashboardService(
    vehicleRepo,
    deviceRepo,
    commandService,
    alarmService,
    deviceStatusService,
    alarmRepo,
    otaPlanRepo
  );

  const dashboardController = new DashboardController(dashboardService);
  const reflector = new Reflector();
  const guard = new PermissionsGuard(reflector);

  const TENANT_A = 'TENANT_ALPHA';
  const TENANT_B = 'TENANT_BETA';

  // Seed Tenant A data:
  // 10 vehicles, 7 online, 3 offline
  await TenantContext.run({ tenantId: TENANT_A, userId: 'setup-user' }, async () => {
    for (let i = 1; i <= 10; i++) {
      const devNo = `DEV-A-${i}`;
      const vId = `VEH-A-${i}`;
      await deviceRepo.create({
        id: `device-a-${i}`,
        deviceNo: devNo,
        imei: `86000000000000${i}`,
        productKey: 'CAR_BOX_4G',
        status: 'ACTIVE',
        onlineStatus: i <= 7 ? DeviceOnlineStatus.ONLINE : DeviceOnlineStatus.OFFLINE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      deviceStatusService.registerDevice({
        deviceNo: devNo,
        productKey: 'CAR_BOX_4G',
        vehicleId: vId,
        onlineStatus: i <= 7 ? DeviceOnlineStatus.ONLINE : DeviceOnlineStatus.OFFLINE,
      });

      await vehicleRepo.create({
        id: vId,
        projectId: 'PROJ_A',
        vin: `VIN_TENANT_A_${i.toString().padStart(4, '0')}`,
        plateNumber: `粤B·A000${i}`,
        brandId: 'brand-tesla',
        modelId: 'model-y',
        deviceId: devNo,
        status: 'NORMAL',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // Tenant A commands: 20 commands, 18 SUCCESS, 2 FAILED
    for (let i = 1; i <= 20; i++) {
      const code = i <= 10 ? CommandCode.CMD_LOCK : (i <= 16 ? CommandCode.CMD_UNLOCK : CommandCode.CMD_AC_START);
      const isSuccess = i <= 18;
      (commandService as any).commandStore.set(`cmd-a-${i}`, {
        id: `cmd-a-${i}`,
        tenantId: TENANT_A,
        projectId: 'PROJ_A',
        vehicleId: `VEH-A-${(i % 10) + 1}`,
        deviceId: `device-a-${(i % 10) + 1}`,
        deviceNo: `DEV-A-${(i % 10) + 1}`,
        commandCode: code,
        status: isSuccess ? CommandStatus.SUCCESS : CommandStatus.FAILED,
        securityLevel: 'L0',
        idempotencyKey: `idem-a-${i}`,
        traceId: `trace-a-${i}`,
        requestId: `req-a-${i}`,
        operatorId: 'operator-1',
        createdAt: new Date(Date.now() - (20 - i) * 60000),
        updatedAt: new Date(),
      });
    }

    // Tenant A alarms: 5 alarms, 3 PROCESSED, 1 CRITICAL
    const now = new Date();
    for (let i = 1; i <= 5; i++) {
      await alarmRepo.create({
        id: `alarm-a-${i}`,
        projectId: 'PROJ_A',
        vehicleId: `VEH-A-${i}`,
        deviceNo: `DEV-A-${i}`,
        alarmType: i === 1 ? AlarmType.SOS : (i === 2 ? AlarmType.TOW_AWAY : AlarmType.LOW_BATTERY),
        alarmLevel: i === 1 ? AlarmLevel.CRITICAL : AlarmLevel.WARNING,
        status: i <= 3 ? AlarmStatus.PROCESSED : AlarmStatus.PENDING,
        message: `Tenant A Alarm #${i}`,
        triggeredAt: new Date(now.getTime() - i * 3600000),
      });
    }
  });

  // Seed Tenant B data:
  // 2 vehicles, 1 online, 0 commands, 0 alarms
  await TenantContext.run({ tenantId: TENANT_B, userId: 'setup-user' }, async () => {
    for (let i = 1; i <= 2; i++) {
      const devNo = `DEV-B-${i}`;
      const vId = `VEH-B-${i}`;
      await deviceRepo.create({
        id: `device-b-${i}`,
        deviceNo: devNo,
        imei: `86999000000000${i}`,
        productKey: 'CAR_BOX_4G',
        status: 'ACTIVE',
        onlineStatus: i === 1 ? DeviceOnlineStatus.ONLINE : DeviceOnlineStatus.OFFLINE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      deviceStatusService.registerDevice({
        deviceNo: devNo,
        productKey: 'CAR_BOX_4G',
        vehicleId: vId,
        onlineStatus: i === 1 ? DeviceOnlineStatus.ONLINE : DeviceOnlineStatus.OFFLINE,
      });

      await vehicleRepo.create({
        id: vId,
        projectId: 'PROJ_B',
        vin: `VIN_TENANT_B_${i.toString().padStart(4, '0')}`,
        plateNumber: `京A·B000${i}`,
        brandId: 'brand-byd',
        modelId: 'model-han',
        deviceId: devNo,
        status: 'NORMAL',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  });

  await t.test('1. Snapshot generation for TODAY returns full structure and KPI calculations', async () => {
    const mockReq = { user: { tenantId: TENANT_A, sub: 'user-a' } };
    const snapshot = await dashboardController.getSnapshot(mockReq, 'TODAY');

    assert.ok(snapshot);
    assert.equal(snapshot.timeRange, 'TODAY');
    assert.ok(typeof snapshot.updatedAt === 'string');

    // KPI Verification
    const { kpi } = snapshot;
    assert.equal(kpi.totalVehicles, 10);
    assert.equal(kpi.onlineVehicles, 7);
    assert.equal(kpi.offlineVehicles, 3);
    assert.equal(kpi.onlineRate, 70.0);
    assert.equal(kpi.todayCommands, 20);
    assert.equal(kpi.commandSuccessRate, 90.0); // 18 / 20 = 90.0%
    assert.equal(kpi.todayAlarms, 5);
    assert.equal(kpi.alarmProcessRate, 60.0); // 3 / 5 = 60.0%
    assert.equal(kpi.alarmCriticalCount, 1);

    // 24-point HourlyTrend
    assert.equal(snapshot.hourlyTrend.length, 24);
    assert.equal(snapshot.hourlyTrend[0].hour, '00');
    assert.equal(snapshot.hourlyTrend[23].hour, '23');

    // 24-point AlarmDistribution
    assert.equal(snapshot.alarmDistribution.length, 24);
    assert.equal(snapshot.alarmDistribution[0].hour, '00');
    assert.equal(snapshot.alarmDistribution[23].hour, '23');

    // CommandRanking: ordered desc by count
    assert.ok(Array.isArray(snapshot.commandRanking));
    assert.ok(snapshot.commandRanking.length > 0);
    assert.equal(snapshot.commandRanking[0].commandCode, CommandCode.CMD_LOCK);
    assert.equal(snapshot.commandRanking[0].count, 10);
    assert.equal(snapshot.commandRanking[0].percentage, 50.0); // 10 / 20 = 50.0%

    // FleetComposition
    assert.ok(snapshot.fleetComposition);
    assert.ok(typeof snapshot.fleetComposition.powertrainDistribution.EV === 'number');
    assert.ok(Array.isArray(snapshot.fleetComposition.topFirmwareVersions));

    // RealtimeStream items: 10 ~ 20 items
    assert.ok(snapshot.realtimeStream.length >= 10 && snapshot.realtimeStream.length <= 20);
  });

  await t.test('2. TimeRange switching to LAST_7_DAYS scales counts accurately', async () => {
    const mockReq = { user: { tenantId: TENANT_A, sub: 'user-a' } };
    const snapshot7d = await dashboardController.getSnapshot(mockReq, 'LAST_7_DAYS');

    assert.equal(snapshot7d.timeRange, 'LAST_7_DAYS');
    // 20 * 6.8 = 136
    assert.equal(snapshot7d.kpi.todayCommands, 136);
    // 5 * 6.5 = 33
    assert.equal(snapshot7d.kpi.todayAlarms, 33);
    // 1 * 5.3 = 5
    assert.equal(snapshot7d.kpi.alarmCriticalCount, 5);

    // CommandRanking counts scaled
    const lockRank = snapshot7d.commandRanking.find((c: CommandRankItem) => c.commandCode === CommandCode.CMD_LOCK);
    assert.ok(lockRank);
    assert.equal(lockRank.count, Math.round(10 * 6.8));
  });

  await t.test('3. TimeRange switching to LAST_30_DAYS scales counts accurately', async () => {
    const mockReq = { user: { tenantId: TENANT_A, sub: 'user-a' } };
    const snapshot30d = await dashboardController.getSnapshot(mockReq, 'LAST_30_DAYS');

    assert.equal(snapshot30d.timeRange, 'LAST_30_DAYS');
    // 20 * 28.5 = 570
    assert.equal(snapshot30d.kpi.todayCommands, 570);
    // 5 * 26.2 = 131
    assert.equal(snapshot30d.kpi.todayAlarms, 131);
    // 1 * 21.0 = 21
    assert.equal(snapshot30d.kpi.alarmCriticalCount, 21);

    // CommandRanking counts scaled
    const lockRank = snapshot30d.commandRanking.find((c: CommandRankItem) => c.commandCode === CommandCode.CMD_LOCK);
    assert.ok(lockRank);
    assert.equal(lockRank.count, Math.round(10 * 28.5));
  });

  await t.test('4. Realtime stream generation returns 10~20 properly formatted items', async () => {
    const mockReq = { user: { tenantId: TENANT_A, sub: 'user-a' } };
    const stream = await dashboardController.getRealtimeStream(mockReq);

    assert.ok(Array.isArray(stream));
    assert.ok(stream.length >= 10 && stream.length <= 20);

    for (const item of stream) {
      assert.ok(typeof item.id === 'string' && item.id.length > 0);
      assert.ok(typeof item.timestamp === 'string');
      assert.ok(typeof item.timestampFormatted === 'string');
      assert.ok(['COMMAND', 'ALARM', 'OTA', 'VEHICLE'].includes(item.type));
      assert.ok(['INFO', 'WARNING', 'CRITICAL'].includes(item.level));
      assert.ok(typeof item.title === 'string' && item.title.length > 0);
      assert.ok(typeof item.content === 'string' && item.content.length > 0);
    }
  });

  await t.test('5. Multi-tenant isolation: Tenant B sees only its own resources', async () => {
    const mockReqB = { user: { tenantId: TENANT_B, sub: 'user-b' } };
    const snapshotB = await dashboardController.getSnapshot(mockReqB, 'TODAY');

    assert.equal(snapshotB.kpi.totalVehicles, 2);
    assert.equal(snapshotB.kpi.onlineVehicles, 1);
    assert.equal(snapshotB.kpi.offlineVehicles, 1);
    assert.equal(snapshotB.kpi.onlineRate, 50.0); // 1 / 2 = 50.0%
    assert.equal(snapshotB.kpi.todayCommands, 0);
    assert.equal(snapshotB.kpi.commandSuccessRate, 0);
    assert.equal(snapshotB.kpi.todayAlarms, 0);
    assert.equal(snapshotB.kpi.alarmProcessRate, 0);
    assert.equal(snapshotB.kpi.alarmCriticalCount, 0);
    assert.deepEqual(snapshotB.commandRanking, []);
  });

  await t.test('6. RBAC permissions & Guards metadata verification', async () => {
    const endpoints = [
      dashboardController.getSnapshot,
      dashboardController.getRealtimeStream,
    ];

    for (const ep of endpoints) {
      const perms = reflector.get('permissions', ep);
      assert.deepEqual(perms, [Permission.VEHICLE_READ], `Endpoint ${ep.name} should require VEHICLE_READ`);
    }

    const makeContext = (user: any, handler: any, controllerClass: any) => ({
      getHandler: () => handler,
      getClass: () => controllerClass,
      switchToHttp: () => ({
        getRequest: () => ({
          user,
        }),
      }),
    } as any);

    const authorizedUser = {
      tenantId: TENANT_A,
      permissions: [Permission.VEHICLE_READ],
    };

    const unauthorizedUser = {
      tenantId: TENANT_A,
      permissions: [Permission.DEVICE_READ],
    };

    // Authorized user passes
    const pass = guard.canActivate(makeContext(authorizedUser, dashboardController.getSnapshot, DashboardController));
    assert.equal(pass, true);

    // Unauthorized user throws 403 ForbiddenException
    assert.throws(
      () => {
        guard.canActivate(makeContext(unauthorizedUser, dashboardController.getSnapshot, DashboardController));
      },
      {
        name: 'ForbiddenException',
      }
    );
  });
});
