import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FirmwareStatus,
  OtaPlanStatus,
  OtaTaskStatus,
  OtaStep,
  OtaTargetType,
  WebSocketEvent,
  WebSocketRoomBuilder,
  MqttTopicBuilder,
  Permission,
  CreateFirmwareDto,
  CreateOtaPlanDto,
} from '@car-control/contracts';
import {
  FirmwareRepository,
  OtaPlanRepository,
  OtaTaskRepository,
  VehicleRepository,
  DeviceRepository,
  TenantContext,
} from '@car-control/database';
import { DeviceOnlineStatus } from '@car-control/domain-types';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InMemoryMessagingAdapter } from '../messaging/in-memory-messaging.adapter.js';
import { WebSocketGatewayService } from '../realtime/websocket.gateway.js';
import { AuditService } from '../audit/audit.service.js';
import { FirmwareService } from '../ota/firmware.service.js';
import { OtaSafetyService } from '../ota/ota-safety.service.js';
import { OtaPlanService } from '../ota/ota-plan.service.js';
import { OtaProgressService } from '../ota/ota-progress.service.js';
import { OtaController } from '../ota/ota.controller.js';

test('Gate 5 Task 5: OTA Firmware, Safety Pre-Check, and Plan Scheduling Acceptance Suite', async (t) => {
  // 1. 初始化仓储与依赖
  const firmwareRepo = new FirmwareRepository();
  const planRepo = new OtaPlanRepository();
  const taskRepo = new OtaTaskRepository();
  const vehicleRepo = new VehicleRepository();
  const deviceRepo = new DeviceRepository();

  const wsGateway = new WebSocketGatewayService();
  const auditService = new AuditService();
  const otaSafetyService = new OtaSafetyService();

  const sharedBus = InMemoryMessagingAdapter.getSharedBus();
  const messagingAdapter = new InMemoryMessagingAdapter(sharedBus);

  // 2. 初始化核心服务
  const firmwareService = new FirmwareService(firmwareRepo, auditService);
  const planService = new OtaPlanService(
    planRepo,
    taskRepo,
    firmwareRepo,
    vehicleRepo,
    deviceRepo,
    otaSafetyService,
    messagingAdapter,
    auditService
  );
  const progressService = new OtaProgressService(
    planRepo,
    taskRepo,
    wsGateway,
    messagingAdapter,
    auditService
  );
  const otaController = new OtaController(firmwareService, planService);

  // 3. 租户上下文测试数据
  const tenantAId = 'TENANT_OTA_A';
  const tenantBId = 'TENANT_OTA_B';
  const userA = {
    sub: 'usr_admin_a',
    tenantId: tenantAId,
    permissions: [Permission.DEVICE_READ, Permission.DEVICE_WRITE],
  };
  const userB = {
    sub: 'usr_admin_b',
    tenantId: tenantBId,
    permissions: [Permission.DEVICE_READ, Permission.DEVICE_WRITE],
  };

  const productKeyA = 'PK_OTA_MODEL_X';

  // 在 Tenant A 下注册设备与关联车辆
  // Device 1: Model X, Project P1
  const devA1 = await TenantContext.run({ tenantId: tenantAId, userId: 'sys' }, async () => {
    return deviceRepo.create({
      id: 'dev_ota_001',
      deviceNo: 'DEV_OTA_001',
      imei: '860000000000001',
      productKey: productKeyA,
      status: 'ACTIVE',
      onlineStatus: DeviceOnlineStatus.ONLINE,
      firmwareVersion: 'v1.0.0',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  const vehA1 = await TenantContext.run({ tenantId: tenantAId, userId: 'sys' }, async () => {
    return vehicleRepo.create({
      id: 'veh_ota_001',
      vin: 'VIN_OTA_0000000001',
      plateNumber: '京A00001',
      projectId: 'proj_ota_p1',
      brandId: 'brand_tesla',
      modelId: 'model_x',
      deviceId: devA1.id,
      status: 'NORMAL',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  // Device 2: Model X, Project P2
  const devA2 = await TenantContext.run({ tenantId: tenantAId, userId: 'sys' }, async () => {
    return deviceRepo.create({
      id: 'dev_ota_002',
      deviceNo: 'DEV_OTA_002',
      imei: '860000000000002',
      productKey: productKeyA,
      status: 'ACTIVE',
      onlineStatus: DeviceOnlineStatus.ONLINE,
      firmwareVersion: 'v1.0.0',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  const vehA2 = await TenantContext.run({ tenantId: tenantAId, userId: 'sys' }, async () => {
    return vehicleRepo.create({
      id: 'veh_ota_002',
      vin: 'VIN_OTA_0000000002',
      plateNumber: '京A00002',
      projectId: 'proj_ota_p2',
      brandId: 'brand_tesla',
      modelId: 'model_x',
      deviceId: devA2.id,
      status: 'NORMAL',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  // Device 3: Model Y, Project P1
  const devA3 = await TenantContext.run({ tenantId: tenantAId, userId: 'sys' }, async () => {
    return deviceRepo.create({
      id: 'dev_ota_003',
      deviceNo: 'DEV_OTA_003',
      imei: '860000000000003',
      productKey: productKeyA,
      status: 'ACTIVE',
      onlineStatus: DeviceOnlineStatus.ONLINE,
      firmwareVersion: 'v1.0.0',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  const vehA3 = await TenantContext.run({ tenantId: tenantAId, userId: 'sys' }, async () => {
    return vehicleRepo.create({
      id: 'veh_ota_003',
      vin: 'VIN_OTA_0000000003',
      plateNumber: '京A00003',
      projectId: 'proj_ota_p1',
      brandId: 'brand_tesla',
      modelId: 'model_y',
      deviceId: devA3.id,
      status: 'NORMAL',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  // 订阅设备上行消息
  messagingAdapter.subscribeDevice(productKeyA, devA1.deviceNo);
  messagingAdapter.subscribeDevice(productKeyA, devA2.deviceNo);
  messagingAdapter.subscribeDevice(productKeyA, devA3.deviceNo);

  // =========================================================================
  // 1. 固件创建、版本唯一性校验与 SHA256 完整性
  // =========================================================================
  await t.test('1. Firmware package creation, version uniqueness and SHA256 integrity', async () => {
    // Tenant A 创建固件包 v2.0.0
    const pkg1 = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
      return firmwareService.createPackage({
        name: 'Model X Firmware Release 2.0.0',
        version: 'v2.0.0',
        targetModelId: 'model_x',
        hardwareVersion: 'HW_v3',
        fileUrl: 'https://cdn.example.com/firmware/mx_v2.0.0.bin',
        fileSizeBytes: 104857600,
        checksumSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        status: FirmwareStatus.ACTIVE,
      });
    });

    assert.ok(pkg1.id, 'Firmware ID should be generated');
    assert.strictEqual(pkg1.version, 'v2.0.0');
    assert.strictEqual(pkg1.checksumSha256, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

    // 重复创建同车型同版本 -> 抛出 ConflictException
    await assert.rejects(
      async () => {
        await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
          return firmwareService.createPackage({
            name: 'Duplicate v2.0.0',
            version: 'v2.0.0',
            targetModelId: 'model_x',
            hardwareVersion: 'HW_v3',
            fileUrl: 'https://cdn.example.com/firmware/mx_v2.0.0_dup.bin',
            fileSizeBytes: 104857600,
            checksumSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          });
        });
      },
      ConflictException,
      'Duplicate version for same model within tenant must throw ConflictException'
    );

    // 未提供 checksumSha256 -> 自动计算 SHA-256
    const pkgAutoHash = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
      return firmwareService.createPackage({
        name: 'Model X Firmware Release 2.1.0',
        version: 'v2.1.0',
        targetModelId: 'model_x',
        hardwareVersion: 'HW_v3',
        fileUrl: 'https://cdn.example.com/firmware/mx_v2.1.0.bin',
        fileSizeBytes: 52428800,
        checksumSha256: '',
      });
    });

    assert.ok(pkgAutoHash.checksumSha256, 'Checksum should be automatically computed');
    assert.strictEqual(pkgAutoHash.checksumSha256.length, 64, 'SHA-256 hex string should be 64 characters');

    // 审计日志留痕检查
    const auditLogs = auditService.getTenantAuditLogs(tenantAId);
    const fwLogs = auditLogs.filter((l) => l.action === 'FIRMWARE_PACKAGE_CREATE');
    assert.ok(fwLogs.length >= 2, 'Audit logs must record FIRMWARE_PACKAGE_CREATE');
  });

  // =========================================================================
  // 2. 多租户数据隔离验证
  // =========================================================================
  await t.test('2. Multi-tenant firmware and plan isolation', async () => {
    // Tenant B 能够创建同名版本 'v2.0.0'（不同租户互不冲突）
    const pkgB = await TenantContext.run({ tenantId: tenantBId, userId: userB.sub }, async () => {
      return firmwareService.createPackage({
        name: 'Tenant B Model X v2.0.0',
        version: 'v2.0.0',
        targetModelId: 'model_x',
        hardwareVersion: 'HW_v3',
        fileUrl: 'https://cdn.tenantb.com/v2.0.0.bin',
        fileSizeBytes: 104857600,
        checksumSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      });
    });

    assert.strictEqual(pkgB.tenantId, tenantBId);
    assert.strictEqual(pkgB.version, 'v2.0.0');

    // Tenant B 列表无法查看到 Tenant A 的固件包
    const listB = await TenantContext.run({ tenantId: tenantBId, userId: userB.sub }, async () => {
      return firmwareService.list();
    });
    assert.strictEqual(listB.length, 1);
    assert.strictEqual(listB[0].id, pkgB.id);

    // Tenant B 无法查看到 Tenant A 的固件详情
    const queryAfromB = await TenantContext.run({ tenantId: tenantBId, userId: userB.sub }, async () => {
      return firmwareService.getById('non_existent_or_tenant_a_id');
    });
    assert.strictEqual(queryAfromB, null);
  });

  // =========================================================================
  // 3. OTA 升级计划创建与多维目标设备解析筛选
  // =========================================================================
  let testFirmwareId: string;
  let testPlanId: string;

  await t.test('3. Plan creation and multi-dimensional target resolution (MODEL / PROJECT / DEVICE_LIST / ALL)', async () => {
    const fwList = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
      return firmwareService.list({ targetModelId: 'model_x' });
    });
    const targetFw = fwList.find((p) => p.version === 'v2.0.0') || fwList[0];
    testFirmwareId = targetFw.id;

    // 3.1 按 MODEL 筛选 (model_x): 应命中 devA1 与 devA2
    const planModel = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
      return planService.createPlan({
        name: 'Model X Fleet Upgrade',
        firmwareId: testFirmwareId,
        targetType: OtaTargetType.MODEL,
        targetIds: ['model_x'],
        batchSize: 10,
        batchIntervalSec: 30,
        maxRetries: 3,
        preCheckRequired: { engineOff: true, minBatteryVoltage: 12.0 },
      });
    });
    assert.strictEqual(planModel.totalDevices, 2, 'MODEL filter should resolve 2 Model X devices');
    assert.strictEqual(planModel.status, OtaPlanStatus.DRAFT);

    const modelTasks = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
      return planService.getPlanTasks(planModel.id);
    });
    assert.strictEqual(modelTasks.length, 2);
    const taskDeviceNos = modelTasks.map((t) => t.deviceNo).sort();
    assert.deepStrictEqual(taskDeviceNos, ['DEV_OTA_001', 'DEV_OTA_002']);

    // 3.2 按 PROJECT 筛选 (proj_ota_p1): 应命中 devA1 (Model X) 与 devA3 (Model Y)
    const planProject = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
      return planService.createPlan({
        name: 'Project P1 Upgrade',
        firmwareId: testFirmwareId,
        targetType: OtaTargetType.PROJECT,
        targetIds: ['proj_ota_p1'],
        batchSize: 5,
        batchIntervalSec: 10,
        maxRetries: 2,
        preCheckRequired: { engineOff: true, minBatteryVoltage: 12.0 },
      });
    });
    assert.strictEqual(planProject.totalDevices, 2, 'PROJECT filter should resolve 2 devices in proj_ota_p1');

    // 3.3 按 DEVICE_LIST 显式指定: 应精确命中
    const planDeviceList = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
      return planService.createPlan({
        name: 'Single Device Canary Upgrade',
        firmwareId: testFirmwareId,
        targetType: OtaTargetType.DEVICE_LIST,
        targetIds: ['DEV_OTA_001'],
        batchSize: 1,
        batchIntervalSec: 10,
        maxRetries: 3,
        preCheckRequired: { engineOff: true, minBatteryVoltage: 12.0 },
      });
    });
    assert.strictEqual(planDeviceList.totalDevices, 1);

    // 3.4 异常校验: 无法解析出任何设备时应抛出 BadRequestException
    await assert.rejects(
      async () => {
        await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
          return planService.createPlan({
            name: 'Empty Target Plan',
            firmwareId: testFirmwareId,
            targetType: OtaTargetType.MODEL,
            targetIds: ['non_existent_model'],
            batchSize: 10,
            batchIntervalSec: 10,
            maxRetries: 3,
            preCheckRequired: { engineOff: true, minBatteryVoltage: 12.0 },
          });
        });
      },
      BadRequestException,
      'Plan with no eligible target devices must throw BadRequestException'
    );

    testPlanId = planModel.id;
  });

  // =========================================================================
  // 4. 行车安全前置门禁阻断 (Engine Running / Low Voltage -> SKIPPED_UNSAFE)
  // =========================================================================
  await t.test('4. Safety pre-check enforcement (Engine ON / Low Voltage -> SKIPPED_UNSAFE)', async () => {
    // 设置 DEV_OTA_001 为行车点火状态 (engineRunning: true)
    otaSafetyService.setDeviceTelemetry('DEV_OTA_001', {
      engineRunning: true,
      batteryVoltage: 13.5,
    });

    // 设置 DEV_OTA_002 为正常熄火与健康电压 (engineRunning: false, batteryVoltage: 12.8)
    otaSafetyService.setDeviceTelemetry('DEV_OTA_002', {
      engineRunning: false,
      batteryVoltage: 12.8,
    });

    // 校验安全探针单测逻辑
    const check1 = await otaSafetyService.checkSafety('DEV_OTA_001');
    assert.strictEqual(check1.safe, false);
    assert.strictEqual(check1.errorCode, 1002);
    assert.strictEqual(check1.reason, 'PRECHECK_FAILED_ENGINE_ON');

    const check2 = await otaSafetyService.checkSafety('DEV_OTA_002');
    assert.strictEqual(check2.safe, true);

    // 校验低电压拦截
    const checkLowVolt = await otaSafetyService.checkSafety('DEV_TEMP', {
      engineRunning: false,
      batteryVoltage: 11.4,
    });
    assert.strictEqual(checkLowVolt.safe, false);
    assert.strictEqual(checkLowVolt.errorCode, 1001);
    assert.strictEqual(checkLowVolt.reason, 'PRECHECK_FAILED_LOW_VOLTAGE');
  });

  // =========================================================================
  // 5. 分批调度执行与 MQTT 下行升级指令下发
  // =========================================================================
  const receivedDownlinks: any[] = [];

  await t.test('5. Plan batch execution and MQTT downlink upgrade command dispatch', async () => {
    // 监听 MQTT 下行 Topic: /sys/{productKey}/{deviceNo}/ota/upgrade
    const upgradeTopicDev2 = MqttTopicBuilder.otaUpgrade(productKeyA, 'DEV_OTA_002');
    sharedBus.on(upgradeTopicDev2, (_t: string, raw: string) => {
      receivedDownlinks.push(JSON.parse(raw));
    });

    // 执行计划 testPlanId
    const executedPlan = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
      return planService.executePlan(testPlanId);
    });

    assert.strictEqual(executedPlan.status, OtaPlanStatus.EXECUTING);

    // 等待 microtask 触发下发
    await new Promise((r) => setTimeout(r, 50));

    // 验证安全门禁拦截:
    // DEV_OTA_001 因点火运行应被拦截 -> SKIPPED_UNSAFE
    // DEV_OTA_002 安全合格 -> NOTIFIED 并成功收到下行
    const tasks = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
      return planService.getPlanTasks(testPlanId);
    });

    const task1 = tasks.find((t) => t.deviceNo === 'DEV_OTA_001');
    assert.ok(task1);
    assert.strictEqual(task1.status, OtaTaskStatus.SKIPPED_UNSAFE);
    assert.strictEqual(task1.failureReason, 'PRECHECK_FAILED_ENGINE_ON');

    const task2 = tasks.find((t) => t.deviceNo === 'DEV_OTA_002');
    assert.ok(task2);
    assert.strictEqual(task2.status, OtaTaskStatus.NOTIFIED);

    // 验证 DEV_OTA_002 收到 MQTT 下行指令
    assert.strictEqual(receivedDownlinks.length, 1, 'Safe device DEV_OTA_002 should receive MQTT downlink');
    assert.strictEqual(receivedDownlinks[0].planId, testPlanId);
    assert.strictEqual(receivedDownlinks[0].version, 'v2.0.0');
    assert.strictEqual(receivedDownlinks[0].taskId, task2.id);
    assert.ok(receivedDownlinks[0].checksumSha256);

    // 验证计划中由于 DEV_OTA_001 被跳过，failedDevices 原子递增为 1
    const currentPlan = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
      return planService.getPlanById(testPlanId);
    });
    assert.strictEqual(currentPlan?.failedDevices, 1);
  });

  // =========================================================================
  // 6. 设备进度上报、WebSocket 广播、终态原子累加与计划自动闭环
  // =========================================================================
  await t.test('6. Progress uplink, WebSocket broadcast, atomic counter and plan completion', async () => {
    const wsProgressEvents: any[] = [];
    const wsCompletedEvents: any[] = [];

    // 订阅 WebSocket OTA 专属房间: ota-plan:{planId}
    const otaRoom = WebSocketRoomBuilder.otaPlanRoom(testPlanId);
    wsGateway.joinRoom(otaRoom, (event, payload) => {
      if (event === WebSocketEvent.OTA_PROGRESS) {
        wsProgressEvents.push(payload);
      } else if (event === WebSocketEvent.OTA_COMPLETED) {
        wsCompletedEvents.push(payload);
      }
    });

    const task2 = (
      await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
        return planService.getPlanTasks(testPlanId);
      })
    ).find((t) => t.deviceNo === 'DEV_OTA_002')!;

    // 6.1 设备上报 DOWNLOADING (25%)
    const otaTopic = MqttTopicBuilder.otaProgress(productKeyA, 'DEV_OTA_002');
    sharedBus.emit(
      otaTopic,
      otaTopic,
      JSON.stringify({
        planId: testPlanId,
        taskId: task2.id,
        deviceNo: 'DEV_OTA_002',
        step: OtaStep.DOWNLOADING,
        progressPercent: 25,
      })
    );
    await new Promise((r) => setTimeout(r, 30));

    assert.strictEqual(wsProgressEvents.length, 1);
    assert.strictEqual(wsProgressEvents[0].step, OtaStep.DOWNLOADING);
    assert.strictEqual(wsProgressEvents[0].progressPercent, 25);

    let t2Updated = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
      return taskRepo.findById(task2.id);
    });
    assert.strictEqual(t2Updated?.status, OtaTaskStatus.DOWNLOADING);
    assert.strictEqual(t2Updated?.progressPercent, 25);

    // 6.2 设备上报 VERIFYING (100%)
    sharedBus.emit(
      otaTopic,
      otaTopic,
      JSON.stringify({
        planId: testPlanId,
        taskId: task2.id,
        deviceNo: 'DEV_OTA_002',
        step: OtaStep.VERIFYING,
        progressPercent: 100,
      })
    );
    await new Promise((r) => setTimeout(r, 30));

    t2Updated = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
      return taskRepo.findById(task2.id);
    });
    assert.strictEqual(t2Updated?.status, OtaTaskStatus.VERIFYING);

    // 6.3 设备上报 FLASHING (100%)
    sharedBus.emit(
      otaTopic,
      otaTopic,
      JSON.stringify({
        planId: testPlanId,
        taskId: task2.id,
        deviceNo: 'DEV_OTA_002',
        step: OtaStep.FLASHING,
        progressPercent: 100,
      })
    );
    await new Promise((r) => setTimeout(r, 30));

    t2Updated = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
      return taskRepo.findById(task2.id);
    });
    assert.strictEqual(t2Updated?.status, OtaTaskStatus.FLASHING);

    // 6.4 设备上报 SUCCESS (100%) -> 任务完成，计划闭环完成
    sharedBus.emit(
      otaTopic,
      otaTopic,
      JSON.stringify({
        planId: testPlanId,
        taskId: task2.id,
        deviceNo: 'DEV_OTA_002',
        step: OtaStep.SUCCESS,
        progressPercent: 100,
      })
    );
    await new Promise((r) => setTimeout(r, 50));

    t2Updated = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
      return taskRepo.findById(task2.id);
    });
    assert.strictEqual(t2Updated?.status, OtaTaskStatus.SUCCESS);
    assert.strictEqual(t2Updated?.progressPercent, 100);

    // 检查计划全局状态流转至 COMPLETED
    const finalPlan = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
      return planService.getPlanById(testPlanId);
    });

    assert.strictEqual(finalPlan?.status, OtaPlanStatus.COMPLETED);
    assert.strictEqual(finalPlan?.successDevices, 1);
    assert.strictEqual(finalPlan?.failedDevices, 1);
    assert.strictEqual(finalPlan?.totalDevices, 2);

    // 检查 WebSocket 广播了 OTA_COMPLETED 事件
    assert.strictEqual(wsCompletedEvents.length, 1);
    assert.strictEqual(wsCompletedEvents[0].planId, testPlanId);
    assert.strictEqual(wsCompletedEvents[0].status, OtaPlanStatus.COMPLETED);
    assert.strictEqual(wsCompletedEvents[0].successDevices, 1);
    assert.strictEqual(wsCompletedEvents[0].failedDevices, 1);

    // 终态保护校验: 对已 SUCCESS 的任务二次修改应拦截
    await assert.rejects(
      async () => {
        await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
          return taskRepo.updateProgress(task2.id, {
            status: OtaTaskStatus.DOWNLOADING,
            step: OtaStep.DOWNLOADING,
            percent: 50,
          });
        });
      },
      /already in terminal status/
    );
  });

  // =========================================================================
  // 7. REST API 控制器端点全流程与多租户权限校验
  // =========================================================================
  await t.test('7. OtaController REST endpoints and cross-tenant guard', async () => {
    // 7.1 Tenant A 调用控制器查询计划详情
    const planDetail = await otaController.getPlanById(testPlanId, { user: userA });
    assert.strictEqual(planDetail.id, testPlanId);

    // 7.2 Tenant B 试图查询 Tenant A 的计划详情 -> 抛出 NotFoundException (租户隔离)
    await assert.rejects(
      async () => {
        await otaController.getPlanById(testPlanId, { user: userB });
      },
      NotFoundException,
      'Tenant B must NOT access Tenant A plan'
    );

    // 7.3 Tenant B 试图执行 Tenant A 的计划 -> 抛出 NotFoundException
    await assert.rejects(
      async () => {
        await otaController.executePlan(testPlanId, { user: userB });
      },
      NotFoundException
    );

    // 7.4 计划暂停与取消状态机校验
    // 创建一个新草稿计划进行 pause/cancel 测试
    const canaryPlan = await otaController.createPlan(
      {
        name: 'Controller Lifecycle Test',
        firmwareId: testFirmwareId,
        targetType: OtaTargetType.DEVICE_LIST,
        targetIds: ['DEV_OTA_002'],
        batchSize: 1,
        batchIntervalSec: 10,
        maxRetries: 3,
        preCheckRequired: { engineOff: true, minBatteryVoltage: 12.0 },
      },
      { user: userA }
    );

    // DRAFT 直接 cancel -> 合法
    const cancelled = await otaController.cancelPlan(canaryPlan.id, { user: userA });
    assert.strictEqual(cancelled.status, OtaPlanStatus.CANCELLED);

    // 从 CANCELLED 再次 execute -> 非法，抛出 BadRequestException
    await assert.rejects(
      async () => {
        await otaController.executePlan(canaryPlan.id, { user: userA });
      },
      BadRequestException
    );
  });
});
