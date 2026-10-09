import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  CommandCode,
  CommandStatus,
  SecurityLevel,
  WebSocketEvent,
  TelemetryLocationPayload,
  AlarmType,
  AlarmLevel,
  AlarmStatus,
  CommunicationDirection,
  CommunicationChannel,
  TrajectoryTolerance,
} from '@car-control/contracts';
import { DeviceOnlineStatus } from '@car-control/domain-types';
import {
  VehicleRepository,
  LocationRepository,
  AlarmRepository,
  CommunicationLogRepository,
  CapabilityRepository,
  TenantContext,
} from '@car-control/database';
import { InMemoryTransport, DeviceSimulator } from '@car-control/simulator';
import { InMemoryMessagingAdapter } from '../messaging/in-memory-messaging.adapter.js';
import { DeviceStatusService } from '../device/device-status.service.js';
import { WebSocketGatewayService } from '../realtime/websocket.gateway.js';
import { CapabilityEngine } from '../capability/capability.engine.js';
import { ControlSecurityService } from '../security/control-security.service.js';
import { CommandService } from '../command/command.service.js';
import { AuditService } from '../audit/audit.service.js';
import { GeofenceService } from '../telemetry/geofence.service.js';
import { TelemetryService } from '../telemetry/telemetry.service.js';
import { AlarmService } from '../alarm/alarm.service.js';
import { CommunicationLogService } from '../log/communication-log.service.js';

test('Gate 4: Realtime Telemetry, Geofence & Alert Center Acceptance Suite', async (t) => {
  // 租户与操作者凭据
  const tenantA = 'TENANT_ALPHA';
  const userA = 'user_admin_alpha';
  const sessionA = { tenantId: tenantA, userId: userA };

  const tenantB = 'TENANT_BETA';
  const userB = 'user_admin_beta';
  const sessionB = { tenantId: tenantB, userId: userB };

  // 1. 初始化仓储层与多租户隔离上下文
  const vehicleRepo = new VehicleRepository();
  const locationRepo = new LocationRepository();
  const alarmRepo = new AlarmRepository();
  const commLogRepo = new CommunicationLogRepository();
  const capabilityRepo = new CapabilityRepository();

  // 2. 初始化核心与外设服务
  const sharedBus = new EventEmitter();
  const simTransport = new InMemoryTransport(sharedBus);
  const messagingAdapter = new InMemoryMessagingAdapter(sharedBus);

  const deviceStatusService = new DeviceStatusService();
  const wsGateway = new WebSocketGatewayService();
  const auditService = new AuditService();
  const geofenceService = new GeofenceService();
  const capabilityEngine = new CapabilityEngine(capabilityRepo, vehicleRepo);
  const securityService = new ControlSecurityService();

  // 遥测、报警与通讯日志服务
  const telemetryService = new TelemetryService(
    locationRepo,
    vehicleRepo,
    wsGateway,
    geofenceService,
    messagingAdapter,
    deviceStatusService
  );

  const alarmService = new AlarmService(
    alarmRepo,
    vehicleRepo,
    wsGateway,
    auditService,
    messagingAdapter,
    deviceStatusService
  );

  const commLogService = new CommunicationLogService(
    commLogRepo,
    vehicleRepo,
    messagingAdapter,
    deviceStatusService
  );

  // 指令下发服务（集成通讯日志自动沉淀）
  const commandService = new CommandService(
    messagingAdapter,
    deviceStatusService,
    wsGateway,
    capabilityEngine,
    securityService,
    vehicleRepo,
    auditService,
    commLogService
  );

  // 3. 准备测试元数据（车型模板与车辆实体）
  const modelId = 'model_gate4_taycan';
  await capabilityRepo.saveModelTemplate({
    modelId,
    modelName: '保时捷 Taycan Gate4 专用',
    capabilities: {
      [CommandCode.CMD_LOCK]: { supported: true, securityLevel: SecurityLevel.L0 },
      [CommandCode.CMD_UNLOCK]: { supported: true, securityLevel: SecurityLevel.L1 },
    },
  });

  const vehicleIdA = 'veh_gate4_alpha_001';
  const deviceNoA = 'TBOX_GATE4_A01';
  const productKeyA = 'CAR_DEMO_PK';

  const vehicleIdB = 'veh_gate4_beta_002';
  const deviceNoB = 'TBOX_GATE4_B02';

  // 创建租户 A 车辆
  await TenantContext.run(sessionA, async () => {
    await vehicleRepo.create({
      id: vehicleIdA,
      projectId: 'proj_fleet_alpha',
      vin: 'VIN_GATE4_A000000001',
      plateNumber: '粤B8888A',
      brandId: 'brand_porsche',
      modelId,
      deviceId: deviceNoA,
      status: 'NORMAL',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  // 创建租户 B 车辆
  await TenantContext.run(sessionB, async () => {
    await vehicleRepo.create({
      id: vehicleIdB,
      projectId: 'proj_fleet_beta',
      vin: 'VIN_GATE4_B000000002',
      plateNumber: '粤B9999B',
      brandId: 'brand_porsche',
      modelId,
      deviceId: deviceNoB,
      status: 'NORMAL',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  // 注册设备并订阅消息总线
  deviceStatusService.registerDevice({
    deviceNo: deviceNoA,
    productKey: productKeyA,
    vehicleId: vehicleIdA,
    onlineStatus: DeviceOnlineStatus.ONLINE,
  });
  deviceStatusService.setOnlineStatus(deviceNoA, true);
  messagingAdapter.subscribeDevice(productKeyA, deviceNoA);

  deviceStatusService.registerDevice({
    deviceNo: deviceNoB,
    productKey: productKeyA,
    vehicleId: vehicleIdB,
    onlineStatus: DeviceOnlineStatus.ONLINE,
  });
  deviceStatusService.setOnlineStatus(deviceNoB, true);
  messagingAdapter.subscribeDevice(productKeyA, deviceNoB);

  // 启动设备模拟器
  const simulatorA = new DeviceSimulator(
    {
      productKey: productKeyA,
      deviceNo: deviceNoA,
      defaultLatencyMs: 20,
    },
    simTransport
  );
  await simulatorA.start();
  await new Promise((resolve) => setTimeout(resolve, 50));

  // WebSocket 消息监听收集器
  const wsEventsA: Array<{ event: WebSocketEvent | string; payload: any }> = [];
  wsGateway.joinVehicleRoom(vehicleIdA, (event, payload) => {
    wsEventsA.push({ event, payload });
  });

  t.after(async () => {
    await simulatorA.stop();
  });

  // =========================================================================
  // Criterion 1: 实时位置上报与 WebSocket 广播
  // =========================================================================
  await t.test('1. Realtime location uplink and WebSocket broadcast', async () => {
    const locPayload: Partial<TelemetryLocationPayload> = {
      lat: 22.54286,
      lng: 114.05956,
      speed: 68.5,
      heading: 85,
      altitude: 15,
      satellites: 16,
      gpsValid: true,
      timestamp: Date.now(),
    };

    // 设备端定时/主动上报 GPS 定位报文
    await simulatorA.reportLocation(locPayload);
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 验证当前最新位置热点已更新
    const latestLoc = await TenantContext.run(sessionA, async () => {
      return telemetryService.getLatestLocation(vehicleIdA);
    });

    assert.ok(latestLoc, 'Latest location should not be null');
    assert.equal(latestLoc.lat, 22.54286);
    assert.equal(latestLoc.lng, 114.05956);
    assert.equal(latestLoc.speed, 68.5);

    // 验证 WebSocket 实时广播 LOCATION_UPDATED 事件
    const locationEvent = wsEventsA.find((e) => e.event === WebSocketEvent.LOCATION_UPDATED);
    assert.ok(locationEvent, 'WebSocket should have received LOCATION_UPDATED event');
    assert.equal(locationEvent.payload.lat, 22.54286);
    assert.equal(locationEvent.payload.lng, 114.05956);
  });

  // =========================================================================
  // Criterion 2: 历史轨迹服务端抽稀 (100+ dense points -> <20%, endpoints & corners 100% preserved)
  // =========================================================================
  await t.test('2. Server-side trajectory Douglas-Peucker simplification (<20% points, corners preserved)', async () => {
    const originalPoints: TelemetryLocationPayload[] = [];
    const baseTime = 1700000000000;

    // 构造总共 106 个密集轨迹点：包含首尾端点与两个 90 度折角关键特征点
    // 起点 P0: (22.50000, 114.00000)
    // 折角点 P35: (22.53500, 114.00000)
    // 折角点 P70: (22.53500, 114.03500)
    // 终点 P105: (22.50000, 114.03500)

    // 第一段：从南向北严格共线 (36个点: 0 ~ 35)
    for (let i = 0; i <= 35; i++) {
      originalPoints.push({
        lat: Number((22.50000 + i * 0.001).toFixed(5)),
        lng: 114.00000,
        speed: 60,
        heading: 0,
        gpsValid: true,
        timestamp: baseTime + i * 1000,
      });
    }

    // 第二段：折角转向由西向东严格共线 (35个点: 36 ~ 70)
    for (let i = 1; i <= 35; i++) {
      originalPoints.push({
        lat: 22.53500,
        lng: Number((114.00000 + i * 0.001).toFixed(5)),
        speed: 55,
        heading: 90,
        gpsValid: true,
        timestamp: baseTime + (35 + i) * 1000,
      });
    }

    // 第三段：折角转向由北向南严格共线 (35个点: 71 ~ 105)
    for (let i = 1; i <= 35; i++) {
      originalPoints.push({
        lat: Number((22.53500 - i * 0.001).toFixed(5)),
        lng: 114.03500,
        speed: 50,
        heading: 180,
        gpsValid: true,
        timestamp: baseTime + (70 + i) * 1000,
      });
    }

    assert.equal(originalPoints.length, 106, 'Original trajectory points must be >= 100');

    // 在租户 A 上下文中批量持久化原始轨迹点
    await TenantContext.run(sessionA, async () => {
      for (const pt of originalPoints) {
        await locationRepo.saveLocation(vehicleIdA, pt);
      }
    });

    // 服务端检索并应用 Douglas-Peucker 抽稀
    const simplified = await TenantContext.run(sessionA, async () => {
      return telemetryService.getTrajectory(
        vehicleIdA,
        new Date(baseTime),
        new Date(baseTime + 110000),
        TrajectoryTolerance.DEFAULT // 0.0001
      );
    });

    // 抽稀比例断言：必须少于原始点位的 20% (106 * 20% = 21.2)
    const compressionRatio = simplified.length / originalPoints.length;
    assert.ok(
      simplified.length <= Math.floor(originalPoints.length * 0.2),
      `Simplified points (${simplified.length}) must be <= 20% of original (${originalPoints.length}). Ratio: ${(compressionRatio * 100).toFixed(1)}%`
    );

    // 精准度断言：首尾点 100% 精确保留
    const firstPoint = simplified[0];
    const lastPoint = simplified[simplified.length - 1];
    assert.equal(firstPoint.lat, originalPoints[0].lat);
    assert.equal(firstPoint.lng, originalPoints[0].lng);
    assert.equal(lastPoint.lat, originalPoints[originalPoints.length - 1].lat);
    assert.equal(lastPoint.lng, originalPoints[originalPoints.length - 1].lng);

    // 关键转折点（90度转角点）100% 保持精准
    const corner1 = simplified.find((p) => Math.abs(p.lat - 22.53500) < 1e-6 && Math.abs(p.lng - 114.00000) < 1e-6);
    const corner2 = simplified.find((p) => Math.abs(p.lat - 22.53500) < 1e-6 && Math.abs(p.lng - 114.03500) < 1e-6);
    assert.ok(corner1, 'Corner 1 (22.53500, 114.00000) must be 100% preserved in simplified trajectory');
    assert.ok(corner2, 'Corner 2 (22.53500, 114.03500) must be 100% preserved in simplified trajectory');
  });

  // =========================================================================
  // Criterion 3: 地理围栏出入判定与 GEOFENCE_OUT 告警
  // =========================================================================
  await t.test('3. Circular geofence containment check and GEOFENCE_OUT alarm trigger', async () => {
    // 设置圆形电子围栏：中心点 (22.54000, 114.05000)，半径 500 米
    const geofenceCircle = {
      centerLat: 22.54000,
      centerLng: 114.05000,
      radiusMeters: 500,
    };

    // 判定 1: 围栏内测试点（距离中心约 111 米）
    const insidePoint = { lat: 22.54100, lng: 114.05000 };
    const isInside = geofenceService.checkGeofence(geofenceCircle, insidePoint);
    assert.equal(isInside, true, 'Point within 500m radius must be recognized as INSIDE');

    // 判定 2: 围栏外测试点（距离中心约 2220 米）
    const outsidePoint = { lat: 22.56000, lng: 114.05000 };
    const isOutside = !geofenceService.checkGeofence(geofenceCircle, outsidePoint);
    assert.equal(isOutside, true, 'Point outside 500m radius must be recognized as OUTSIDE');

    // 车辆坐标移动至围栏外，触发 GEOFENCE_OUT 报警
    const geofenceAlarm = await TenantContext.run(sessionA, async () => {
      return alarmService.triggerAlarm({
        tenantId: tenantA,
        vehicleId: vehicleIdA,
        alarmType: AlarmType.GEOFENCE_OUT,
        alarmLevel: AlarmLevel.WARNING,
        lat: outsidePoint.lat,
        lng: outsidePoint.lng,
        message: 'Vehicle departed circular geofence boundary [500m radius]',
      });
    });

    assert.equal(geofenceAlarm.alarmType, AlarmType.GEOFENCE_OUT);
    assert.equal(geofenceAlarm.alarmLevel, AlarmLevel.WARNING);
    assert.equal(geofenceAlarm.status, AlarmStatus.PENDING);
    assert.equal(geofenceAlarm.tenantId, tenantA);

    // 验证 WebSocket 实时广播 ALARM_TRIGGERED 事件
    const geofenceWsEvent = wsEventsA.find(
      (e) => e.event === WebSocketEvent.ALARM_TRIGGERED && e.payload.id === geofenceAlarm.id
    );
    assert.ok(geofenceWsEvent, 'WebSocket should broadcast ALARM_TRIGGERED for geofence departure');
  });

  // =========================================================================
  // Criterion 4: 设备端主动告警上报 (LOW_BATTERY & VIBRATION)
  // =========================================================================
  await t.test('4. Device proactive alarm uplink (LOW_BATTERY and VIBRATION) & WS broadcast', async () => {
    // 1. 设备主动上报低电告警 LOW_BATTERY
    await simulatorA.reportAlarm(
      AlarmType.LOW_BATTERY,
      AlarmLevel.WARNING,
      'Device backup battery voltage low (11.1V)',
      { lat: 22.5428, lng: 114.0595 }
    );

    // 2. 设备主动上报异常震动告警 VIBRATION
    await simulatorA.reportAlarm(
      AlarmType.VIBRATION,
      AlarmLevel.INFO,
      'Vehicle abnormal vibration detected while locked',
      { lat: 22.5429, lng: 114.0596 }
    );

    await new Promise((resolve) => setTimeout(resolve, 60));

    // 验证系统已生成 AlarmRecord
    const alarms = await TenantContext.run(sessionA, async () => {
      return alarmService.listAlarms({ vehicleId: vehicleIdA });
    });

    const lowBatteryAlarm = alarms.find((a) => a.alarmType === AlarmType.LOW_BATTERY);
    const vibrationAlarm = alarms.find((a) => a.alarmType === AlarmType.VIBRATION);

    assert.ok(lowBatteryAlarm, 'LOW_BATTERY alarm record must be created');
    assert.equal(lowBatteryAlarm.status, AlarmStatus.PENDING);
    assert.equal(lowBatteryAlarm.alarmLevel, AlarmLevel.WARNING);

    assert.ok(vibrationAlarm, 'VIBRATION alarm record must be created');
    assert.equal(vibrationAlarm.status, AlarmStatus.PENDING);
    assert.equal(vibrationAlarm.alarmLevel, AlarmLevel.INFO);

    // 验证 WebSocket 广播
    const lowBatWs = wsEventsA.find(
      (e) => e.event === WebSocketEvent.ALARM_TRIGGERED && e.payload.alarmType === AlarmType.LOW_BATTERY
    );
    assert.ok(lowBatWs, 'WebSocket should broadcast ALARM_TRIGGERED for LOW_BATTERY');

    const vibWs = wsEventsA.find(
      (e) => e.event === WebSocketEvent.ALARM_TRIGGERED && e.payload.alarmType === AlarmType.VIBRATION
    );
    assert.ok(vibWs, 'WebSocket should broadcast ALARM_TRIGGERED for VIBRATION');
  });

  // =========================================================================
  // Criterion 5: 报警生命周期流转与不可逆终态保护
  // =========================================================================
  await t.test('5. Alarm lifecycle management, audit logging, and irreversible terminal state protection', async () => {
    // 获取刚刚触发的低电量告警
    const pendingAlarms = await TenantContext.run(sessionA, async () => {
      return alarmService.listAlarms({ vehicleId: vehicleIdA, status: AlarmStatus.PENDING });
    });
    const targetAlarm = pendingAlarms.find((a) => a.alarmType === AlarmType.LOW_BATTERY)!;
    assert.ok(targetAlarm, 'Target pending alarm must exist');

    const operatorAdmin = 'operator_security_lead_01';
    const remarkNote = 'Dispatched field support technician; battery replaced and tested';

    // 管理员人工确认处置告警 -> 流转为 PROCESSED
    const processedAlarm = await TenantContext.run(sessionA, async () => {
      return alarmService.processAlarm(
        targetAlarm.id,
        {
          status: AlarmStatus.PROCESSED,
          operatorId: operatorAdmin,
          remark: remarkNote,
        },
        operatorAdmin
      );
    });

    assert.equal(processedAlarm.status, AlarmStatus.PROCESSED);
    assert.equal(processedAlarm.processedBy, operatorAdmin);
    assert.equal(processedAlarm.remark, remarkNote);
    assert.ok(processedAlarm.processedAt instanceof Date, 'processedAt must be valid Date');

    // 验证 WebSocket 广播 ALARM_PROCESSED
    const processedWs = wsEventsA.find(
      (e) => e.event === WebSocketEvent.ALARM_PROCESSED && e.payload.id === targetAlarm.id
    );
    assert.ok(processedWs, 'WebSocket should broadcast ALARM_PROCESSED');

    // 验证写入操作审计日志
    const auditLogs = auditService.getTenantAuditLogs(tenantA);
    const alarmAudit = auditLogs.find(
      (log) => log.action === 'ALARM_PROCESS' && log.resourceId === targetAlarm.id
    );
    assert.ok(alarmAudit, 'Audit log must record ALARM_PROCESS action');
    assert.equal(alarmAudit.userId, operatorAdmin);
    assert.equal(alarmAudit.resourceType, 'ALARM');

    // 终态保护：禁止从终态 PROCESSED 逆向流转回 PENDING 或再次流转
    await TenantContext.run(sessionA, async () => {
      await assert.rejects(
        async () => {
          await alarmService.processAlarm(
            targetAlarm.id,
            { status: AlarmStatus.PENDING, operatorId: operatorAdmin },
            operatorAdmin
          );
        },
        {
          name: 'BadRequestException',
        }
      );

      await assert.rejects(
        async () => {
          await alarmService.processAlarm(
            targetAlarm.id,
            { status: AlarmStatus.IGNORED, operatorId: operatorAdmin },
            operatorAdmin
          );
        },
        {
          message: /Invalid alarm status transition/,
        }
      );
    });
  });

  // =========================================================================
  // Criterion 6: 通讯上下行日志自动沉淀
  // =========================================================================
  await t.test('6. Automatic communication log archiving (Downlink, ACK, Telemetry, Alarm) & multi-dimensional queries', async () => {
    // 下发控制指令（锁车 L0），闭环触发：下行指令 -> 模拟器应答 -> 上行 ACK
    const cmdTraceId = `trace_gate4_${Date.now()}`;
    const cmdRecord = await TenantContext.run(sessionA, async () => {
      return commandService.executeCommand({
        tenantId: tenantA,
        vehicleId: vehicleIdA,
        commandCode: CommandCode.CMD_LOCK,
        idempotencyKey: `idemp_gate4_lock_${Date.now()}`,
        operatorId: userA,
      });
    });

    // 等待模拟器 ACK 响应与异步日志沉淀
    await new Promise((resolve) => setTimeout(resolve, 80));

    // 按 vehicleId 综合检索当前车辆的所有通讯上下行日志
    const vehicleLogs = await TenantContext.run(sessionA, async () => {
      return commLogService.queryLogs({ vehicleId: vehicleIdA });
    });

    assert.ok(vehicleLogs.length >= 4, 'Should archive commands, ACKs, locations, and alarms');

    // 验证包含下行指令日志 (DOWNLINK)
    const downlinkCmdLog = vehicleLogs.find(
      (log) => log.direction === CommunicationDirection.DOWNLINK && log.traceId === cmdRecord.traceId
    );
    assert.ok(downlinkCmdLog, 'Downlink command must be archived in CommunicationLog');
    assert.equal(downlinkCmdLog.channel, CommunicationChannel.MQTT);

    // 验证包含上行 ACK 日志 (UPLINK)
    const uplinkAckLog = vehicleLogs.find(
      (log) => log.direction === CommunicationDirection.UPLINK && log.traceId === cmdRecord.traceId
    );
    assert.ok(uplinkAckLog, 'Uplink command ACK must be archived in CommunicationLog');

    // 验证包含上行遥测定位报文 (UPLINK LOCATION)
    const locationLog = vehicleLogs.find(
      (log) => log.direction === CommunicationDirection.UPLINK && log.topic.includes('location')
    );
    assert.ok(locationLog, 'Telemetry location uplink must be archived in CommunicationLog');

    // 验证包含上行告警报文 (UPLINK ALARM)
    const alarmLog = vehicleLogs.find(
      (log) => log.direction === CommunicationDirection.UPLINK && log.topic.includes('alarm')
    );
    assert.ok(alarmLog, 'Alarm uplink must be archived in CommunicationLog');

    // 按 traceId 精确检索下行指令与对应 ACK
    const traceLogs = await TenantContext.run(sessionA, async () => {
      return commLogService.queryLogs({ traceId: cmdRecord.traceId });
    });

    assert.equal(traceLogs.length, 2, 'Query by traceId should return exactly DOWNLINK command and UPLINK ACK');
    const directions = traceLogs.map((l) => l.direction).sort();
    assert.deepEqual(directions, [CommunicationDirection.DOWNLINK, CommunicationDirection.UPLINK].sort());
  });

  // =========================================================================
  // Criterion 7: 多租户安全隔离防线
  // =========================================================================
  await t.test('7. Multi-tenant security isolation boundary across location, trajectory, alarms, and comm logs', async () => {
    // 租户 B 上行专属数据
    const betaLocPayload: TelemetryLocationPayload = {
      lat: 31.2304,
      lng: 121.4737,
      speed: 40.0,
      heading: 180,
      gpsValid: true,
      timestamp: Date.now(),
    };

    let betaAlarmRecord: any;

    await TenantContext.run(sessionB, async () => {
      // 1. 租户 B 保存位置与轨迹
      await locationRepo.saveLocation(vehicleIdB, betaLocPayload);

      // 2. 租户 B 触发告警
      betaAlarmRecord = await alarmService.triggerAlarm({
        tenantId: tenantB,
        vehicleId: vehicleIdB,
        alarmType: AlarmType.SOS,
        alarmLevel: AlarmLevel.CRITICAL,
        message: 'Emergency SOS button triggered in Tenant B',
      });

      // 3. 租户 B 沉淀通讯日志
      await commLogRepo.log({
        vehicleId: vehicleIdB,
        deviceNo: deviceNoB,
        traceId: 'trace_secret_beta_999',
        direction: CommunicationDirection.UPLINK,
        channel: CommunicationChannel.MQTT,
        topic: `/sys/PK/${deviceNoB}/status`,
        payload: { secret: 'tenant_b_confidential_telemetry' },
      });
    });

    // 切换至租户 A 安全上下文，验证全方位隔离防线
    await TenantContext.run(sessionA, async () => {
      // 防线 1: 租户 A 无法查询租户 B 车辆的最新位置
      const locBFromA = await telemetryService.getLatestLocation(vehicleIdB);
      assert.equal(locBFromA, null, 'Tenant A must NOT be able to access Tenant B vehicle latest location');

      // 防线 2: 租户 A 无法查询租户 B 车辆的历史轨迹
      const trajBFromA = await telemetryService.getTrajectory(
        vehicleIdB,
        new Date(0),
        new Date(Date.now() + 100000)
      );
      assert.deepEqual(trajBFromA, [], 'Tenant A must NOT be able to access Tenant B vehicle trajectory points');

      // 防线 3: 租户 A 无法检索到租户 B 车辆的告警列表与单条告警详情
      const alarmsBFromA = await alarmService.listAlarms({ vehicleId: vehicleIdB });
      assert.deepEqual(alarmsBFromA, [], 'Tenant A must NOT receive Tenant B alarms in list query');

      const singleAlarmBFromA = await alarmService.getAlarmById(betaAlarmRecord.id);
      assert.equal(singleAlarmBFromA, null, 'Tenant A must NOT be able to read Tenant B alarm by ID');

      // 防线 4: 租户 A 无法越权处置租户 B 的告警记录
      await assert.rejects(
        async () => {
          await alarmService.processAlarm(
            betaAlarmRecord.id,
            { status: AlarmStatus.PROCESSED, operatorId: userA },
            userA
          );
        },
        {
          message: /Alarm not found/,
        }
      );

      // 防线 5: 租户 A 无法查询租户 B 车辆的通讯日志
      const commLogsBFromA = await commLogService.queryLogs({ vehicleId: vehicleIdB });
      assert.deepEqual(commLogsBFromA, [], 'Tenant A must NOT see Tenant B vehicle communication logs');

      const commTraceBFromA = await commLogService.queryLogs({ traceId: 'trace_secret_beta_999' });
      assert.deepEqual(commTraceBFromA, [], 'Tenant A must NOT see Tenant B communication logs by traceId');
    });
  });
});
