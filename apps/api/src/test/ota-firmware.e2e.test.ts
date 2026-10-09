import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
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
  OtaUpgradeDownlinkPayload,
  OtaProgressPayload,
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
import { DeviceSimulator, InMemoryTransport } from '@car-control/simulator';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InMemoryMessagingAdapter } from '../messaging/in-memory-messaging.adapter.js';
import { WebSocketGatewayService } from '../realtime/websocket.gateway.js';
import { AuditService } from '../audit/audit.service.js';
import { FirmwareService } from '../ota/firmware.service.js';
import { OtaSafetyService } from '../ota/ota-safety.service.js';
import { OtaPlanService } from '../ota/ota-plan.service.js';
import { OtaProgressService } from '../ota/ota-progress.service.js';
import { OtaController } from '../ota/ota.controller.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 4000,
  intervalMs = 20
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) {
      return;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timeout after ${timeoutMs}ms waiting for condition`);
}

test('Gate 5: OTA Firmware Upgrade System E2E Acceptance Suite', async (t) => {
  // 1. 初始化仓储与依赖
  const firmwareRepo = new FirmwareRepository();
  const planRepo = new OtaPlanRepository();
  const taskRepo = new OtaTaskRepository();
  const vehicleRepo = new VehicleRepository();
  const deviceRepo = new DeviceRepository();

  const wsGateway = new WebSocketGatewayService();
  const auditService = new AuditService();
  const otaSafetyService = new OtaSafetyService();

  const sharedBus = new EventEmitter();
  const messagingAdapter = new InMemoryMessagingAdapter(sharedBus);

  // 2. 初始化核心服务与控制器
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

  // 3. 租户上下文凭据
  const tenantAId = 'TENANT_E2E_A';
  const tenantBId = 'TENANT_E2E_B';

  const userA = {
    sub: 'usr_e2e_admin_a',
    tenantId: tenantAId,
    roles: ['ADMIN'],
    permissions: [Permission.DEVICE_READ, Permission.DEVICE_WRITE],
  };

  const userB = {
    sub: 'usr_e2e_admin_b',
    tenantId: tenantBId,
    roles: ['ADMIN'],
    permissions: [Permission.DEVICE_READ, Permission.DEVICE_WRITE],
  };

  const productKeyA = 'PK_OTA_CYBERTRUCK';
  const modelX = 'model_cyber_x';
  const modelY = 'model_cyber_y';
  const projectP1 = 'proj_fleet_alpha';
  const projectP2 = 'proj_fleet_beta';

  // 4. 注册 Tenant A 设备与关联车辆基座数据 (4 台设备覆盖多维组合)
  // Dev 1: Model X, Project P1
  const dev1 = await TenantContext.run({ tenantId: tenantAId, userId: 'sys' }, async () => {
    return deviceRepo.create({
      id: 'dev_ota_e2e_001',
      deviceNo: 'DEV_OTA_E2E_001',
      imei: '861000000000001',
      productKey: productKeyA,
      status: 'ACTIVE',
      onlineStatus: DeviceOnlineStatus.ONLINE,
      firmwareVersion: 'v1.0.0',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  const veh1 = await TenantContext.run({ tenantId: tenantAId, userId: 'sys' }, async () => {
    return vehicleRepo.create({
      id: 'veh_ota_e2e_001',
      vin: 'VIN_E2E_00000000001',
      plateNumber: '粤B10001',
      projectId: projectP1,
      brandId: 'brand_tesla',
      modelId: modelX,
      deviceId: dev1.id,
      status: 'NORMAL',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  // Dev 2: Model X, Project P2
  const dev2 = await TenantContext.run({ tenantId: tenantAId, userId: 'sys' }, async () => {
    return deviceRepo.create({
      id: 'dev_ota_e2e_002',
      deviceNo: 'DEV_OTA_E2E_002',
      imei: '861000000000002',
      productKey: productKeyA,
      status: 'ACTIVE',
      onlineStatus: DeviceOnlineStatus.ONLINE,
      firmwareVersion: 'v1.0.0',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  const veh2 = await TenantContext.run({ tenantId: tenantAId, userId: 'sys' }, async () => {
    return vehicleRepo.create({
      id: 'veh_ota_e2e_002',
      vin: 'VIN_E2E_00000000002',
      plateNumber: '粤B10002',
      projectId: projectP2,
      brandId: 'brand_tesla',
      modelId: modelX,
      deviceId: dev2.id,
      status: 'NORMAL',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  // Dev 3: Model Y, Project P1
  const dev3 = await TenantContext.run({ tenantId: tenantAId, userId: 'sys' }, async () => {
    return deviceRepo.create({
      id: 'dev_ota_e2e_003',
      deviceNo: 'DEV_OTA_E2E_003',
      imei: '861000000000003',
      productKey: productKeyA,
      status: 'ACTIVE',
      onlineStatus: DeviceOnlineStatus.ONLINE,
      firmwareVersion: 'v1.0.0',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  const veh3 = await TenantContext.run({ tenantId: tenantAId, userId: 'sys' }, async () => {
    return vehicleRepo.create({
      id: 'veh_ota_e2e_003',
      vin: 'VIN_E2E_00000000003',
      plateNumber: '粤B10003',
      projectId: projectP1,
      brandId: 'brand_tesla',
      modelId: modelY,
      deviceId: dev3.id,
      status: 'NORMAL',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  // Dev 4: Model Y, Project P2
  const dev4 = await TenantContext.run({ tenantId: tenantAId, userId: 'sys' }, async () => {
    return deviceRepo.create({
      id: 'dev_ota_e2e_004',
      deviceNo: 'DEV_OTA_E2E_004',
      imei: '861000000000004',
      productKey: productKeyA,
      status: 'ACTIVE',
      onlineStatus: DeviceOnlineStatus.ONLINE,
      firmwareVersion: 'v1.0.0',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  const veh4 = await TenantContext.run({ tenantId: tenantAId, userId: 'sys' }, async () => {
    return vehicleRepo.create({
      id: 'veh_ota_e2e_004',
      vin: 'VIN_E2E_00000000004',
      plateNumber: '粤B10004',
      projectId: projectP2,
      brandId: 'brand_tesla',
      modelId: modelY,
      deviceId: dev4.id,
      status: 'NORMAL',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  // 注册设备上行监听端口
  messagingAdapter.subscribeDevice(productKeyA, dev1.deviceNo);
  messagingAdapter.subscribeDevice(productKeyA, dev2.deviceNo);
  messagingAdapter.subscribeDevice(productKeyA, dev3.deviceNo);
  messagingAdapter.subscribeDevice(productKeyA, dev4.deviceNo);

  // =========================================================================
  // 验收标准 1: 固件版本管理与 SHA256 完整性校验
  // =========================================================================
  let testFirmwareId: string;
  let mixedPlanIdForTenantCheck: string;

  await t.test('1. Firmware package management & SHA256 integrity check (AC-1)', async () => {
    // 1.1 创建固件包并指定完整元数据与 SHA256
    const validChecksum = 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e';
    const fwPkg1 = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
      return firmwareService.createPackage({
        name: 'Cybertruck OS 2.0 Stable Release',
        version: 'v2.0.0',
        targetModelId: modelX,
        hardwareVersion: 'HW_REV_4',
        fileUrl: 'https://ota.tesla.com/firmware/cyber_x_v2.0.0.bin',
        fileSizeBytes: 209715200, // 200MB
        checksumSha256: validChecksum,
        status: FirmwareStatus.ACTIVE,
        description: 'Major performance and battery management updates',
      });
    });

    assert.ok(fwPkg1.id, 'Firmware ID must be generated');
    assert.strictEqual(fwPkg1.tenantId, tenantAId, 'Tenant ID must match session');
    assert.strictEqual(fwPkg1.version, 'v2.0.0');
    assert.strictEqual(fwPkg1.checksumSha256, validChecksum);
    assert.strictEqual(fwPkg1.status, FirmwareStatus.ACTIVE);
    assert.strictEqual(fwPkg1.targetModelId, modelX);

    testFirmwareId = fwPkg1.id;

    // 1.2 同租户同车型创建相同版本号必须冲突拒绝 (ConflictException)
    await assert.rejects(
      async () => {
        await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
          return firmwareService.createPackage({
            name: 'Cybertruck OS 2.0 Duplicate',
            version: 'v2.0.0',
            targetModelId: modelX,
            hardwareVersion: 'HW_REV_4',
            fileUrl: 'https://ota.tesla.com/firmware/duplicate.bin',
            fileSizeBytes: 209715200,
            checksumSha256: validChecksum,
          });
        });
      },
      ConflictException,
      'Duplicate firmware version within same tenant and model must throw ConflictException'
    );

    // 1.3 自动 SHA-256 完整性哈希计算 (未提供 checksumSha256 时)
    const fwPkgAuto = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
      return firmwareService.createPackage({
        name: 'Cybertruck OS 2.1 Canary',
        version: 'v2.1.0',
        targetModelId: modelX,
        hardwareVersion: 'HW_REV_4',
        fileUrl: 'https://ota.tesla.com/firmware/cyber_x_v2.1.0.bin',
        fileSizeBytes: 104857600,
        checksumSha256: '', // 留空触发自动计算
      });
    });

    assert.ok(fwPkgAuto.checksumSha256, 'Auto-calculated checksum must exist');
    assert.strictEqual(fwPkgAuto.checksumSha256.length, 64, 'SHA-256 hex string must be 64 characters');
    assert.match(fwPkgAuto.checksumSha256, /^[0-9a-f]{64}$/, 'Checksum must be valid hex SHA-256');

    // 1.4 验证操作审计记录留痕
    const logs = auditService.getTenantAuditLogs(tenantAId);
    const fwLogs = logs.filter((l) => l.action === 'FIRMWARE_PACKAGE_CREATE');
    assert.ok(fwLogs.length >= 2, 'Audit service must record FIRMWARE_PACKAGE_CREATE actions');
  });

  // =========================================================================
  // 验收标准 2: 多维目标设备解析筛选 (MODEL / PROJECT / DEVICE_LIST / ALL)
  // =========================================================================
  await t.test('2. Multi-dimensional target resolution & task QUEUED initialization (AC-2)', async () => {
    // 2.1 按 MODEL 筛选 (modelX): 精确命中 dev1 与 dev2
    const planModel = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
      return planService.createPlan({
        name: 'Model X Fleet OTA Rollout',
        firmwareId: testFirmwareId,
        targetType: OtaTargetType.MODEL,
        targetIds: [modelX],
        batchSize: 10,
        batchIntervalSec: 30,
        maxRetries: 3,
        preCheckRequired: { engineOff: true, minBatteryVoltage: 12.0 },
      });
    });

    assert.strictEqual(planModel.totalDevices, 2, 'MODEL target must resolve exactly 2 Model X devices');
    assert.strictEqual(planModel.status, OtaPlanStatus.DRAFT);

    const modelTasks = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
      return planService.getPlanTasks(planModel.id);
    });
    assert.strictEqual(modelTasks.length, 2);
    for (const task of modelTasks) {
      assert.strictEqual(task.status, OtaTaskStatus.QUEUED);
      assert.strictEqual(task.currentStep, OtaStep.DOWNLOADING);
      assert.strictEqual(task.progressPercent, 0);
      assert.strictEqual(task.retryCount, 0);
    }
    const modelTaskDevs = modelTasks.map((t) => t.deviceNo).sort();
    assert.deepStrictEqual(modelTaskDevs, [dev1.deviceNo, dev2.deviceNo]);

    // 2.2 按 PROJECT 筛选 (projectP1): 精确命中 dev1 (Model X) 与 dev3 (Model Y)
    const planProject = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
      return planService.createPlan({
        name: 'Project Alpha Fleet OTA Rollout',
        firmwareId: testFirmwareId,
        targetType: OtaTargetType.PROJECT,
        targetIds: [projectP1],
        batchSize: 5,
        batchIntervalSec: 20,
        maxRetries: 2,
        preCheckRequired: { engineOff: true, minBatteryVoltage: 12.0 },
      });
    });

    assert.strictEqual(planProject.totalDevices, 2, 'PROJECT target must resolve 2 devices in projectP1');
    const projTasks = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
      return planService.getPlanTasks(planProject.id);
    });
    const projTaskDevs = projTasks.map((t) => t.deviceNo).sort();
    assert.deepStrictEqual(projTaskDevs, [dev1.deviceNo, dev3.deviceNo]);

    // 2.3 按 DEVICE_LIST 显式指定筛选: 精确命中指定的 dev2 与 dev4
    const planDeviceList = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
      return planService.createPlan({
        name: 'Canary Pilot Devices Rollout',
        firmwareId: testFirmwareId,
        targetType: OtaTargetType.DEVICE_LIST,
        targetIds: [dev2.deviceNo, dev4.deviceNo],
        batchSize: 1,
        batchIntervalSec: 10,
        maxRetries: 3,
        preCheckRequired: { engineOff: true, minBatteryVoltage: 12.0 },
      });
    });

    assert.strictEqual(planDeviceList.totalDevices, 2);
    const devListTasks = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
      return planService.getPlanTasks(planDeviceList.id);
    });
    const devListNos = devListTasks.map((t) => t.deviceNo).sort();
    assert.deepStrictEqual(devListNos, [dev2.deviceNo, dev4.deviceNo]);

    // 2.4 按 ALL 全量筛选: 命中租户下全部 4 台活跃设备
    const planAll = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
      return planService.createPlan({
        name: 'Full Fleet Complete Upgrade',
        firmwareId: testFirmwareId,
        targetType: OtaTargetType.ALL,
        targetIds: [],
        batchSize: 10,
        batchIntervalSec: 30,
        maxRetries: 3,
        preCheckRequired: { engineOff: true, minBatteryVoltage: 12.0 },
      });
    });

    assert.strictEqual(planAll.totalDevices, 4, 'ALL target must resolve all 4 devices');

    // 2.5 异常校验: 目标匹配为 0 台设备时抛出 BadRequestException
    await assert.rejects(
      async () => {
        await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
          return planService.createPlan({
            name: 'Non Existent Target Plan',
            firmwareId: testFirmwareId,
            targetType: OtaTargetType.MODEL,
            targetIds: ['model_non_existent'],
            batchSize: 10,
            batchIntervalSec: 10,
            maxRetries: 3,
            preCheckRequired: { engineOff: true, minBatteryVoltage: 12.0 },
          });
        });
      },
      BadRequestException,
      'Plan with 0 matching target devices must throw BadRequestException'
    );
  });

  // =========================================================================
  // 验收标准 3: 安全前置检查拦截 (Safety Pre-check: Engine ON & Low Voltage)
  // =========================================================================
  await t.test('3. Safety pre-check enforcement & atomic skipped counter (AC-3)', async () => {
    // 3.1 独立安全前置探针逻辑校验
    // 模拟 dev1 行车点火 (engineRunning: true)
    otaSafetyService.setDeviceTelemetry(dev1.deviceNo, {
      engineRunning: true,
      batteryVoltage: 13.8,
    });
    const checkEngineOn = await otaSafetyService.checkSafety(dev1.deviceNo);
    assert.strictEqual(checkEngineOn.safe, false);
    assert.strictEqual(checkEngineOn.errorCode, 1002);
    assert.strictEqual(checkEngineOn.reason, 'PRECHECK_FAILED_ENGINE_ON');

    // 模拟 dev2 熄火但小蓄电池欠压 (batteryVoltage: 11.2V < 12.0V)
    otaSafetyService.setDeviceTelemetry(dev2.deviceNo, {
      engineRunning: false,
      batteryVoltage: 11.2,
    });
    const checkLowVolt = await otaSafetyService.checkSafety(dev2.deviceNo);
    assert.strictEqual(checkLowVolt.safe, false);
    assert.strictEqual(checkLowVolt.errorCode, 1001);
    assert.strictEqual(checkLowVolt.reason, 'PRECHECK_FAILED_LOW_VOLTAGE');

    // 模拟 dev3 正常熄火与健康电压
    otaSafetyService.setDeviceTelemetry(dev3.deviceNo, {
      engineRunning: false,
      batteryVoltage: 12.8,
    });
    const checkSafe = await otaSafetyService.checkSafety(dev3.deviceNo);
    assert.strictEqual(checkSafe.safe, true);

    // 3.2 升级计划执行过程中的真实安全门禁拦截与任务状态流转
    // 创建一个包含 dev1 (行车中), dev2 (欠压), dev3 (合格) 的计划
    const mixedPlan = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
      return planService.createPlan({
        name: 'Safety Pre-check Verification Plan',
        firmwareId: testFirmwareId,
        targetType: OtaTargetType.DEVICE_LIST,
        targetIds: [dev1.deviceNo, dev2.deviceNo, dev3.deviceNo],
        batchSize: 5,
        batchIntervalSec: 10,
        maxRetries: 3,
        preCheckRequired: { engineOff: true, minBatteryVoltage: 12.0 },
      });
    });

    assert.strictEqual(mixedPlan.totalDevices, 3);

    // 执行计划
    await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
      return planService.executePlan(mixedPlan.id);
    });

    const tasks = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
      return planService.getPlanTasks(mixedPlan.id);
    });

    // dev1 因点火运行被拦截 -> SKIPPED_UNSAFE
    const task1 = tasks.find((t) => t.deviceNo === dev1.deviceNo);
    assert.ok(task1);
    assert.strictEqual(task1.status, OtaTaskStatus.SKIPPED_UNSAFE);
    assert.strictEqual(task1.failureReason, 'PRECHECK_FAILED_ENGINE_ON');

    // dev2 因电压过低被拦截 -> SKIPPED_UNSAFE
    const task2 = tasks.find((t) => t.deviceNo === dev2.deviceNo);
    assert.ok(task2);
    assert.strictEqual(task2.status, OtaTaskStatus.SKIPPED_UNSAFE);
    assert.strictEqual(task2.failureReason, 'PRECHECK_FAILED_LOW_VOLTAGE');

    // dev3 安全通过 -> NOTIFIED
    const task3 = tasks.find((t) => t.deviceNo === dev3.deviceNo);
    assert.ok(task3);
    assert.strictEqual(task3.status, OtaTaskStatus.NOTIFIED);

    // 计划失败计数器原子累加：2 台不安全设备被跳过 -> failedDevices: 2
    const updatedMixedPlan = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
      return planService.getPlanById(mixedPlan.id);
    });
    assert.strictEqual(updatedMixedPlan?.failedDevices, 2);
    mixedPlanIdForTenantCheck = mixedPlan.id;
  });

  // =========================================================================
  // 验收标准 4: 分批次并发调度下发 (Batch scheduling & Downlink MQTT)
  // =========================================================================
  await t.test('4. Batch scheduling & downlink MQTT upgrade dispatch (AC-4)', async () => {
    // 恢复 dev1 和 dev2 为安全状态
    otaSafetyService.setDeviceTelemetry(dev1.deviceNo, {
      engineRunning: false,
      batteryVoltage: 12.8,
    });
    otaSafetyService.setDeviceTelemetry(dev2.deviceNo, {
      engineRunning: false,
      batteryVoltage: 12.8,
    });

    const receivedDownlinks: Record<string, OtaUpgradeDownlinkPayload> = {};

    const subTopicDev1 = MqttTopicBuilder.otaUpgrade(productKeyA, dev1.deviceNo);
    const subTopicDev2 = MqttTopicBuilder.otaUpgrade(productKeyA, dev2.deviceNo);

    const onDownlink = (_topic: string, raw: string) => {
      try {
        const payload = JSON.parse(raw);
        if (payload.planId) {
          receivedDownlinks[payload.taskId] = payload;
        }
      } catch {}
    };

    sharedBus.on(subTopicDev1, onDownlink);
    sharedBus.on(subTopicDev2, onDownlink);

    // 创建分批调度计划 (batchSize = 1, dev1 & dev2 分批下发)
    const batchPlan = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
      return planService.createPlan({
        name: 'Batch Dispatch Verification Plan',
        firmwareId: testFirmwareId,
        targetType: OtaTargetType.MODEL,
        targetIds: [modelX],
        batchSize: 1,
        batchIntervalSec: 10,
        maxRetries: 3,
        preCheckRequired: { engineOff: true, minBatteryVoltage: 12.0 },
      });
    });

    const executed = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
      return planService.executePlan(batchPlan.id);
    });
    assert.strictEqual(executed.status, OtaPlanStatus.EXECUTING);

    await sleep(50);

    const tasks = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
      return planService.getPlanTasks(batchPlan.id);
    });
    assert.strictEqual(tasks.length, 2);

    for (const task of tasks) {
      assert.strictEqual(task.status, OtaTaskStatus.NOTIFIED);
      const downlink = receivedDownlinks[task.id];
      assert.ok(downlink, `MQTT downlink must be published for task ${task.id}`);
      assert.strictEqual(downlink.planId, batchPlan.id);
      assert.strictEqual(downlink.version, 'v2.0.0');
      assert.strictEqual(downlink.taskId, task.id);
      assert.ok(downlink.traceId);
      assert.ok(downlink.fileUrl);
      assert.strictEqual(downlink.fileSizeBytes, 209715200);
      assert.ok(downlink.checksumSha256);
    }

    sharedBus.off(subTopicDev1, onDownlink);
    sharedBus.off(subTopicDev2, onDownlink);
  });

  // =========================================================================
  // 验收标准 5: 设备模拟器升级进度全链路闭环 (E2E with DeviceSimulator)
  // =========================================================================
  await t.test('5. Device simulator full upgrade lifecycle closed loop & WebSocket broadcast (AC-5)', async () => {
    // 注册一台专供端到端闭环升级的设备与车辆
    const simDeviceNo = 'DEV_OTA_SIM_SUCCESS';
    const simDev = await TenantContext.run({ tenantId: tenantAId, userId: 'sys' }, async () => {
      return deviceRepo.create({
        id: 'dev_ota_sim_success_id',
        deviceNo: simDeviceNo,
        imei: '862000000000001',
        productKey: productKeyA,
        status: 'ACTIVE',
        onlineStatus: DeviceOnlineStatus.ONLINE,
        firmwareVersion: 'v1.0.0',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    await TenantContext.run({ tenantId: tenantAId, userId: 'sys' }, async () => {
      return vehicleRepo.create({
        id: 'veh_ota_sim_success_id',
        vin: 'VIN_SIM_SUCCESS_0001',
        plateNumber: '粤B99991',
        projectId: projectP1,
        brandId: 'brand_tesla',
        modelId: modelX,
        deviceId: simDev.id,
        status: 'NORMAL',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    // 订阅消息适配器监听该设备
    messagingAdapter.subscribeDevice(productKeyA, simDeviceNo);

    // 设置遥测处于安全状态
    otaSafetyService.setDeviceTelemetry(simDeviceNo, {
      engineRunning: false,
      batteryVoltage: 12.8,
    });

    // 启动真实的 DeviceSimulator
    const simTransport = new InMemoryTransport(sharedBus);
    const simulator = new DeviceSimulator(
      {
        productKey: productKeyA,
        deviceNo: simDeviceNo,
        simulatedEngineRunning: false,
        simulatedBatteryVoltage: 12.8,
        currentFirmwareVersion: 'v1.0.0',
        otaDownloadIntervalMs: 5, // 5ms 加速仿真
      },
      simTransport
    );
    await simulator.start();

    // 创建专属 OTA 升级计划
    const plan = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
      return planService.createPlan({
        name: 'DeviceSimulator E2E Upgrade Closed Loop',
        firmwareId: testFirmwareId,
        targetType: OtaTargetType.DEVICE_LIST,
        targetIds: [simDeviceNo],
        batchSize: 1,
        batchIntervalSec: 10,
        maxRetries: 3,
        preCheckRequired: { engineOff: true, minBatteryVoltage: 12.0 },
      });
    });

    // 监听 WebSocket OTA 专属房间: ota-plan:{planId}
    const otaRoom = WebSocketRoomBuilder.otaPlanRoom(plan.id);
    const wsProgressEvents: OtaProgressPayload[] = [];
    const wsCompletedEvents: any[] = [];

    const unsubscribeWs = wsGateway.joinRoom(otaRoom, (event, payload) => {
      if (event === WebSocketEvent.OTA_PROGRESS) {
        wsProgressEvents.push(payload as OtaProgressPayload);
      } else if (event === WebSocketEvent.OTA_COMPLETED) {
        wsCompletedEvents.push(payload);
      }
    });

    try {
      // 触发计划执行：云端下发 MQTT 指令，模拟器自动驱动全链路升级
      await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
        return planService.executePlan(plan.id);
      });

      // 异步等待模拟器走完全部阶段并自动闭环为 COMPLETED
      await waitFor(async () => {
        const currentPlan = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
          return planService.getPlanById(plan.id);
        });
        return currentPlan?.status === OtaPlanStatus.COMPLETED;
      }, 4000);

      // 1. 验证 WebSocket 广播接收到了全部升级步骤
      const stepsReported = wsProgressEvents.map((e) => e.step);
      assert.ok(stepsReported.includes(OtaStep.DOWNLOADING), 'WebSocket must receive DOWNLOADING progress');
      assert.ok(stepsReported.includes(OtaStep.VERIFYING), 'WebSocket must receive VERIFYING progress');
      assert.ok(stepsReported.includes(OtaStep.FLASHING), 'WebSocket must receive FLASHING progress');
      assert.ok(stepsReported.includes(OtaStep.SUCCESS), 'WebSocket must receive SUCCESS progress');

      // 2. 验证任务在数据库中的终态
      const tasks = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
        return planService.getPlanTasks(plan.id);
      });
      assert.strictEqual(tasks.length, 1);
      assert.strictEqual(tasks[0].status, OtaTaskStatus.SUCCESS);
      assert.strictEqual(tasks[0].progressPercent, 100);

      // 3. 验证模拟器本地固件版本成功更新
      const simTelemetry = simulator.getTelemetry();
      assert.strictEqual(simTelemetry.firmwareVersion, 'v2.0.0', 'Simulator firmware version must be updated to v2.0.0');

      // 4. 验证计划终态与 WebSocket OTA_COMPLETED 广播
      const finalPlan = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
        return planService.getPlanById(plan.id);
      });
      assert.strictEqual(finalPlan?.status, OtaPlanStatus.COMPLETED);
      assert.strictEqual(finalPlan?.successDevices, 1);
      assert.strictEqual(finalPlan?.failedDevices, 0);

      assert.strictEqual(wsCompletedEvents.length, 1, 'WebSocket must receive exactly 1 OTA_COMPLETED event');
      assert.strictEqual(wsCompletedEvents[0].planId, plan.id);
      assert.strictEqual(wsCompletedEvents[0].status, OtaPlanStatus.COMPLETED);
      assert.strictEqual(wsCompletedEvents[0].successDevices, 1);
      assert.strictEqual(wsCompletedEvents[0].failedDevices, 0);
    } finally {
      unsubscribeWs();
      await simulator.stop();
    }
  });

  // =========================================================================
  // 验收标准 6: 升级失败与重试机制 (Upgrade Failure & Retry)
  // =========================================================================
  await t.test('6. Upgrade failure handling & retry counter increment (AC-6)', async () => {
    // 注册一台专门模拟刷写阶段失败的设备
    const failDeviceNo = 'DEV_OTA_SIM_FAIL';
    const failDev = await TenantContext.run({ tenantId: tenantAId, userId: 'sys' }, async () => {
      return deviceRepo.create({
        id: 'dev_ota_sim_fail_id',
        deviceNo: failDeviceNo,
        imei: '862000000000002',
        productKey: productKeyA,
        status: 'ACTIVE',
        onlineStatus: DeviceOnlineStatus.ONLINE,
        firmwareVersion: 'v1.0.0',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    await TenantContext.run({ tenantId: tenantAId, userId: 'sys' }, async () => {
      return vehicleRepo.create({
        id: 'veh_ota_sim_fail_id',
        vin: 'VIN_SIM_FAIL_0001',
        plateNumber: '粤B99992',
        projectId: projectP1,
        brandId: 'brand_tesla',
        modelId: modelX,
        deviceId: failDev.id,
        status: 'NORMAL',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    messagingAdapter.subscribeDevice(productKeyA, failDeviceNo);

    otaSafetyService.setDeviceTelemetry(failDeviceNo, {
      engineRunning: false,
      batteryVoltage: 12.8,
    });

    // 启动模拟器并配置在 FLASHING 步骤强制失败
    const failSimTransport = new InMemoryTransport(sharedBus);
    const failSimulator = new DeviceSimulator(
      {
        productKey: productKeyA,
        deviceNo: failDeviceNo,
        simulatedEngineRunning: false,
        simulatedBatteryVoltage: 12.8,
        currentFirmwareVersion: 'v1.0.0',
        failOtaAtStep: OtaStep.FLASHING, // 模拟刷写失败
        otaDownloadIntervalMs: 5,
      },
      failSimTransport
    );
    await failSimulator.start();

    const failPlan = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
      return planService.createPlan({
        name: 'Failure and Retry Handling Plan',
        firmwareId: testFirmwareId,
        targetType: OtaTargetType.DEVICE_LIST,
        targetIds: [failDeviceNo],
        batchSize: 1,
        batchIntervalSec: 10,
        maxRetries: 3,
        preCheckRequired: { engineOff: true, minBatteryVoltage: 12.0 },
      });
    });

    try {
      await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
        return planService.executePlan(failPlan.id);
      });

      // 等待模拟器上报失败并同步到数据库
      await waitFor(async () => {
        const task = (
          await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
            return planService.getPlanTasks(failPlan.id);
          })
        )[0];
        return task?.status === OtaTaskStatus.FAILED;
      }, 4000);

      const tasks = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
        return planService.getPlanTasks(failPlan.id);
      });
      assert.strictEqual(tasks.length, 1);
      const failedTask = tasks[0];

      // 验证任务记录失败原因、错误状态与重试计数原子自增
      assert.strictEqual(failedTask.status, OtaTaskStatus.FAILED);
      assert.strictEqual(failedTask.failureReason, 'FLASH_WRITE_ERROR');
      assert.strictEqual(failedTask.retryCount, 1, 'Retry count must be incremented upon failure');

      // 验证计划中失败设备数统计原子累加
      const updatedPlan = await TenantContext.run({ tenantId: tenantAId, userId: userA.sub }, async () => {
        return planService.getPlanById(failPlan.id);
      });
      assert.strictEqual(updatedPlan?.failedDevices, 1);
      assert.strictEqual(updatedPlan?.successDevices, 0);
      assert.strictEqual(updatedPlan?.status, OtaPlanStatus.COMPLETED);
    } finally {
      await failSimulator.stop();
    }
  });

  // =========================================================================
  // 验收标准 7: 多租户安全隔离防线 (Multi-Tenant Isolation)
  // =========================================================================
  await t.test('7. Multi-tenant security isolation boundary (AC-7)', async () => {
    // 7.1 Tenant B 能够正常创建与 Tenant A 相同版本号的固件 (互不冲突)
    const pkgB = await TenantContext.run({ tenantId: tenantBId, userId: userB.sub }, async () => {
      return firmwareService.createPackage({
        name: 'Tenant B Isolated Firmware v2.0.0',
        version: 'v2.0.0',
        targetModelId: modelX,
        hardwareVersion: 'HW_REV_B',
        fileUrl: 'https://cdn.tenant-b.com/fw/v2.0.0.bin',
        fileSizeBytes: 104857600,
        checksumSha256: 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e',
      });
    });

    assert.strictEqual(pkgB.tenantId, tenantBId);
    assert.strictEqual(pkgB.version, 'v2.0.0');

    // 7.2 Tenant B 查询固件列表只能看到自己的固件
    const listB = await TenantContext.run({ tenantId: tenantBId, userId: userB.sub }, async () => {
      return firmwareService.list();
    });
    assert.strictEqual(listB.length, 1);
    assert.strictEqual(listB[0].id, pkgB.id);

    // 7.3 Tenant B 无法查看到 Tenant A 的固件详情
    const getPkgAfromB = await TenantContext.run({ tenantId: tenantBId, userId: userB.sub }, async () => {
      return firmwareService.getById(testFirmwareId);
    });
    assert.strictEqual(getPkgAfromB, null, 'Tenant B must NOT access Tenant A firmware');

    // 7.4 Tenant B 无法查看 Tenant A 的计划与任务
    const getPlanAfromB = await TenantContext.run({ tenantId: tenantBId, userId: userB.sub }, async () => {
      return planService.getPlanById(mixedPlanIdForTenantCheck);
    });
    assert.strictEqual(getPlanAfromB, null, 'Tenant B must NOT access Tenant A plan');

    // 7.5 REST API 控制器层强制隔离与安全拦截
    // Tenant B 请求 Tenant A 固件包详情 -> 抛出 404 NotFoundException
    await assert.rejects(
      async () => {
        await otaController.getFirmwareById(testFirmwareId, { user: userB });
      },
      NotFoundException,
      'REST Controller must throw NotFoundException when accessing other tenant firmware'
    );

    // Tenant B 请求 Tenant A 计划详情 -> 抛出 404 NotFoundException
    await assert.rejects(
      async () => {
        await otaController.getPlanById(mixedPlanIdForTenantCheck, { user: userB });
      },
      NotFoundException,
      'REST Controller must throw NotFoundException when accessing other tenant plan'
    );

    // Tenant B 试图执行 Tenant A 的计划 -> 抛出 404 NotFoundException
    await assert.rejects(
      async () => {
        await otaController.executePlan(mixedPlanIdForTenantCheck, { user: userB });
      },
      NotFoundException
    );

    // Tenant B 试图暂停 Tenant A 的计划 -> 抛出 404 NotFoundException
    await assert.rejects(
      async () => {
        await otaController.pausePlan(mixedPlanIdForTenantCheck, { user: userB });
      },
      NotFoundException
    );

    // Tenant B 试图取消 Tenant A 的计划 -> 抛出 404 NotFoundException
    await assert.rejects(
      async () => {
        await otaController.cancelPlan(mixedPlanIdForTenantCheck, { user: userB });
      },
      NotFoundException
    );

    // Tenant B 试图获取 Tenant A 计划的任务列表 -> 抛出 404 NotFoundException
    await assert.rejects(
      async () => {
        await otaController.getPlanTasks(mixedPlanIdForTenantCheck, { user: userB });
      },
      NotFoundException
    );
  });
});
