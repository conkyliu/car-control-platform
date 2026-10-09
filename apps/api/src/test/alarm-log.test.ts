import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AlarmType,
  AlarmLevel,
  AlarmStatus,
  WebSocketEvent,
  CommunicationDirection,
  CommunicationChannel,
  MqttTopicBuilder,
  Permission,
} from '@car-control/contracts';
import {
  AlarmRepository,
  CommunicationLogRepository,
  VehicleRepository,
  TenantContext,
} from '@car-control/database';
import { InMemoryMessagingAdapter } from '../messaging/in-memory-messaging.adapter.js';
import { WebSocketGatewayService } from '../realtime/websocket.gateway.js';
import { DeviceStatusService } from '../device/device-status.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AlarmService } from '../alarm/alarm.service.js';
import { AlarmController } from '../alarm/alarm.controller.js';
import { CommunicationLogService } from '../log/communication-log.service.js';
import { CommunicationLogController } from '../log/communication-log.controller.js';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

test('Task 6: Alarm Center and Communication Log Service Acceptance Suite', async (t) => {
  // 1. 初始化仓储与依赖
  const alarmRepo = new AlarmRepository();
  const commLogRepo = new CommunicationLogRepository();
  const vehicleRepo = new VehicleRepository();
  const wsGateway = new WebSocketGatewayService();
  const auditService = new AuditService();
  const deviceStatusService = new DeviceStatusService();

  const sharedBus = InMemoryMessagingAdapter.getSharedBus();
  const messagingAdapter = new InMemoryMessagingAdapter(sharedBus);

  // 2. 初始化核心服务
  const commLogService = new CommunicationLogService(
    commLogRepo,
    vehicleRepo,
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

  const alarmController = new AlarmController(alarmService);
  const commLogController = new CommunicationLogController(commLogService);

  // 3. 准备多租户测试数据 (Tenant A 与 Tenant B)
  const tenantAId = 'TENANT_ALPHA';
  const tenantBId = 'TENANT_BETA';
  const userA = { sub: 'usr_admin_a', tenantId: tenantAId, permissions: [Permission.VEHICLE_READ, Permission.VEHICLE_WRITE, Permission.DEVICE_READ] };
  const userB = { sub: 'usr_admin_b', tenantId: tenantBId, permissions: [Permission.VEHICLE_READ, Permission.VEHICLE_WRITE, Permission.DEVICE_READ] };

  // 在 Tenant A 下注册车辆与设备绑定
  const vehicleA = await TenantContext.run({ tenantId: tenantAId, userId: 'sys' }, async () => {
    return vehicleRepo.create({
      id: 'veh_alpha_01',
      vin: 'VIN_ALPHA_001',
      plateNumber: '沪A11111',
      projectId: 'proj_alpha',
      brandId: 'brand_porsche',
      deviceId: 'DEV_ALPHA_01',
      modelId: 'taycan_ev',
      status: 'NORMAL',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  // 在 Tenant B 下注册车辆与设备绑定
  const vehicleB = await TenantContext.run({ tenantId: tenantBId, userId: 'sys' }, async () => {
    return vehicleRepo.create({
      id: 'veh_beta_01',
      vin: 'VIN_BETA_001',
      plateNumber: '粤B22222',
      projectId: 'proj_beta',
      brandId: 'brand_porsche',
      deviceId: 'DEV_BETA_01',
      modelId: 'panamera_gas',
      status: 'NORMAL',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  // 订阅设备消息总线
  messagingAdapter.subscribeDevice('PK_ALARM_TEST', 'DEV_ALPHA_01');
  messagingAdapter.subscribeDevice('PK_ALARM_TEST', 'DEV_BETA_01');

  // ==========================================
  // Section 1: 告警上报触发、存储与 WebSocket 广播
  // ==========================================
  let createdAlarmAId = '';

  await t.test('1. Uplink alarm via MQTT triggers storage and WebSocket broadcast', async () => {
    const wsEvents: Array<{ event: string; payload: any }> = [];
    const unsubscribeWs = wsGateway.joinVehicleRoom(vehicleA.id, (event, payload) => {
      wsEvents.push({ event, payload });
    });

    const alarmTimestamp = Date.now();
    const alarmTopic = MqttTopicBuilder.alarm('PK_ALARM_TEST', 'DEV_ALPHA_01');

    // 模拟终端硬件触发 LOW_BATTERY 告警上报
    sharedBus.emit(alarmTopic, alarmTopic, JSON.stringify({
      alarmType: AlarmType.LOW_BATTERY,
      alarmLevel: AlarmLevel.WARNING,
      timestamp: alarmTimestamp,
      lat: 31.2304,
      lng: 121.4737,
      speed: 0,
      message: '12V Auxiliary battery voltage low (11.2V)',
      details: { voltage: 11.2 },
    }));

    // 等待微任务与事件派发完成
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 验证 WebSocket 广播
    assert.equal(wsEvents.length, 1);
    assert.equal(wsEvents[0].event, WebSocketEvent.ALARM_TRIGGERED);
    const eventAlarm = wsEvents[0].payload;
    assert.equal(eventAlarm.vehicleId, vehicleA.id);
    assert.equal(eventAlarm.alarmType, AlarmType.LOW_BATTERY);
    assert.equal(eventAlarm.alarmLevel, AlarmLevel.WARNING);
    assert.equal(eventAlarm.status, AlarmStatus.PENDING);
    assert.equal(eventAlarm.tenantId, tenantAId);

    createdAlarmAId = eventAlarm.id;
    assert.ok(createdAlarmAId);

    // 验证仓储持久化
    const stored = await TenantContext.run({ tenantId: tenantAId, userId: 'sys' }, () => {
      return alarmRepo.findById(createdAlarmAId);
    });
    assert.ok(stored);
    assert.equal(stored.id, createdAlarmAId);
    assert.equal(stored.status, AlarmStatus.PENDING);
    assert.equal(stored.deviceNo, 'DEV_ALPHA_01');

    unsubscribeWs();
  });

  await t.test('2. Programmatic alarm trigger (triggerAlarm) derives default level and broadcasts', async () => {
    const wsEvents: Array<{ event: string; payload: any }> = [];
    const unsubscribeWs = wsGateway.joinVehicleRoom(vehicleA.id, (event, payload) => {
      wsEvents.push({ event, payload });
    });

    // 编程式触发 POWER_CUT（主电源断开告警），未显式指定 level 时自动推断为 CRITICAL
    const manualAlarm = await alarmService.triggerAlarm({
      vehicleId: vehicleA.id,
      alarmType: AlarmType.POWER_CUT,
      lat: 31.235,
      lng: 121.480,
      speed: 25.5,
      message: 'External power line cut off detected by perimeter fence rule',
    });

    assert.ok(manualAlarm.id);
    assert.equal(manualAlarm.alarmLevel, AlarmLevel.CRITICAL);
    assert.equal(manualAlarm.status, AlarmStatus.PENDING);
    assert.equal(manualAlarm.tenantId, tenantAId);
    assert.equal(manualAlarm.vehicleId, vehicleA.id);

    // 验证 WebSocket 广播
    assert.equal(wsEvents.length, 1);
    assert.equal(wsEvents[0].event, WebSocketEvent.ALARM_TRIGGERED);
    assert.equal(wsEvents[0].payload.id, manualAlarm.id);

    unsubscribeWs();
  });

  // ==========================================
  // Section 2: 告警处置生命周期与终态不可逆防线
  // ==========================================
  await t.test('3. Alarm lifecycle transition: PENDING -> PROCESSED with audit logging', async () => {
    const wsEvents: Array<{ event: string; payload: any }> = [];
    const unsubscribeWs = wsGateway.joinVehicleRoom(vehicleA.id, (event, payload) => {
      wsEvents.push({ event, payload });
    });

    const processed = await TenantContext.run({ tenantId: tenantAId, userId: 'usr_admin_a' }, async () => {
      return alarmService.processAlarm(
        createdAlarmAId,
        {
          status: AlarmStatus.PROCESSED,
          remark: 'Dispatched emergency mobile charging vehicle to assist',
        },
        'usr_admin_a'
      );
    });

    assert.equal(processed.status, AlarmStatus.PROCESSED);
    assert.equal(processed.operatorId, 'usr_admin_a');
    assert.equal(processed.remark, 'Dispatched emergency mobile charging vehicle to assist');
    assert.ok(processed.processedAt);

    // 验证 WebSocket 收到 ALARM_PROCESSED
    assert.equal(wsEvents.length, 1);
    assert.equal(wsEvents[0].event, WebSocketEvent.ALARM_PROCESSED);
    assert.equal(wsEvents[0].payload.id, createdAlarmAId);
    assert.equal(wsEvents[0].payload.status, AlarmStatus.PROCESSED);

    // 验证审计日志留痕
    const auditLogs = auditService.getTenantAuditLogs(tenantAId);
    const alarmAudit = auditLogs.find((l) => l.action === 'ALARM_PROCESS' && l.resourceId === createdAlarmAId);
    assert.ok(alarmAudit);
    assert.equal(alarmAudit.userId, 'usr_admin_a');
    assert.equal(alarmAudit.tenantId, tenantAId);
    assert.equal(alarmAudit.details?.newStatus, AlarmStatus.PROCESSED);

    unsubscribeWs();
  });

  await t.test('4. Irreversible terminal state: PROCESSED cannot transition to IGNORED or PENDING', async () => {
    // 尝试将 PROCESSED 流转为 IGNORED
    await assert.rejects(
      async () => {
        await TenantContext.run({ tenantId: tenantAId, userId: 'usr_admin_a' }, async () => {
          await alarmService.processAlarm(createdAlarmAId, { status: AlarmStatus.IGNORED });
        });
      },
      {
        message: /Invalid alarm status transition/,
      }
    );

    // 尝试将 PROCESSED 流转回 PENDING
    await assert.rejects(
      async () => {
        await TenantContext.run({ tenantId: tenantAId, userId: 'usr_admin_a' }, async () => {
          await alarmService.processAlarm(createdAlarmAId, { status: AlarmStatus.PENDING as any });
        });
      },
      {
        message: /Invalid target status/,
      }
    );
  });

  await t.test('5. Alarm lifecycle transition: PENDING -> IGNORED is terminal', async () => {
    // 创建一条震动告警
    const vibAlarm = await alarmService.triggerAlarm({
      vehicleId: vehicleA.id,
      alarmType: AlarmType.VIBRATION,
      message: 'Slight vibration during strong wind',
    });
    assert.equal(vibAlarm.status, AlarmStatus.PENDING);
    assert.equal(vibAlarm.alarmLevel, AlarmLevel.INFO);

    // 处置为 IGNORED
    const ignored = await TenantContext.run({ tenantId: tenantAId, userId: 'usr_admin_a' }, async () => {
      return alarmService.processAlarm(vibAlarm.id, {
        status: AlarmStatus.IGNORED,
        remark: 'Confirmed false alarm caused by typhoon gale',
      });
    });
    assert.equal(ignored.status, AlarmStatus.IGNORED);
    assert.equal(ignored.remark, 'Confirmed false alarm caused by typhoon gale');

    // 尝试将 IGNORED 再次处置为 PROCESSED，被拦截
    await assert.rejects(
      async () => {
        await TenantContext.run({ tenantId: tenantAId, userId: 'usr_admin_a' }, async () => {
          await alarmService.processAlarm(vibAlarm.id, { status: AlarmStatus.PROCESSED });
        });
      },
      {
        message: /Invalid alarm status transition/,
      }
    );
  });

  // ==========================================
  // Section 3: 通讯报文日志沉淀与多维检索
  // ==========================================
  await t.test('6. Automatic uplink communication log interception via MessagingPort', async () => {
    const locTopic = MqttTopicBuilder.location('PK_ALARM_TEST', 'DEV_ALPHA_01');
    const locPayload = {
      lat: 31.2388,
      lng: 121.4799,
      speed: 60.5,
      altitude: 12.0,
      heading: 180,
      gpsValid: true,
      timestamp: Date.now(),
    };

    // 模拟定位上报
    sharedBus.emit(locTopic, locTopic, JSON.stringify(locPayload));
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 查询通讯日志
    const logs = await TenantContext.run({ tenantId: tenantAId, userId: 'sys' }, async () => {
      return commLogService.queryLogs({ vehicleId: vehicleA.id, topic: locTopic });
    });

    assert.ok(logs.length >= 1);
    const locLog = logs[0];
    assert.equal(locLog.vehicleId, vehicleA.id);
    assert.equal(locLog.deviceNo, 'DEV_ALPHA_01');
    assert.equal(locLog.direction, CommunicationDirection.UPLINK);
    assert.equal(locLog.channel, CommunicationChannel.MQTT);
    assert.equal(locLog.topic, locTopic);
    assert.equal(locLog.payload.lat, 31.2388);
  });

  await t.test('7. Downlink command logging and multi-dimensional query', async () => {
    const traceId = 'trace_cmd_alpha_999';
    const requestId = 'req_cmd_alpha_888';

    // 记录一条下行开锁指令
    const entry = await commLogService.logMessage({
      tenantId: tenantAId,
      vehicleId: vehicleA.id,
      deviceNo: 'DEV_ALPHA_01',
      traceId,
      requestId,
      direction: CommunicationDirection.DOWNLINK,
      channel: CommunicationChannel.MQTT,
      topic: MqttTopicBuilder.commandDown('PK_ALARM_TEST', 'DEV_ALPHA_01'),
      payload: { commandCode: 'CMD_DOOR_UNLOCK', timestamp: Date.now() },
    });

    assert.ok(entry.id);
    assert.equal(entry.traceId, traceId);

    // 1. 按 traceId 检索
    const byTrace = await TenantContext.run({ tenantId: tenantAId, userId: 'sys' }, () => {
      return commLogService.queryLogs({ traceId });
    });
    assert.equal(byTrace.length, 1);
    assert.equal(byTrace[0].id, entry.id);

    // 2. 按 direction 检索
    const downlinks = await TenantContext.run({ tenantId: tenantAId, userId: 'sys' }, () => {
      return commLogService.queryLogs({ direction: CommunicationDirection.DOWNLINK });
    });
    assert.ok(downlinks.some((l) => l.id === entry.id));

    // 3. 按 channel 检索
    const mqttLogs = await TenantContext.run({ tenantId: tenantAId, userId: 'sys' }, () => {
      return commLogService.queryLogs({ channel: CommunicationChannel.MQTT });
    });
    assert.ok(mqttLogs.length > 0);
  });

  // ==========================================
  // Section 4: 严格多租户数据隔离防线
  // ==========================================
  await t.test('8. Tenant B cannot see or manipulate Tenant A alarms', async () => {
    // Tenant B 查询告警列表：不可见 Tenant A 的告警
    const listB = await TenantContext.run({ tenantId: tenantBId, userId: 'usr_admin_b' }, async () => {
      return alarmService.listAlarms();
    });
    assert.equal(listB.length, 0);

    // Tenant B 按 ID 查询 Tenant A 的告警：返回 null
    const foundB = await TenantContext.run({ tenantId: tenantBId, userId: 'usr_admin_b' }, async () => {
      return alarmService.getAlarmById(createdAlarmAId);
    });
    assert.equal(foundB, null);

    // Tenant B 越权处置 Tenant A 的告警：被拦截抛出 not found
    await assert.rejects(
      async () => {
        await TenantContext.run({ tenantId: tenantBId, userId: 'usr_admin_b' }, async () => {
          await alarmService.processAlarm(createdAlarmAId, { status: AlarmStatus.PROCESSED });
        });
      },
      {
        message: /not found/,
      }
    );
  });

  await t.test('9. Tenant B cannot query Tenant A communication logs', async () => {
    // Tenant B 查询通讯日志：为空
    const logsB = await TenantContext.run({ tenantId: tenantBId, userId: 'usr_admin_b' }, async () => {
      return commLogService.queryLogs();
    });
    assert.equal(logsB.length, 0);

    // Tenant B 试图通过 Tenant A 的 vehicleId 过滤查询：依然受租户隔离约束为空
    const filteredB = await TenantContext.run({ tenantId: tenantBId, userId: 'usr_admin_b' }, async () => {
      return commLogService.queryLogs({ vehicleId: vehicleA.id });
    });
    assert.equal(filteredB.length, 0);
  });

  // ==========================================
  // Section 5: HTTP 控制器接入与守卫集成
  // ==========================================
  await t.test('10. AlarmController REST API endpoints operate under tenant session', async () => {
    const fakeReqA = { user: userA };
    const fakeReqB = { user: userB };

    // 1. GET /api/v1/alarms
    const alarmsA = await alarmController.listAlarms(undefined, undefined, undefined, undefined, undefined, fakeReqA);
    assert.ok(alarmsA.length >= 2);

    const alarmsB = await alarmController.listAlarms(undefined, undefined, undefined, undefined, undefined, fakeReqB);
    assert.equal(alarmsB.length, 0);

    // 2. GET /api/v1/alarms/:id
    const singleA = await alarmController.getAlarmById(createdAlarmAId, fakeReqA);
    assert.equal(singleA.id, createdAlarmAId);

    // Tenant B 尝试查询 Tenant A 告警 -> 抛出 404 NotFoundException
    await assert.rejects(
      async () => {
        await alarmController.getAlarmById(createdAlarmAId, fakeReqB);
      },
      (err: any) => err instanceof NotFoundException
    );

    // 3. POST /api/v1/alarms/:id/process (重复流转已终态告警 -> 抛出 409 ConflictException)
    await assert.rejects(
      async () => {
        await alarmController.processAlarm(
          createdAlarmAId,
          { status: AlarmStatus.IGNORED },
          fakeReqA
        );
      },
      (err: any) => err instanceof ConflictException
    );
  });

  await t.test('11. CommunicationLogController REST API endpoint queries logs securely', async () => {
    const fakeReqA = { user: userA };
    const fakeReqB = { user: userB };

    // GET /api/v1/logs/communication under Tenant A
    const logsA = await commLogController.queryLogs(
      vehicleA.id,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      fakeReqA
    );
    assert.ok(logsA.length >= 1);
    assert.equal(logsA[0].tenantId, tenantAId);

    // GET /api/v1/logs/communication under Tenant B
    const logsB = await commLogController.queryLogs(
      vehicleA.id,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      fakeReqB
    );
    assert.equal(logsB.length, 0);
  });
});
