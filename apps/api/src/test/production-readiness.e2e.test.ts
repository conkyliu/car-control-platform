import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { ConflictException } from '@nestjs/common';
import {
  CommandCode,
  CommandStatus,
  WebSocketEvent,
  DeviceCommandAckUplinkPayload,
} from '@car-control/contracts';
import { DeviceOnlineStatus } from '@car-control/domain-types';
import { InMemoryTransport, DeviceSimulator } from '@car-control/simulator';
import { InMemoryLockAdapter } from '../common/cache/in-memory-cache.adapter.js';
import { InMemoryMessagingAdapter } from '../messaging/in-memory-messaging.adapter.js';
import { DeviceStatusService } from '../device/device-status.service.js';
import { WebSocketGatewayService } from '../realtime/websocket.gateway.js';
import { CommandService } from '../command/command.service.js';
import { MetricsService } from '../observability/metrics/metrics.service.js';
import { MetricsController } from '../observability/metrics/metrics.controller.js';
import { TracerService } from '../observability/tracing/tracer.service.js';
import {
  STANDARD_SPAN_NAMES,
  generateW3CTraceId,
} from '../observability/tracing/tracer.types.js';
import {
  LoadTestRunner,
  calculatePercentile,
  verifySla,
  generateMarkdownReport,
  runConcurrencyPool,
} from './benchmark/load-test-runner.js';
import { BenchmarkResult } from './benchmark/benchmark.types.js';

test('Gate 6: Production Readiness & Observability Full Acceptance Suite', async (t) => {
  // Store results for the final multi-tier benchmark table
  let tier1BenchmarkResult: BenchmarkResult | undefined;
  let tier2BenchmarkResult: BenchmarkResult | undefined;
  let tier3BenchmarkResult: BenchmarkResult | undefined;

  // =========================================================================
  // AC-1: 分布式缓存与并发防重排他锁 (Distributed Cache & Mutex Lock)
  // =========================================================================
  await t.test('AC-1: 分布式缓存与并发防重排他锁 (Single-vehicle concurrent lock 409 & terminal release)', async () => {
    const bus = new EventEmitter();
    bus.setMaxListeners(100);
    const messagingAdapter = new InMemoryMessagingAdapter(bus);
    const deviceStatusService = new DeviceStatusService();
    const wsGateway = new WebSocketGatewayService();
    const lockAdapter = new InMemoryLockAdapter();
    const metricsService = new MetricsService();
    const tracerService = new TracerService();

    const commandService = new CommandService(
      messagingAdapter,
      deviceStatusService,
      wsGateway,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      lockAdapter,
      tracerService,
      metricsService
    );

    const tenantId = 'TENANT_LOCK_TEST';
    const vehicleId = 'VEH_LOCK_01';
    const deviceNo = 'DEV_LOCK_01';
    const productKey = 'PK_LOCK';

    deviceStatusService.registerDevice({
      deviceNo,
      productKey,
      vehicleId,
      onlineStatus: DeviceOnlineStatus.ONLINE,
    });
    messagingAdapter.subscribeDevice(productKey, deviceNo);

    // 1.1 首个指令下发，获取锁并处于 WAITING_ACK
    const cmd1 = await commandService.executeCommand({
      tenantId,
      vehicleId,
      deviceNo,
      productKey,
      commandCode: CommandCode.CMD_LOCK,
      idempotencyKey: 'idemp_lock_01',
      operatorId: 'OPERATOR_1',
      customTimeoutMs: 10000,
    });
    assert.strictEqual(cmd1.status, CommandStatus.WAITING_ACK);

    // 验证锁已被持有：同一资源的锁无法被二次获取
    const lockKey = `lock:cmd:${tenantId}:${vehicleId}`;
    const directProbe = await lockAdapter.acquire(lockKey, 1000);
    assert.strictEqual(directProbe, null, 'Lock key must be held while command is WAITING_ACK');

    // 1.2 同一车辆并发指令下发，必须被排他阻断抛出 409 VEHICLE_COMMAND_IN_PROGRESS
    let errorCaught: any = null;
    try {
      await commandService.executeCommand({
        tenantId,
        vehicleId,
        deviceNo,
        productKey,
        commandCode: CommandCode.CMD_UNLOCK,
        idempotencyKey: 'idemp_lock_02',
        operatorId: 'OPERATOR_2',
        customTimeoutMs: 10000,
      });
    } catch (err) {
      errorCaught = err;
    }

    assert.ok(errorCaught instanceof ConflictException, 'Must throw ConflictException on concurrent command');
    assert.strictEqual(errorCaught.message, 'VEHICLE_COMMAND_IN_PROGRESS');

    // 验证指标库记录了锁争抢
    const metricsText = metricsService.exportPrometheusMetrics();
    assert.ok(
      metricsText.includes(`car_lock_contention_total{tenant_id="${tenantId}"} 1`),
      'Lock contention metric must be incremented'
    );

    // 1.3 终态 ACK 应答释放锁
    const ackPayload: DeviceCommandAckUplinkPayload = {
      traceId: cmd1.traceId,
      requestId: cmd1.requestId,
      commandId: cmd1.id,
      commandCode: cmd1.commandCode,
      code: 0,
      message: 'Lock executed successfully',
      timestamp: Date.now(),
    };
    await commandService.handleAck(ackPayload);
    assert.strictEqual(commandService.getCommand(cmd1.id).status, CommandStatus.SUCCESS);

    // 锁已释放，后续指令下发成功
    const cmd3 = await commandService.executeCommand({
      tenantId,
      vehicleId,
      deviceNo,
      productKey,
      commandCode: CommandCode.CMD_TRUNK_OPEN,
      idempotencyKey: 'idemp_lock_03',
      operatorId: 'OPERATOR_3',
      customTimeoutMs: 10000,
    });
    assert.strictEqual(cmd3.status, CommandStatus.WAITING_ACK);
    // 清理 cmd3
    await commandService.handleAck({
      traceId: cmd3.traceId,
      requestId: cmd3.requestId,
      commandId: cmd3.id,
      commandCode: cmd3.commandCode,
      code: 0,
      message: 'Trunk opened',
      timestamp: Date.now(),
    });

    // 1.4 超时未应答也必须释放锁
    const cmd4 = await commandService.executeCommand({
      tenantId,
      vehicleId,
      deviceNo,
      productKey,
      commandCode: CommandCode.CMD_LOCK,
      idempotencyKey: 'idemp_lock_04',
      operatorId: 'OPERATOR_4',
      customTimeoutMs: 50, // 50ms 超时
    });
    assert.strictEqual(cmd4.status, CommandStatus.WAITING_ACK);

    // 等待 70ms 触发超时
    await new Promise((r) => setTimeout(r, 70));
    assert.strictEqual(commandService.getCommand(cmd4.id).status, CommandStatus.TIMEOUT);

    // 超时后锁已被自动释放，新指令可立即获取
    const cmd5 = await commandService.executeCommand({
      tenantId,
      vehicleId,
      deviceNo,
      productKey,
      commandCode: CommandCode.CMD_UNLOCK,
      idempotencyKey: 'idemp_lock_05',
      operatorId: 'OPERATOR_5',
      customTimeoutMs: 10000,
    });
    assert.strictEqual(cmd5.status, CommandStatus.WAITING_ACK);
    await commandService.handleAck({
      traceId: cmd5.traceId,
      requestId: cmd5.requestId,
      commandId: cmd5.id,
      commandCode: cmd5.commandCode,
      code: 0,
      message: 'OK',
      timestamp: Date.now(),
    });

    // 1.5 CachePort 基本读写验证
    await lockAdapter.set('cache:test:alpha', { score: 99 }, 10);
    const cached = await lockAdapter.get<{ score: number }>('cache:test:alpha');
    assert.deepStrictEqual(cached, { score: 99 });
    assert.strictEqual(await lockAdapter.exists('cache:test:alpha'), true);
    await lockAdapter.del('cache:test:alpha');
    assert.strictEqual(await lockAdapter.get('cache:test:alpha'), null);
    assert.strictEqual(await lockAdapter.exists('cache:test:alpha'), false);
  });

  // =========================================================================
  // AC-2: Prometheus 标准指标端点导出 (Prometheus Metrics Exposition)
  // =========================================================================
  await t.test('AC-2: Prometheus 标准指标端点导出 (GET /metrics exports all 7 metrics with SLA buckets and types)', async () => {
    const metricsService = new MetricsService();
    const controller = new MetricsController(metricsService);

    const tenantId = 'TENANT_PROMETHEUS';

    // 灌入所有 7 项指标的数据
    // 1. car_commands_total
    metricsService.incrementCommands(tenantId, 'CMD_LOCK', 'SUCCESS');
    metricsService.incrementCommands(tenantId, 'CMD_UNLOCK', 'FAILED');

    // 2. car_command_duration_seconds (覆盖直方图 SLA buckets)
    metricsService.observeCommandDuration(tenantId, 'CMD_LOCK', 0.08); // falls into 0.1
    metricsService.observeCommandDuration(tenantId, 'CMD_LOCK', 0.45); // falls into 0.5
    metricsService.observeCommandDuration(tenantId, 'CMD_LOCK', 1.85); // falls into 2.0

    // 3. car_telemetry_uplinks_total
    metricsService.incrementTelemetryUplinks(tenantId, 'PK_SEDAN_01');
    metricsService.incrementTelemetryUplinks(tenantId, 'PK_SEDAN_01');

    // 4. car_alarms_total
    metricsService.incrementAlarms(tenantId, 'GEOFENCE_OUT', 'CRITICAL');

    // 5. car_active_simulators
    metricsService.setActiveSimulators(100, 'online');
    metricsService.setActiveSimulators(2, 'offline');

    // 6. car_websocket_connections
    metricsService.setWebsocketConnections(tenantId, 18);

    // 7. car_lock_contention_total
    metricsService.incrementLockContention(tenantId);

    // 调用控制器获取导出格式
    const text = controller.getMetrics();
    assert.ok(typeof text === 'string');

    // 断言 7 个指标的 # HELP 与 # TYPE 声明完整准确
    const expectedMetrics = [
      { name: 'car_commands_total', type: 'counter' },
      { name: 'car_command_duration_seconds', type: 'histogram' },
      { name: 'car_telemetry_uplinks_total', type: 'counter' },
      { name: 'car_alarms_total', type: 'counter' },
      { name: 'car_active_simulators', type: 'gauge' },
      { name: 'car_websocket_connections', type: 'gauge' },
      { name: 'car_lock_contention_total', type: 'counter' },
    ];

    for (const metric of expectedMetrics) {
      assert.ok(
        text.includes(`# HELP ${metric.name} `),
        `Metrics output must contain # HELP for ${metric.name}`
      );
      assert.ok(
        text.includes(`# TYPE ${metric.name} ${metric.type}`),
        `Metrics output must contain # TYPE ${metric.type} for ${metric.name}`
      );
    }

    // 校验直方图包含 ADR-016 定义的全部 10 个 SLA buckets 以及 +Inf, _sum, _count
    const slaBuckets = ['0.05', '0.1', '0.25', '0.5', '1', '1.5', '2', '3', '5', '10', '+Inf'];
    for (const le of slaBuckets) {
      assert.ok(
        text.includes(`car_command_duration_seconds_bucket{tenant_id="${tenantId}",command_code="CMD_LOCK",le="${le}"}`),
        `Must contain bucket le="${le}" for car_command_duration_seconds`
      );
    }
    assert.ok(text.includes(`car_command_duration_seconds_sum{tenant_id="${tenantId}",command_code="CMD_LOCK"}`));
    assert.ok(text.includes(`car_command_duration_seconds_count{tenant_id="${tenantId}",command_code="CMD_LOCK"} 3`));

    // 校验 Gauge 与 Counter 标签及具体数值
    assert.ok(text.includes(`car_commands_total{tenant_id="${tenantId}",command_code="CMD_LOCK",status="SUCCESS"} 1`));
    assert.ok(text.includes(`car_commands_total{tenant_id="${tenantId}",command_code="CMD_UNLOCK",status="FAILED"} 1`));
    assert.ok(text.includes(`car_telemetry_uplinks_total{tenant_id="${tenantId}",product_key="PK_SEDAN_01"} 2`));
    assert.ok(text.includes(`car_alarms_total{tenant_id="${tenantId}",alarm_type="GEOFENCE_OUT",level="CRITICAL"} 1`));
    assert.ok(text.includes('car_active_simulators{online_status="online"} 100'));
    assert.ok(text.includes('car_active_simulators{online_status="offline"} 2'));
    assert.ok(text.includes(`car_websocket_connections{tenant_id="${tenantId}"} 18`));
    assert.ok(text.includes(`car_lock_contention_total{tenant_id="${tenantId}"} 1`));
  });

  // =========================================================================
  // AC-3: OpenTelemetry 5 阶段分布式 Span 链路追踪 (5-Span Distributed Tracing)
  // =========================================================================
  await t.test('AC-3: OpenTelemetry 5 阶段分布式 Span 链路追踪 (5 spans captured, contiguous, sum equals totalDurationMs)', async () => {
    const bus = new EventEmitter();
    bus.setMaxListeners(100);
    const messagingAdapter = new InMemoryMessagingAdapter(bus);
    const deviceStatusService = new DeviceStatusService();
    const wsGateway = new WebSocketGatewayService();
    const lockAdapter = new InMemoryLockAdapter();
    const metricsService = new MetricsService();
    const tracerService = new TracerService();

    const commandService = new CommandService(
      messagingAdapter,
      deviceStatusService,
      wsGateway,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      lockAdapter,
      tracerService,
      metricsService
    );

    const tenantId = 'TENANT_TRACE_TEST';
    const vehicleId = 'VEH_TRACE_E2E';
    const deviceNo = 'DEV_TRACE_E2E';
    const productKey = 'PK_TRACE';

    deviceStatusService.registerDevice({
      deviceNo,
      productKey,
      vehicleId,
      onlineStatus: DeviceOnlineStatus.ONLINE,
    });
    messagingAdapter.subscribeDevice(productKey, deviceNo);

    // 启动模拟器（自动应答指令）
    const simTransport = new InMemoryTransport(bus);
    const simulator = new DeviceSimulator(
      {
        productKey,
        deviceNo,
        defaultLatencyMs: 15,
      },
      simTransport
    );
    await simulator.start();

    try {
      const explicitW3CTraceId = generateW3CTraceId();

      const completionPromise = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Trace test timeout')), 5000);
        wsGateway.joinVehicleRoom(vehicleId, (event) => {
          if (event === WebSocketEvent.COMMAND_SUCCESS) {
            clearTimeout(timer);
            resolve();
          }
        });
      });

      const cmd = await commandService.executeCommand({
        tenantId,
        vehicleId,
        deviceNo,
        productKey,
        commandCode: CommandCode.CMD_LOCK,
        idempotencyKey: 'idemp_trace_01',
        operatorId: 'OPERATOR_TRACE',
        traceId: explicitW3CTraceId,
      });

      await completionPromise;

      // 提取全链路追踪数据
      const trace = tracerService.getTraceByCommandId(cmd.id);
      assert.ok(trace, 'Trace must be captured');
      assert.strictEqual(trace.traceId, explicitW3CTraceId);
      assert.strictEqual(trace.status, 'SUCCESS');
      assert.strictEqual(trace.spans.length, 5, 'Must contain exactly 5 standard spans');

      // 验证 5 阶段 Span 的有序性与标准命名
      const expectedSpanNames = [
        STANDARD_SPAN_NAMES.HTTP_INBOUND_REQUEST,
        STANDARD_SPAN_NAMES.COMMAND_SECURITY_AND_DISPATCH,
        STANDARD_SPAN_NAMES.DEVICE_EXECUTION_ACK,
        STANDARD_SPAN_NAMES.ACK_PROCESSING_AND_PERSISTENCE,
        STANDARD_SPAN_NAMES.WEBSOCKET_CLIENT_NOTIFICATION,
      ];

      for (let i = 0; i < expectedSpanNames.length; i++) {
        assert.strictEqual(
          trace.spans[i].name,
          expectedSpanNames[i],
          `Span at index ${i} must be ${expectedSpanNames[i]}`
        );
        assert.ok(
          trace.spans[i].durationMs >= 1,
          `Span ${trace.spans[i].name} duration (${trace.spans[i].durationMs}ms) must be >= 1ms`
        );
      }

      // 验证 Span 耗时和等于总耗时 (Contiguous / additive validation)
      const calculatedSum = trace.spans.reduce((acc, s) => acc + s.durationMs, 0);
      assert.strictEqual(
        trace.totalDurationMs,
        calculatedSum,
        `totalDurationMs (${trace.totalDurationMs}ms) must equal sum of spans (${calculatedSum}ms)`
      );

      // 验证 Prometheus 指标已关联记录该 Trace 耗时
      const metricsText = metricsService.exportPrometheusMetrics();
      assert.ok(
        metricsText.includes(`car_commands_total{tenant_id="${tenantId}",command_code="CMD_LOCK",status="SUCCESS"} 1`),
        'Trace completion must increment command success counter'
      );
      assert.ok(
        metricsText.includes(`car_command_duration_seconds_count{tenant_id="${tenantId}",command_code="CMD_LOCK"} 1`),
        'Trace completion must observe duration histogram'
      );
    } finally {
      await simulator.stop();
      await simTransport.disconnect();
    }
  });

  // =========================================================================
  // AC-4: 100 设备并发基准测试 (Tier 1: 100 Device Concurrency)
  // =========================================================================
  await t.test('AC-4: 100 设备并发基准测试 (100 devices concurrent heartbeats and commands, 100% success, 0 error)', async () => {
    const bus = new EventEmitter();
    bus.setMaxListeners(5000);
    const messagingAdapter = new InMemoryMessagingAdapter(bus);
    const deviceStatusService = new DeviceStatusService();
    const wsGateway = new WebSocketGatewayService();
    const lockAdapter = new InMemoryLockAdapter();
    const metricsService = new MetricsService();
    const tracerService = new TracerService();

    const commandService = new CommandService(
      messagingAdapter,
      deviceStatusService,
      wsGateway,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      lockAdapter,
      tracerService,
      metricsService
    );

    const deviceCount = 100;
    const productKey = 'PK_TIER_100';
    const tenantId = 'TENANT_TIER_100';
    const simulators: DeviceSimulator[] = [];
    const simTransport = new InMemoryTransport(bus);

    for (let i = 0; i < deviceCount; i++) {
      const deviceNo = `DEV_100_${i}`;
      const vehicleId = `VEH_100_${i}`;
      deviceStatusService.registerDevice({
        deviceNo,
        productKey,
        vehicleId,
        onlineStatus: DeviceOnlineStatus.ONLINE,
      });
      messagingAdapter.subscribeDevice(productKey, deviceNo);

      const sim = new DeviceSimulator(
        {
          productKey,
          deviceNo,
          defaultLatencyMs: 5,
        },
        simTransport
      );
      simulators.push(sim);
    }

    await Promise.all(simulators.map((s) => s.start()));

    try {
      // 4.1 100 设备并发心跳压测
      await Promise.all(simulators.map((s) => s.sendHeartbeat()));
      for (let i = 0; i < deviceCount; i++) {
        assert.strictEqual(
          deviceStatusService.isOnline(`DEV_100_${i}`),
          true,
          `Device DEV_100_${i} must be online after heartbeat`
        );
      }

      // 4.2 100 设备并发指令下发与闭环应答
      const startAll = performance.now();
      const tasks = Array.from({ length: deviceCount }, (_, i) => async () => {
        const vehicleId = `VEH_100_${i}`;
        const deviceNo = `DEV_100_${i}`;
        const start = performance.now();

        const completionPromise = new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error(`Timeout waiting for ${vehicleId}`)),
            5000
          );
          const unsub = wsGateway.joinVehicleRoom(vehicleId, (event) => {
            if (event === WebSocketEvent.COMMAND_SUCCESS) {
              clearTimeout(timer);
              unsub();
              resolve();
            } else if (
              event === WebSocketEvent.COMMAND_FAILED ||
              event === WebSocketEvent.COMMAND_REJECTED
            ) {
              clearTimeout(timer);
              unsub();
              reject(new Error(`Command ended with ${event}`));
            }
          });
        });

        await commandService.executeCommand({
          tenantId,
          vehicleId,
          deviceNo,
          productKey,
          commandCode: CommandCode.CMD_LOCK,
          idempotencyKey: `idemp_100_${i}`,
          operatorId: 'BENCH_100',
        });

        await completionPromise;
        const latency = performance.now() - start;
        return { ok: true, latency };
      });

      // 并发度 25 执行 100 个请求
      const results = await runConcurrencyPool(tasks, 25);
      const endAll = performance.now();
      const durationMs = endAll - startAll;

      const successCount = results.filter((r) => r.ok).length;
      assert.strictEqual(successCount, 100, 'All 100 commands must succeed with 0 packet loss');
      assert.strictEqual(results.length, 100);

      const latencies = results.map((r) => r.latency).sort((a, b) => a - b);
      const p50 = calculatePercentile(latencies, 50);
      const p90 = calculatePercentile(latencies, 90);
      const p95 = calculatePercentile(latencies, 95);
      const p99 = calculatePercentile(latencies, 99);

      tier1BenchmarkResult = {
        tierName: 'Tier 1 (100)',
        totalRequests: 100,
        successRequests: 100,
        failedRequests: 0,
        successRate: 100.0,
        durationMs,
        tps: (100 / durationMs) * 1000,
        p50Ms: p50,
        p90Ms: p90,
        p95Ms: p95,
        p99Ms: p99,
        latencies,
      };

      const slaCheck = verifySla(tier1BenchmarkResult);
      assert.strictEqual(slaCheck.passed, true, `Tier 1 SLA must pass: ${slaCheck.violations.join(', ')}`);
    } finally {
      await Promise.all(simulators.map((s) => s.stop()));
      await simTransport.disconnect();
    }
  });

  // =========================================================================
  // AC-5: 500 设备并发平滑扩展测试 (Tier 2: 500 Device Concurrency)
  // =========================================================================
  await t.test('AC-5: 500 设备并发平滑扩展测试 (500 devices concurrent commands via LoadTestRunner, success >= 99.9%, zero race conditions)', async () => {
    const runner = new LoadTestRunner();

    // 运行 500 规模并发测试：并发度 40，模拟设备延迟 3ms
    const result = await runner.runTier(500, {
      tierName: 'Tier 2 (500)',
      concurrency: 40,
      simulatedLatencyMs: 3,
      tenantId: 'TENANT_TIER_500',
    });

    tier2BenchmarkResult = result;

    assert.strictEqual(result.totalRequests, 500);
    assert.ok(result.successRate >= 99.9, `Success rate (${result.successRate}%) must be >= 99.9%`);
    assert.strictEqual(result.failedRequests, 0, 'Zero failed requests allowed in standard simulated test');
    assert.strictEqual(result.latencies.length, 500);

    // 验证状态机无竞态冲突与 SLA 门禁达标
    const slaCheck = verifySla(result);
    assert.strictEqual(
      slaCheck.passed,
      true,
      `Tier 2 SLA check must pass: ${slaCheck.violations.join(', ')}`
    );
  });

  // =========================================================================
  // AC-6: 1000 级设备高并发压测与 SLA 硬门禁 (Tier 3: 1000 Device Concurrency & SLA Gates)
  // =========================================================================
  await t.test('AC-6: 1000 级设备高并发压测与 SLA 硬门禁 (1000 requests, assert SLA: Success >= 99.9%, P50 <= 1.0s, P95 <= 2.0s, P99 <= 5.0s, print Markdown benchmark table)', async () => {
    const runner = new LoadTestRunner();

    // 运行 1000 规模高并发压测：并发度 50，模拟设备延迟 2ms
    const result = await runner.runTier(1000, {
      tierName: 'Tier 3 (1000)',
      concurrency: 50,
      simulatedLatencyMs: 2,
      tenantId: 'TENANT_TIER_1000',
    });

    tier3BenchmarkResult = result;

    assert.strictEqual(result.totalRequests, 1000);
    assert.strictEqual(result.failedRequests, 0);

    // 硬门禁断言: ADR-016
    // 1. Success Rate >= 99.9%
    assert.ok(
      result.successRate >= 99.9,
      `Success rate ${result.successRate}% must be >= 99.9%`
    );
    // 2. P50 <= 1000ms (1.0s)
    assert.ok(
      result.p50Ms <= 1000,
      `P50 latency ${result.p50Ms.toFixed(2)}ms must be <= 1000ms`
    );
    // 3. P95 <= 2000ms (2.0s)
    assert.ok(
      result.p95Ms <= 2000,
      `P95 latency ${result.p95Ms.toFixed(2)}ms must be <= 2000ms`
    );
    // 4. P99 <= 5000ms (5.0s)
    assert.ok(
      result.p99Ms <= 5000,
      `P99 latency ${result.p99Ms.toFixed(2)}ms must be <= 5000ms`
    );

    const slaCheck = verifySla(result);
    assert.strictEqual(slaCheck.passed, true);
    assert.strictEqual(slaCheck.violations.length, 0);

    // 生成全量 100 / 500 / 1000 阶梯基准报告并输出
    const fullBenchmarkSummary: Record<string, BenchmarkResult> = {
      ...(tier1BenchmarkResult ? { [tier1BenchmarkResult.tierName]: tier1BenchmarkResult } : {}),
      ...(tier2BenchmarkResult ? { [tier2BenchmarkResult.tierName]: tier2BenchmarkResult } : {}),
      [result.tierName]: result,
    };

    const markdownReport = generateMarkdownReport(fullBenchmarkSummary);
    assert.ok(markdownReport.includes('# Load Test Benchmark Report'));
    assert.ok(markdownReport.includes('| Scale / Tier | Requests | Success Rate |'));
    assert.ok(markdownReport.includes('Tier 3 (1000)'));
    assert.ok(markdownReport.includes('| PASS |'));

    console.log('\n======================================================================');
    console.log('   GATE 6 PRODUCTION READINESS CONCURRENCY BENCHMARK REPORT');
    console.log('======================================================================\n');
    console.log(markdownReport);
    console.log('\n======================================================================\n');
  });

  // =========================================================================
  // AC-7: 高压场景下的多租户强隔离防线 (Multi-Tenant Isolation Under High Load)
  // =========================================================================
  await t.test('AC-7: 高压场景下的多租户强隔离防线 (Tenant B cannot read or mutate Tenant A lock or commands, isolation holds under load)', async () => {
    const bus = new EventEmitter();
    bus.setMaxListeners(2000);
    const messagingAdapter = new InMemoryMessagingAdapter(bus);
    const deviceStatusService = new DeviceStatusService();
    const wsGateway = new WebSocketGatewayService();
    const lockAdapter = new InMemoryLockAdapter();
    const metricsService = new MetricsService();
    const tracerService = new TracerService();

    const commandService = new CommandService(
      messagingAdapter,
      deviceStatusService,
      wsGateway,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      lockAdapter,
      tracerService,
      metricsService
    );

    const tenantA = 'TENANT_ALPHA';
    const tenantB = 'TENANT_BETA';
    const sharedVehicleId = 'VEH_SHARED_ID';

    // 7.1 分布式锁键的租户作用域隔离验证
    // Tenant A 锁定车辆
    const lockA = await lockAdapter.acquire(`lock:cmd:${tenantA}:${sharedVehicleId}`, 10000);
    assert.ok(lockA);

    // Tenant B 锁定同名 ID 车辆：由于 key 前缀隔离 (lock:cmd:TENANT_BETA:...)，应完全互不干扰，成功获取！
    const lockB = await lockAdapter.acquire(`lock:cmd:${tenantB}:${sharedVehicleId}`, 10000);
    assert.ok(lockB, 'Tenant B must be isolated and succeed in acquiring its own lock');

    // Tenant B 无法释放 Tenant A 的锁
    const unauthorizedRelease = await lockAdapter.release({
      resource: `lock:cmd:${tenantA}:${sharedVehicleId}`,
      token: lockB.token, // 使用 Tenant B 的 Token 试图释放 Tenant A 的锁
      ttlMs: 10000,
      acquiredAt: Date.now(),
    });
    assert.strictEqual(unauthorizedRelease, false, 'Tenant B must NOT be able to release Tenant A lock');

    // Tenant A 原锁依然稳固受保护，其他人无法获取
    const probeA = await lockAdapter.acquire(`lock:cmd:${tenantA}:${sharedVehicleId}`, 1000);
    assert.strictEqual(probeA, null, 'Tenant A lock must remain held');

    // 正常释放
    await lockAdapter.release(lockA);
    await lockAdapter.release(lockB);

    // 7.2 缓存键的多租户隔离防线
    await lockAdapter.set(`tenant:${tenantA}:config`, { allowRemoteStart: true });
    await lockAdapter.set(`tenant:${tenantB}:config`, { allowRemoteStart: false });

    const configA = await lockAdapter.get<any>(`tenant:${tenantA}:config`);
    const configB = await lockAdapter.get<any>(`tenant:${tenantB}:config`);
    assert.strictEqual(configA?.allowRemoteStart, true);
    assert.strictEqual(configB?.allowRemoteStart, false);

    // 7.3 高并发负载下的跨租户零干扰压测 (50 Tenant A + 50 Tenant B 并发)
    const simTransport = new InMemoryTransport(bus);
    const simulatorsA: DeviceSimulator[] = [];
    const simulatorsB: DeviceSimulator[] = [];
    const countPerTenant = 50;

    for (let i = 0; i < countPerTenant; i++) {
      const devA = `DEV_TA_${i}`;
      const vehA = `VEH_TA_${i}`;
      deviceStatusService.registerDevice({
        deviceNo: devA,
        productKey: 'PK_A',
        vehicleId: vehA,
        onlineStatus: DeviceOnlineStatus.ONLINE,
      });
      messagingAdapter.subscribeDevice('PK_A', devA);
      simulatorsA.push(new DeviceSimulator({ productKey: 'PK_A', deviceNo: devA, defaultLatencyMs: 3 }, simTransport));

      const devB = `DEV_TB_${i}`;
      const vehB = `VEH_TB_${i}`;
      deviceStatusService.registerDevice({
        deviceNo: devB,
        productKey: 'PK_B',
        vehicleId: vehB,
        onlineStatus: DeviceOnlineStatus.ONLINE,
      });
      messagingAdapter.subscribeDevice('PK_B', devB);
      simulatorsB.push(new DeviceSimulator({ productKey: 'PK_B', deviceNo: devB, defaultLatencyMs: 3 }, simTransport));
    }

    await Promise.all([
      ...simulatorsA.map((s) => s.start()),
      ...simulatorsB.map((s) => s.start()),
    ]);

    try {
      const combinedTasks = [
        ...Array.from({ length: countPerTenant }, (_, i) => async () => {
          const vehA = `VEH_TA_${i}`;
          const devA = `DEV_TA_${i}`;
          const cmd = await commandService.executeCommand({
            tenantId: tenantA,
            vehicleId: vehA,
            deviceNo: devA,
            productKey: 'PK_A',
            commandCode: CommandCode.CMD_LOCK,
            idempotencyKey: `idemp_ta_${i}`,
            operatorId: 'OP_A',
          });
          return { tenantId: tenantA, cmd };
        }),
        ...Array.from({ length: countPerTenant }, (_, i) => async () => {
          const vehB = `VEH_TB_${i}`;
          const devB = `DEV_TB_${i}`;
          const cmd = await commandService.executeCommand({
            tenantId: tenantB,
            vehicleId: vehB,
            deviceNo: devB,
            productKey: 'PK_B',
            commandCode: CommandCode.CMD_UNLOCK,
            idempotencyKey: `idemp_tb_${i}`,
            operatorId: 'OP_B',
          });
          return { tenantId: tenantB, cmd };
        }),
      ];

      // 打乱顺序，模拟双租户穿插高并发流量
      const shuffledTasks = combinedTasks.sort(() => Math.random() - 0.5);
      const executionResults = await runConcurrencyPool(shuffledTasks, 30);

      // 验证全部 100 次指令均正确关联各自租户
      assert.strictEqual(executionResults.length, 100);
      for (const res of executionResults) {
        assert.strictEqual(res.cmd.tenantId, res.tenantId);
        assert.ok(
          res.cmd.status === CommandStatus.WAITING_ACK ||
            res.cmd.status === CommandStatus.SUCCESS
        );
      }
    } finally {
      await Promise.all([
        ...simulatorsA.map((s) => s.stop()),
        ...simulatorsB.map((s) => s.stop()),
      ]);
      await simTransport.disconnect();
    }
  });
});
