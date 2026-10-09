import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CommandCode,
  CommandStatus,
  SecurityLevel,
  WebSocketEvent,
} from '@car-control/contracts';
import { DeviceOnlineStatus } from '@car-control/domain-types';
import {
  CapabilityRepository,
  VehicleRepository,
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

test('Gate 3: Control Closed Loop & Capability Engine Acceptance Suite', async (t) => {
  const tenantId = 'TENANT_DEFAULT';
  const userId = 'user_admin_01';
  const tenantSession = { tenantId, userId };

  // 1. 初始化仓储与服务
  const capabilityRepo = new CapabilityRepository();
  const vehicleRepo = new VehicleRepository();
  const auditService = new AuditService();
  const deviceStatusService = new DeviceStatusService();
  const wsGateway = new WebSocketGatewayService();

  const sharedBus = InMemoryMessagingAdapter.getSharedBus();
  const simTransport = new InMemoryTransport(sharedBus);
  const messagingAdapter = new InMemoryMessagingAdapter(sharedBus);

  const capabilityEngine = new CapabilityEngine(capabilityRepo, vehicleRepo);
  const securityService = new ControlSecurityService();

  const commandService = new CommandService(
    messagingAdapter,
    deviceStatusService,
    wsGateway,
    capabilityEngine,
    securityService,
    vehicleRepo,
    auditService
  );

  // 准备测试数据：项目与车型模板
  const modelEv = 'model_ev_taycan';
  const modelGas = 'model_gas_panamera';
  const projectFleet = 'proj_ride_fleet';

  // 车型模板：纯电车型不支持远程点火 (CMD_ENGINE_START)
  await capabilityRepo.saveModelTemplate({
    modelId: modelEv,
    modelName: '保时捷 Taycan 纯电',
    capabilities: {
      [CommandCode.CMD_ENGINE_START]: { supported: false },
      [CommandCode.CMD_ENGINE_STOP]: { supported: false },
      [CommandCode.CMD_UNLOCK]: { supported: true, securityLevel: SecurityLevel.L1 },
      [CommandCode.CMD_LOCK]: { supported: true, securityLevel: SecurityLevel.L0 },
      [CommandCode.CMD_TRUNK_OPEN]: { supported: true, securityLevel: SecurityLevel.L1 },
    },
  });

  // 燃油车型：支持点火 (L2)
  await capabilityRepo.saveModelTemplate({
    modelId: modelGas,
    modelName: '保时捷 Panamera 燃油',
    capabilities: {
      [CommandCode.CMD_ENGINE_START]: { supported: true, securityLevel: SecurityLevel.L2 },
      [CommandCode.CMD_ENGINE_STOP]: { supported: true, securityLevel: SecurityLevel.L2 },
      [CommandCode.CMD_UNLOCK]: { supported: true, securityLevel: SecurityLevel.L1 },
      [CommandCode.CMD_LOCK]: { supported: true, securityLevel: SecurityLevel.L0 },
    },
  });

  // 项目级覆盖：大客户网约车项目禁用后备箱开启 (CMD_TRUNK_OPEN)
  await capabilityRepo.saveProjectOverride({
    projectId: projectFleet,
    overrides: {
      [CommandCode.CMD_TRUNK_OPEN]: { supported: false },
    },
  });

  // 录入两辆测试车辆
  let evVehicle: any;
  let gasVehicle: any;

  await TenantContext.run(tenantSession, async () => {
    evVehicle = await vehicleRepo.create({
      id: 'veh_ev_001',
      projectId: projectFleet,
      vin: 'VIN_EV_0000000001',
      plateNumber: '粤B111EV',
      brandId: 'brand_porsche',
      modelId: modelEv,
      deviceId: 'TBOX_EV_001',
      status: 'NORMAL',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    gasVehicle = await vehicleRepo.create({
      id: 'veh_gas_002',
      projectId: 'proj_retail', // 普通零售项目
      vin: 'VIN_GAS_000000002',
      plateNumber: '粤B222GAS',
      brandId: 'brand_porsche',
      modelId: modelGas,
      deviceId: 'TBOX_GAS_002',
      status: 'NORMAL',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  // 设备状态准备
  deviceStatusService.registerDevice({
    deviceNo: 'TBOX_EV_001',
    productKey: 'CAR_DEMO_PK',
    vehicleId: evVehicle.id,
    onlineStatus: DeviceOnlineStatus.ONLINE,
  });
  deviceStatusService.setOnlineStatus('TBOX_EV_001', true);

  deviceStatusService.registerDevice({
    deviceNo: 'TBOX_GAS_002',
    productKey: 'CAR_DEMO_PK',
    vehicleId: gasVehicle.id,
    onlineStatus: DeviceOnlineStatus.ONLINE,
  });
  deviceStatusService.setOnlineStatus('TBOX_GAS_002', true);

  messagingAdapter.subscribeDevice('CAR_DEMO_PK', 'TBOX_EV_001');
  messagingAdapter.subscribeDevice('CAR_DEMO_PK', 'TBOX_GAS_002');

  await t.test('1. Capability inheritance: model template prohibits pure EV ignition', async () => {
    await TenantContext.run(tenantSession, async () => {
      // 纯电车型不支持 CMD_ENGINE_START
      await assert.rejects(
        async () => {
          await commandService.executeCommand({
            tenantId,
            vehicleId: evVehicle.id,
            commandCode: CommandCode.CMD_ENGINE_START,
            idempotencyKey: `idemp_ev_start_${Date.now()}`,
            operatorId: userId,
            confirmationToken: 'SEC_CONFIRM_TOKEN_L2',
          });
        },
        {
          name: 'BadRequestException',
          message: /Reason: UNSUPPORTED_BY_MODEL/,
        }
      );
    });
  });

  await t.test('2. Capability inheritance: project override disables trunk open', async () => {
    await TenantContext.run(tenantSession, async () => {
      // projectFleet 项目覆盖禁用 CMD_TRUNK_OPEN
      await assert.rejects(
        async () => {
          await commandService.executeCommand({
            tenantId,
            vehicleId: evVehicle.id,
            commandCode: CommandCode.CMD_TRUNK_OPEN,
            idempotencyKey: `idemp_trunk_${Date.now()}`,
            operatorId: userId,
            securityCode: '666888',
          });
        },
        {
          name: 'BadRequestException',
          message: /Reason: DISABLED_BY_PROJECT/,
        }
      );
    });
  });

  await t.test('3. Single-vehicle override has highest precedence', async () => {
    // 某车辆车窗故障，单车覆盖禁用车窗
    await capabilityRepo.saveVehicleOverride({
      vehicleId: gasVehicle.id,
      overrides: {
        [CommandCode.CMD_WINDOW_OPEN]: { supported: false },
      },
    });

    await TenantContext.run(tenantSession, async () => {
      await assert.rejects(
        async () => {
          await commandService.executeCommand({
            tenantId,
            vehicleId: gasVehicle.id,
            commandCode: CommandCode.CMD_WINDOW_OPEN,
            idempotencyKey: `idemp_window_${Date.now()}`,
            operatorId: userId,
            securityCode: '666888',
          });
        },
        {
          name: 'BadRequestException',
          message: /Reason: OVERRIDDEN_BY_VEHICLE/,
        }
      );
    });
  });

  await t.test('4. Security L1: requires valid security code', async () => {
    await TenantContext.run(tenantSession, async () => {
      // 缺少安全码被拦截
      await assert.rejects(
        async () => {
          await commandService.executeCommand({
            tenantId,
            vehicleId: evVehicle.id,
            commandCode: CommandCode.CMD_UNLOCK,
            idempotencyKey: `idemp_no_sec_${Date.now()}`,
            operatorId: userId,
          });
        },
        {
          name: 'ForbiddenException',
          message: /Security code required/,
        }
      );

      // 错误安全码被拦截
      await assert.rejects(
        async () => {
          await commandService.executeCommand({
            tenantId,
            vehicleId: evVehicle.id,
            commandCode: CommandCode.CMD_UNLOCK,
            idempotencyKey: `idemp_wrong_sec_${Date.now()}`,
            operatorId: userId,
            securityCode: '000000',
          });
        },
        {
          name: 'ForbiddenException',
          message: /Invalid security code/,
        }
      );
    });
  });

  await t.test('5. Security L2: requires strong confirmation token', async () => {
    await TenantContext.run(tenantSession, async () => {
      // 燃油车下发点火缺少确认凭据被拦截
      await assert.rejects(
        async () => {
          await commandService.executeCommand({
            tenantId,
            vehicleId: gasVehicle.id,
            commandCode: CommandCode.CMD_ENGINE_START,
            idempotencyKey: `idemp_no_token_${Date.now()}`,
            operatorId: userId,
          });
        },
        {
          name: 'ForbiddenException',
          message: /Strong confirmation token required/,
        }
      );
    });
  });

  await t.test('6. Rate limiting: rejects rapid repeated invocations', async () => {
    await TenantContext.run(tenantSession, async () => {
      // 第一次下发 L0 锁车指令成功
      await commandService.executeCommand({
        tenantId,
        vehicleId: evVehicle.id,
        commandCode: CommandCode.CMD_LOCK,
        idempotencyKey: `idemp_lock_1_${Date.now()}`,
        operatorId: userId,
      });

      // 立即在冷却时间内再次触发相同指令，触发 429 限流拦截
      await assert.rejects(
        async () => {
          await commandService.executeCommand({
            tenantId,
            vehicleId: evVehicle.id,
            commandCode: CommandCode.CMD_LOCK,
            idempotencyKey: `idemp_lock_2_${Date.now()}`,
            operatorId: userId,
          });
        },
        {
          message: /Rate Limited/,
        }
      );
    });
  });

  await t.test('7. Operational risk control: prohibits control on LOCKED/MAINTENANCE vehicles', async () => {
    await TenantContext.run(tenantSession, async () => {
      // 维保状态车辆禁止启动发动机
      await vehicleRepo.updateStatus(gasVehicle.id, 'MAINTENANCE');
      await assert.rejects(
        async () => {
          await commandService.executeCommand({
            tenantId,
            vehicleId: gasVehicle.id,
            commandCode: CommandCode.CMD_ENGINE_START,
            idempotencyKey: `idemp_maint_${Date.now()}`,
            operatorId: userId,
            confirmationToken: 'SEC_CONFIRM_TOKEN_L2',
          });
        },
        {
          name: 'ForbiddenException',
          message: /under MAINTENANCE/,
        }
      );

      // 风控锁死车辆禁止解锁
      await vehicleRepo.updateStatus(gasVehicle.id, 'LOCKED');
      await assert.rejects(
        async () => {
          await commandService.executeCommand({
            tenantId,
            vehicleId: gasVehicle.id,
            commandCode: CommandCode.CMD_UNLOCK,
            idempotencyKey: `idemp_locked_${Date.now()}`,
            operatorId: userId,
            securityCode: '666888',
          });
        },
        {
          name: 'ForbiddenException',
          message: /LOCKED by platform risk control/,
        }
      );

      // 恢复为正常状态
      await vehicleRepo.updateStatus(gasVehicle.id, 'NORMAL');
    });
  });

  await t.test('8. Full End-to-End closed loop with simulator ACK & WebSocket push', async () => {
    // 启动模拟器响应燃油车指令
    const simulator = new DeviceSimulator(
      {
        productKey: 'CAR_DEMO_PK',
        deviceNo: 'TBOX_GAS_002',
        defaultLatencyMs: 30,
      },
      simTransport
    );
    await simulator.start();
    await new Promise((r) => setTimeout(r, 50));

    const events: any[] = [];
    wsGateway.joinVehicleRoom(gasVehicle.id, (event, payload) => {
      events.push({ event, payload });
    });

    await TenantContext.run(tenantSession, async () => {
      const record = await commandService.executeCommand({
        tenantId,
        vehicleId: gasVehicle.id,
        commandCode: CommandCode.CMD_ENGINE_START,
        idempotencyKey: `idemp_e2e_start_${Date.now()}`,
        operatorId: userId,
        confirmationToken: 'SEC_CONFIRM_TOKEN_L2',
      });

      assert.equal(record.status, CommandStatus.WAITING_ACK);
      assert.equal(record.securityLevel, SecurityLevel.L2);

      // 等待模拟器 ACK
      await new Promise((r) => setTimeout(r, 120));

      const updated = commandService.getCommand(record.id);
      assert.equal(updated.status, CommandStatus.SUCCESS);
      assert.ok(updated.ackedAt);

      // 验证 WebSocket 收到 SUCCESS 推送
      const successEvent = events.find((e) => e.event === WebSocketEvent.COMMAND_SUCCESS);
      assert.ok(successEvent);
      assert.equal(successEvent.payload.id, record.id);
    });

    await simulator.stop();
  });
});
