import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandCode, CommandStatus, WebSocketEvent } from '@car-control/contracts';
import { InMemoryTransport, DeviceSimulator } from '@car-control/simulator';
import { InMemoryMessagingAdapter } from '../messaging/in-memory-messaging.adapter.js';
import { DeviceStatusService } from '../device/device-status.service.js';
import { WebSocketGatewayService } from '../realtime/websocket.gateway.js';
import { CommandService } from '../command/command.service.js';

test('Gate 0: Transport POC End-to-End Control Loop Verification', async (t) => {
  const productKey = 'POC_PK_01';
  const deviceNo = 'POC_DEV_01';
  const vehicleId = 'VEH_001';
  const tenantId = 'TENANT_A';
  const projectId = 'PROJ_A';
  const operatorId = 'USER_ADMIN';

  // 1. 初始化消息适配层与服务
  const sharedBus = InMemoryMessagingAdapter.getSharedBus();
  const simTransport = new InMemoryTransport(sharedBus);
  const messagingAdapter = new InMemoryMessagingAdapter(sharedBus);
  messagingAdapter.subscribeDevice(productKey, deviceNo);

  const deviceStatusService = new DeviceStatusService();
  const wsGateway = new WebSocketGatewayService();
  const commandService = new CommandService(messagingAdapter, deviceStatusService, wsGateway);

  // 注册设备元数据
  deviceStatusService.registerDevice({
    deviceNo,
    productKey,
    vehicleId,
    onlineStatus: 0 as any, // 初始为离线
  });

  await t.test('1. Device starts, goes online and sends heartbeat', async () => {
    const simulator = new DeviceSimulator(
      {
        productKey,
        deviceNo,
        heartbeatIntervalMs: 5000,
        defaultLatencyMs: 30,
      },
      simTransport
    );

    await simulator.start();
    await new Promise((r) => setTimeout(r, 60));

    assert.equal(deviceStatusService.isOnline(deviceNo), true);

    await simulator.stop();
  });

  await t.test('2. Full closed-loop: API -> Command -> Simulator -> ACK -> SUCCESS & WS Event', async () => {
    const simulator = new DeviceSimulator(
      {
        productKey,
        deviceNo,
        defaultLatencyMs: 30,
      },
      simTransport
    );
    await simulator.start();
    await new Promise((r) => setTimeout(r, 50));

    // 订阅车辆房间 WebSocket 消息
    const receivedEvents: Array<{ event: string; payload: any }> = [];
    const unsubscribeWs = wsGateway.joinVehicleRoom(vehicleId, (event, payload) => {
      receivedEvents.push({ event, payload });
    });

    // 客户端下发开锁指令
    const idempotencyKey = `idemp_unlock_${Date.now()}`;
    const command = await commandService.executeCommand({
      tenantId,
      projectId,
      vehicleId,
      deviceNo,
      productKey,
      commandCode: CommandCode.CMD_UNLOCK,
      idempotencyKey,
      operatorId,
      params: { doors: ['ALL'] },
    });

    assert.equal(command.status, CommandStatus.WAITING_ACK);
    assert.equal(command.commandCode, CommandCode.CMD_UNLOCK);

    // 等待模拟器处理下行指令并返回 ACK (30ms 延迟 + 微任务)
    await new Promise((r) => setTimeout(r, 120));

    const finalRecord = commandService.getCommand(command.id);
    assert.equal(finalRecord.status, CommandStatus.SUCCESS);
    assert.ok(finalRecord.sentAt);
    assert.ok(finalRecord.ackedAt);

    // 验证 WebSocket 事件推送
    const successEvent = receivedEvents.find((e) => e.event === WebSocketEvent.COMMAND_SUCCESS);
    assert.ok(successEvent);
    assert.equal(successEvent!.payload.id, command.id);

    unsubscribeWs();
    await simulator.stop();
  });

  await t.test('3. Idempotency protection: same idempotencyKey returns existing command', async () => {
    const simulator = new DeviceSimulator({ productKey, deviceNo }, simTransport);
    await simulator.start();
    await new Promise((r) => setTimeout(r, 50));

    const idempotencyKey = 'fixed_idempotency_key_test';
    const firstCall = await commandService.executeCommand({
      tenantId,
      projectId,
      vehicleId,
      deviceNo,
      productKey,
      commandCode: CommandCode.CMD_LOCK,
      idempotencyKey,
      operatorId,
    });

    const secondCall = await commandService.executeCommand({
      tenantId,
      projectId,
      vehicleId,
      deviceNo,
      productKey,
      commandCode: CommandCode.CMD_LOCK,
      idempotencyKey,
      operatorId,
    });

    assert.equal(firstCall.id, secondCall.id);

    await simulator.stop();
  });

  await t.test('4. Device rejection (DEVICE_REJECTED) handling', async () => {
    const simulator = new DeviceSimulator(
      {
        productKey,
        deviceNo,
        defaultLatencyMs: 20,
        rejectCommands: [CommandCode.CMD_ENGINE_START],
      },
      simTransport
    );
    await simulator.start();
    await new Promise((r) => setTimeout(r, 50));

    const command = await commandService.executeCommand({
      tenantId,
      projectId,
      vehicleId,
      deviceNo,
      productKey,
      commandCode: CommandCode.CMD_ENGINE_START,
      idempotencyKey: `idemp_reject_${Date.now()}`,
      operatorId,
    });

    await new Promise((r) => setTimeout(r, 100));

    const updated = commandService.getCommand(command.id);
    assert.equal(updated.status, CommandStatus.DEVICE_REJECTED);
    assert.equal(updated.errorCode, 'DEVICE_REJECTED');

    await simulator.stop();
  });

  await t.test('5. Command ACK Timeout handling', async () => {
    const simulator = new DeviceSimulator(
      {
        productKey,
        deviceNo,
        dropAck: true, // 模拟网络丢包
      },
      simTransport
    );
    await simulator.start();
    await new Promise((r) => setTimeout(r, 50));

    const command = await commandService.executeCommand({
      tenantId,
      projectId,
      vehicleId,
      deviceNo,
      productKey,
      commandCode: CommandCode.CMD_FIND_VEHICLE,
      idempotencyKey: `idemp_timeout_${Date.now()}`,
      operatorId,
      customTimeoutMs: 150, // 设定 150ms 快速超时测试
    });

    assert.equal(command.status, CommandStatus.WAITING_ACK);

    // 等待超过超时阈值
    await new Promise((r) => setTimeout(r, 220));

    const updated = commandService.getCommand(command.id);
    assert.equal(updated.status, CommandStatus.TIMEOUT);
    assert.equal(updated.errorCode, 'TIMEOUT');

    await simulator.stop();
  });

  await t.test('6. Terminal state protection: late ACK does NOT mutate TIMEOUT state', async () => {
    const simulator = new DeviceSimulator(
      {
        productKey,
        deviceNo,
        dropAck: true,
      },
      simTransport
    );
    await simulator.start();
    await new Promise((r) => setTimeout(r, 50));

    const cmd = await commandService.executeCommand({
      tenantId,
      projectId,
      vehicleId,
      deviceNo,
      productKey,
      commandCode: CommandCode.CMD_TRUNK_OPEN,
      idempotencyKey: `idemp_late_${Date.now()}`,
      operatorId,
      customTimeoutMs: 50,
    });

    // 触发超时
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(commandService.getCommand(cmd.id).status, CommandStatus.TIMEOUT);

    // 发送迟到 ACK
    commandService.handleAck({
      traceId: 'late_trace',
      requestId: 'late_req',
      commandId: cmd.id,
      commandCode: CommandCode.CMD_TRUNK_OPEN,
      timestamp: Date.now(),
      code: 0,
      message: 'SUCCESS',
    });

    // 状态依旧保持 TIMEOUT
    assert.equal(commandService.getCommand(cmd.id).status, CommandStatus.TIMEOUT);

    await simulator.stop();
  });
});
