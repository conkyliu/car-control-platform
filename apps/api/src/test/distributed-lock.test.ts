import test from 'node:test';
import assert from 'node:assert/strict';
import { ConflictException } from '@nestjs/common';
import { CommandCode, CommandStatus, WebSocketEvent } from '@car-control/contracts';
import { DeviceOnlineStatus } from '@car-control/domain-types';
import { InMemoryTransport, DeviceSimulator } from '@car-control/simulator';
import { InMemoryLockAdapter } from '../common/cache/in-memory-cache.adapter.js';
import { RedisLockAdapter, RedisClientLike } from '../common/cache/redis-cache.adapter.js';
import { InMemoryMessagingAdapter } from '../messaging/in-memory-messaging.adapter.js';
import { DeviceStatusService } from '../device/device-status.service.js';
import { WebSocketGatewayService } from '../realtime/websocket.gateway.js';
import { CommandService } from '../command/command.service.js';

test('Gate 6 Task 2: Distributed Lock, Cache & CommandService Mutex Guard Suite', async (t) => {
  await t.test('1. InMemoryLockAdapter: mutual exclusion and basic release', async () => {
    const lockAdapter = new InMemoryLockAdapter();
    const resource = 'test:vehicle:001';

    // 1.1 首次获取锁成功
    const lock1 = await lockAdapter.acquire(resource, 500);
    assert.ok(lock1);
    assert.strictEqual(lock1.resource, resource);
    assert.ok(lock1.token);
    assert.strictEqual(lock1.ttlMs, 500);

    // 1.2 并发重复获取应被排他阻断 (null)
    const lock2 = await lockAdapter.acquire(resource, 500);
    assert.strictEqual(lock2, null);

    // 1.3 释放锁后恢复可获取
    const released = await lockAdapter.release(lock1);
    assert.strictEqual(released, true);

    const lock3 = await lockAdapter.acquire(resource, 500);
    assert.ok(lock3);
    await lockAdapter.release(lock3);
  });

  await t.test('2. InMemoryLockAdapter: TTL auto-expiration', async () => {
    const lockAdapter = new InMemoryLockAdapter();
    const resource = 'test:vehicle:ttl';

    // 锁定 50ms
    const lock1 = await lockAdapter.acquire(resource, 50);
    assert.ok(lock1);

    // 此时无法获取
    const lock2 = await lockAdapter.acquire(resource, 50);
    assert.strictEqual(lock2, null);

    // 等待 70ms 直到 TTL 超时
    await new Promise((r) => setTimeout(r, 70));

    // 锁应自动过期释放，允许再次获取
    const lock3 = await lockAdapter.acquire(resource, 100);
    assert.ok(lock3);
    await lockAdapter.release(lock3);
  });

  await t.test('3. InMemoryLockAdapter: token safety verification', async () => {
    const lockAdapter = new InMemoryLockAdapter();
    const resource = 'test:vehicle:token_safety';

    const lock = await lockAdapter.acquire(resource, 500);
    assert.ok(lock);

    // 用伪造的 token 尝试释放
    const fakeHandle = {
      resource,
      token: 'fraudulent-token-12345',
      ttlMs: 500,
      acquiredAt: Date.now(),
    };
    const releasedFake = await lockAdapter.release(fakeHandle);
    assert.strictEqual(releasedFake, false);

    // 验证原锁依然有效，其他人仍然无法获取
    const competitorLock = await lockAdapter.acquire(resource, 500);
    assert.strictEqual(competitorLock, null);

    // 真实 handle 成功释放
    const releasedReal = await lockAdapter.release(lock);
    assert.strictEqual(releasedReal, true);
  });

  await t.test('4. InMemoryLockAdapter: withLock helper executes and releases safely', async () => {
    const lockAdapter = new InMemoryLockAdapter();
    const resource = 'test:vehicle:withlock';

    let executed = false;
    const result = await lockAdapter.withLock(resource, 500, async () => {
      executed = true;
      // 在 lock 保护期内，同一资源无法再次获取
      const nested = await lockAdapter.acquire(resource, 100);
      assert.strictEqual(nested, null);
      return 'OK_RESULT';
    });

    assert.strictEqual(executed, true);
    assert.strictEqual(result, 'OK_RESULT');

    // 退出 withLock 后锁已被安全释放
    const nextLock = await lockAdapter.acquire(resource, 100);
    assert.ok(nextLock);
    await lockAdapter.release(nextLock);
  });

  await t.test('5. InMemoryLockAdapter: CachePort get/set/del/exists lifecycle', async () => {
    const cache = new InMemoryLockAdapter();

    // 初始不存在
    assert.strictEqual(await cache.exists('my-key'), false);
    assert.strictEqual(await cache.get('my-key'), null);

    // 写入缓存 (TTL 1 秒)
    await cache.set('my-key', { status: 'OK', count: 42 }, 1);
    assert.strictEqual(await cache.exists('my-key'), true);
    const cached = await cache.get<{ status: string; count: number }>('my-key');
    assert.deepStrictEqual(cached, { status: 'OK', count: 42 });

    // 删除缓存
    await cache.del('my-key');
    assert.strictEqual(await cache.exists('my-key'), false);
    assert.strictEqual(await cache.get('my-key'), null);

    // TTL 自动失效
    await cache.set('temp-key', 'ephemeral', 0.05); // 50ms
    assert.strictEqual(await cache.get('temp-key'), 'ephemeral');
    await new Promise((r) => setTimeout(r, 70));
    assert.strictEqual(await cache.get('temp-key'), null);
    assert.strictEqual(await cache.exists('temp-key'), false);
  });

  await t.test('6. RedisLockAdapter: mock Redis client verification', async () => {
    const redisStore = new Map<string, string>();
    const mockRedis: RedisClientLike = {
      async get(key: string): Promise<string | null> {
        return redisStore.get(key) ?? null;
      },
      async set(key: string, value: string, ...args: any[]): Promise<string | null | 'OK'> {
        const isNx = args.includes('NX');
        if (isNx && redisStore.has(key)) {
          return null;
        }
        redisStore.set(key, value);
        return 'OK';
      },
      async del(key: string): Promise<number> {
        const existed = redisStore.has(key);
        redisStore.delete(key);
        return existed ? 1 : 0;
      },
      async exists(key: string): Promise<number> {
        return redisStore.has(key) ? 1 : 0;
      },
      async eval(script: string, numkeys: number, ...args: any[]): Promise<any> {
        const key = args[0] as string;
        const token = args[1] as string;
        if (redisStore.get(key) === token) {
          redisStore.delete(key);
          return 1;
        }
        return 0;
      },
    };

    const redisAdapter = new RedisLockAdapter(mockRedis);
    const resource = 'redis:test:veh:001';

    // 获取锁
    const lock1 = await redisAdapter.acquire(resource, 1000);
    assert.ok(lock1);
    assert.strictEqual(lock1.resource, resource);

    // 并发互斥阻断
    const lock2 = await redisAdapter.acquire(resource, 1000);
    assert.strictEqual(lock2, null);

    // 释放锁
    const released = await redisAdapter.release(lock1);
    assert.strictEqual(released, true);

    // 重新获取
    const lock3 = await redisAdapter.acquire(resource, 1000);
    assert.ok(lock3);
    await redisAdapter.release(lock3);

    // Cache 功能验证
    await redisAdapter.set('test:cache:redis', { data: 'hello' });
    const val = await redisAdapter.get<{ data: string }>('test:cache:redis');
    assert.deepStrictEqual(val, { data: 'hello' });
    assert.strictEqual(await redisAdapter.exists('test:cache:redis'), true);
    await redisAdapter.del('test:cache:redis');
    assert.strictEqual(await redisAdapter.exists('test:cache:redis'), false);
  });

  await t.test('7. CommandService integration: vehicle mutex guard & ACK release flow', async () => {
    const productKey = 'LOCK_PK_01';
    const deviceNo1 = 'LOCK_DEV_01';
    const vehicleId1 = 'VEH_LOCK_01';

    const deviceNo2 = 'LOCK_DEV_02';
    const vehicleId2 = 'VEH_LOCK_02';

    const tenantId = 'TENANT_LOCK';
    const operatorId = 'USER_TEST';

    const lockPort = new InMemoryLockAdapter();
    const sharedBus = InMemoryMessagingAdapter.getSharedBus();
    const simTransport = new InMemoryTransport(sharedBus);
    const messagingAdapter = new InMemoryMessagingAdapter(sharedBus);
    messagingAdapter.subscribeDevice(productKey, deviceNo1);
    messagingAdapter.subscribeDevice(productKey, deviceNo2);

    const deviceStatusService = new DeviceStatusService();
    const wsGateway = new WebSocketGatewayService();

    deviceStatusService.registerDevice({
      deviceNo: deviceNo1,
      productKey,
      vehicleId: vehicleId1,
      onlineStatus: DeviceOnlineStatus.ONLINE,
    });
    deviceStatusService.registerDevice({
      deviceNo: deviceNo2,
      productKey,
      vehicleId: vehicleId2,
      onlineStatus: DeviceOnlineStatus.ONLINE,
    });

    const commandService = new CommandService(
      messagingAdapter,
      deviceStatusService,
      wsGateway,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      lockPort
    );

    // 7.1 首条指令正常下发，获取锁并进入 WAITING_ACK
    const cmd1 = await commandService.executeCommand({
      tenantId,
      vehicleId: vehicleId1,
      deviceNo: deviceNo1,
      productKey,
      commandCode: CommandCode.CMD_LOCK,
      idempotencyKey: 'idemp_lock_1',
      operatorId,
      customTimeoutMs: 5000,
    });
    assert.strictEqual(cmd1.status, CommandStatus.WAITING_ACK);

    // 7.2 同一车辆的并发指令应触发 409 ConflictException ('VEHICLE_COMMAND_IN_PROGRESS')
    await assert.rejects(
      async () => {
        await commandService.executeCommand({
          tenantId,
          vehicleId: vehicleId1,
          deviceNo: deviceNo1,
          productKey,
          commandCode: CommandCode.CMD_UNLOCK,
          idempotencyKey: 'idemp_lock_2',
          operatorId,
          customTimeoutMs: 5000,
        });
      },
      (err: any) => {
        assert.ok(err instanceof ConflictException);
        assert.strictEqual(err.message, 'VEHICLE_COMMAND_IN_PROGRESS');
        return true;
      }
    );

    // 7.3 不同车辆 (vehicleId2) 下发指令不应受互斥锁影响
    const cmd2 = await commandService.executeCommand({
      tenantId,
      vehicleId: vehicleId2,
      deviceNo: deviceNo2,
      productKey,
      commandCode: CommandCode.CMD_LOCK,
      idempotencyKey: 'idemp_lock_veh2',
      operatorId,
      customTimeoutMs: 5000,
    });
    assert.strictEqual(cmd2.status, CommandStatus.WAITING_ACK);

    // 7.4 设备 1 上报 ACK，释放锁
    await commandService.handleAck({
      traceId: cmd1.traceId,
      requestId: cmd1.requestId,
      commandId: cmd1.id,
      commandCode: CommandCode.CMD_LOCK,
      code: 0,
      message: 'Locked successfully',
      timestamp: Date.now(),
    });

    assert.strictEqual(commandService.getCommand(cmd1.id).status, CommandStatus.SUCCESS);

    // 7.5 锁释放后，车辆 1 可再次下发新指令
    const cmd3 = await commandService.executeCommand({
      tenantId,
      vehicleId: vehicleId1,
      deviceNo: deviceNo1,
      productKey,
      commandCode: CommandCode.CMD_UNLOCK,
      idempotencyKey: 'idemp_lock_3',
      operatorId,
      customTimeoutMs: 5000,
    });
    assert.strictEqual(cmd3.status, CommandStatus.WAITING_ACK);

    // 清理 cmd3
    await commandService.handleAck({
      traceId: cmd3.traceId,
      requestId: cmd3.requestId,
      commandId: cmd3.id,
      commandCode: CommandCode.CMD_UNLOCK,
      code: 0,
      message: 'Unlocked',
      timestamp: Date.now(),
    });
    await commandService.handleAck({
      traceId: cmd2.traceId,
      requestId: cmd2.requestId,
      commandId: cmd2.id,
      commandCode: CommandCode.CMD_LOCK,
      code: 0,
      message: 'Locked',
      timestamp: Date.now(),
    });
  });

  await t.test('8. CommandService: synchronous failure immediately releases lock', async () => {
    const productKey = 'LOCK_PK_02';
    const offlineDeviceNo = 'DEV_OFFLINE_01';
    const vehicleId = 'VEH_OFFLINE_01';
    const tenantId = 'TENANT_LOCK';
    const operatorId = 'USER_TEST';

    const lockPort = new InMemoryLockAdapter();
    const sharedBus = InMemoryMessagingAdapter.getSharedBus();
    const messagingAdapter = new InMemoryMessagingAdapter(sharedBus);
    const deviceStatusService = new DeviceStatusService();
    const wsGateway = new WebSocketGatewayService();

    // 注册但处于离线状态
    deviceStatusService.registerDevice({
      deviceNo: offlineDeviceNo,
      productKey,
      vehicleId,
      onlineStatus: DeviceOnlineStatus.OFFLINE,
    });

    const commandService = new CommandService(
      messagingAdapter,
      deviceStatusService,
      wsGateway,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      lockPort
    );

    // 下发给离线设备，返回 FAILED
    const failedCmd = await commandService.executeCommand({
      tenantId,
      vehicleId,
      deviceNo: offlineDeviceNo,
      productKey,
      commandCode: CommandCode.CMD_LOCK,
      idempotencyKey: 'idemp_offline_1',
      operatorId,
    });
    assert.strictEqual(failedCmd.status, CommandStatus.FAILED);

    // 锁应已被立即释放，下一次请求不应抛出 VEHICLE_COMMAND_IN_PROGRESS 冲突
    // 将设备设置为上线后再次下发，应成功获取锁
    deviceStatusService.setOnlineStatus(offlineDeviceNo, true);
    const successCmd = await commandService.executeCommand({
      tenantId,
      vehicleId,
      deviceNo: offlineDeviceNo,
      productKey,
      commandCode: CommandCode.CMD_LOCK,
      idempotencyKey: 'idemp_offline_2',
      operatorId,
    });
    assert.strictEqual(successCmd.status, CommandStatus.WAITING_ACK);

    await commandService.handleAck({
      traceId: successCmd.traceId,
      requestId: successCmd.requestId,
      commandId: successCmd.id,
      commandCode: CommandCode.CMD_LOCK,
      code: 0,
      message: 'Success',
      timestamp: Date.now(),
    });
  });

  await t.test('9. CommandService: timeout automatically releases lock', async () => {
    const productKey = 'LOCK_PK_03';
    const deviceNo = 'DEV_TIMEOUT_01';
    const vehicleId = 'VEH_TIMEOUT_01';
    const tenantId = 'TENANT_LOCK';
    const operatorId = 'USER_TEST';

    const lockPort = new InMemoryLockAdapter();
    const sharedBus = InMemoryMessagingAdapter.getSharedBus();
    const messagingAdapter = new InMemoryMessagingAdapter(sharedBus);
    const deviceStatusService = new DeviceStatusService();
    const wsGateway = new WebSocketGatewayService();

    deviceStatusService.registerDevice({
      deviceNo,
      productKey,
      vehicleId,
      onlineStatus: DeviceOnlineStatus.ONLINE,
    });

    const commandService = new CommandService(
      messagingAdapter,
      deviceStatusService,
      wsGateway,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      lockPort
    );

    // 下发指令，设置超时为 60ms
    const timedOutCmd = await commandService.executeCommand({
      tenantId,
      vehicleId,
      deviceNo,
      productKey,
      commandCode: CommandCode.CMD_LOCK,
      idempotencyKey: 'idemp_timeout_1',
      operatorId,
      customTimeoutMs: 60,
    });
    assert.strictEqual(timedOutCmd.status, CommandStatus.WAITING_ACK);

    // 等待 80ms 超时触发
    await new Promise((r) => setTimeout(r, 80));
    assert.strictEqual(commandService.getCommand(timedOutCmd.id).status, CommandStatus.TIMEOUT);

    // 超时后锁已被自动释放，新指令可以成功下发
    const retryCmd = await commandService.executeCommand({
      tenantId,
      vehicleId,
      deviceNo,
      productKey,
      commandCode: CommandCode.CMD_LOCK,
      idempotencyKey: 'idemp_timeout_2',
      operatorId,
      customTimeoutMs: 5000,
    });
    assert.strictEqual(retryCmd.status, CommandStatus.WAITING_ACK);

    await commandService.handleAck({
      traceId: retryCmd.traceId,
      requestId: retryCmd.requestId,
      commandId: retryCmd.id,
      commandCode: CommandCode.CMD_LOCK,
      code: 0,
      message: 'Success',
      timestamp: Date.now(),
    });
  });
});
