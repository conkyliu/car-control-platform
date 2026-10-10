import test from 'node:test';
import assert from 'node:assert/strict';
import { ConflictException } from '@nestjs/common';
import { CommandCode, CommandStatus, WebSocketEvent } from '@car-control/contracts';
import { DeviceOnlineStatus } from '@car-control/domain-types';
import { InMemoryTransport, DeviceSimulator } from '@car-control/simulator';
import { InMemoryLockAdapter } from '../common/cache/in-memory-cache.adapter.js';
import { InMemoryMessagingAdapter } from '../messaging/in-memory-messaging.adapter.js';
import { DeviceStatusService } from '../device/device-status.service.js';
import { WebSocketGatewayService } from '../realtime/websocket.gateway.js';
import { CommandService } from '../command/command.service.js';
import { MetricsService } from '../observability/metrics/metrics.service.js';
import { TracerService } from '../observability/tracing/tracer.service.js';
import {
  STANDARD_SPAN_NAMES,
  CommandTraceSpan,
  generateW3CTraceId,
  parseOrGenerateTraceId,
} from '../observability/tracing/tracer.types.js';

test('Gate 6 Task 4: OpenTelemetry W3C 5-Span Distributed Tracing Suite', async (t) => {
  await t.test('1. TracerService: W3C traceId generation, traceparent parsing, and explicit ID', async () => {
    // 1.1 W3C 32-character hexadecimal traceId generation
    const generatedId = generateW3CTraceId();
    assert.strictEqual(generatedId.length, 32);
    assert.match(generatedId, /^[0-9a-f]{32}$/);

    // 1.2 Parse standard W3C traceparent header: 00-${traceId}-${spanId}-01
    const rawTraceId = '4bf92f3577b34da6a3ce929d0e0e4736';
    const traceparent = `00-${rawTraceId}-00f067aa0ba902b7-01`;
    const parsedId = parseOrGenerateTraceId(traceparent);
    assert.strictEqual(parsedId, rawTraceId);

    // 1.3 Explicit trace ID pass-through
    const explicit = 'custom_trace_identifier_123';
    assert.strictEqual(parseOrGenerateTraceId(explicit), explicit);

    // 1.4 Empty / undefined falls back to valid 32-hex generation
    const fallbackId = parseOrGenerateTraceId(undefined);
    assert.strictEqual(fallbackId.length, 32);
    assert.match(fallbackId, /^[0-9a-f]{32}$/);
  });

  await t.test('2. TracerService: 5-span recording, duration summation and trace retrieval', async () => {
    const tracer = new TracerService();
    const commandId = 'cmd_trace_test_01';
    const vehicleId = 'VEH_TRACE_01';
    const tenantId = 'TENANT_TRACE';

    const trace = tracer.startTrace(commandId, vehicleId, tenantId);
    assert.ok(trace);
    assert.strictEqual(trace.commandId, commandId);
    assert.strictEqual(trace.vehicleId, vehicleId);
    assert.strictEqual(trace.tenantId, tenantId);
    assert.strictEqual(trace.spans.length, 0);

    // Record 5 standard spans
    tracer.recordSpan(trace.traceId, STANDARD_SPAN_NAMES.HTTP_INBOUND_REQUEST, 4, {
      endpoint: '/api/v1/commands',
    });
    tracer.recordSpan(trace.traceId, STANDARD_SPAN_NAMES.COMMAND_SECURITY_AND_DISPATCH, 12, {
      commandCode: 'CMD_LOCK',
    });
    tracer.recordSpan(trace.traceId, STANDARD_SPAN_NAMES.DEVICE_EXECUTION_ACK, 45, {
      deviceNo: 'DEV_01',
    });
    tracer.recordSpan(trace.traceId, STANDARD_SPAN_NAMES.ACK_PROCESSING_AND_PERSISTENCE, 8, {
      dbWrite: true,
    });
    tracer.recordSpan(trace.traceId, STANDARD_SPAN_NAMES.WEBSOCKET_CLIENT_NOTIFICATION, 3, {
      wsClients: 1,
    });

    const finished = tracer.finishTrace(trace.traceId, 'SUCCESS');
    assert.ok(finished);
    assert.strictEqual(finished.status, 'SUCCESS');
    assert.strictEqual(finished.spans.length, 5);

    // Total duration should equal sum: 4 + 12 + 45 + 8 + 3 = 72ms
    assert.strictEqual(finished.totalDurationMs, 72);

    // Retrieval by traceId
    const retrievedByTrace = tracer.getTrace(trace.traceId);
    assert.strictEqual(retrievedByTrace?.commandId, commandId);

    // Retrieval by commandId
    const retrievedByCmd = tracer.getTraceByCommandId(commandId);
    assert.strictEqual(retrievedByCmd?.traceId, trace.traceId);
    assert.strictEqual(retrievedByCmd?.totalDurationMs, 72);
  });

  await t.test('3. TracerService: LRU/capacity eviction and TTL cleanup prevent memory leaks', async () => {
    const tracer = new TracerService({ maxTraces: 3, ttlMs: 50 });

    tracer.startTrace('cmd_1', 'v1');
    tracer.startTrace('cmd_2', 'v2');
    tracer.startTrace('cmd_3', 'v3');
    assert.ok(tracer.getTraceByCommandId('cmd_1'));

    // Exceed capacity (maxTraces = 3) -> cmd_1 evicted
    tracer.startTrace('cmd_4', 'v4');
    assert.strictEqual(tracer.getTraceByCommandId('cmd_1'), null);
    assert.ok(tracer.getTraceByCommandId('cmd_2'));
    assert.ok(tracer.getTraceByCommandId('cmd_4'));

    // Wait 60ms for TTL expiration
    await new Promise((r) => setTimeout(r, 60));
    const cleaned = tracer.cleanup();
    assert.ok(cleaned >= 3);
    assert.strictEqual(tracer.getTraceByCommandId('cmd_4'), null);
  });

  await t.test('4. CommandService Integration: full closed-loop records 5 spans and feeds Prometheus metrics', async () => {
    const productKey = 'PK_TRACE_DEMO';
    const deviceNo = 'DEV_TRACE_001';
    const vehicleId = 'VEH_TRACE_001';
    const tenantId = 'TENANT_TRACE_ALPHA';
    const operatorId = 'USER_TRACE_OP';

    const lockPort = new InMemoryLockAdapter();
    const sharedBus = InMemoryMessagingAdapter.getSharedBus();
    const simTransport = new InMemoryTransport(sharedBus);
    const messagingAdapter = new InMemoryMessagingAdapter(sharedBus);
    messagingAdapter.subscribeDevice(productKey, deviceNo);

    const deviceStatusService = new DeviceStatusService();
    const wsGateway = new WebSocketGatewayService();
    const tracerService = new TracerService();
    const metricsService = new MetricsService();

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
      lockPort,
      tracerService,
      metricsService
    );

    // Create simulator that responds to command with low latency (20ms)
    const simulator = new DeviceSimulator(
      {
        productKey,
        deviceNo,
        defaultLatencyMs: 20,
      },
      simTransport
    );
    await simulator.start();

    try {
      // Execute command with W3C traceparent
      const traceparent = '00-abcdef0123456789abcdef0123456789-0123456789abcdef-01';
      const cmdRecord = await commandService.executeCommand({
        tenantId,
        vehicleId,
        deviceNo,
        productKey,
        commandCode: CommandCode.CMD_LOCK,
        idempotencyKey: 'idemp_trace_01',
        operatorId,
        traceId: traceparent,
      });

      assert.strictEqual(cmdRecord.status, CommandStatus.WAITING_ACK);

      // Wait for simulator to process command and send ACK
      await new Promise((r) => setTimeout(r, 120));

      // Verify command reached SUCCESS
      const updatedRecord = commandService.getCommand(cmdRecord.id);
      assert.strictEqual(updatedRecord.status, CommandStatus.SUCCESS);

      // Verify TracerService captured all 5 spans
      const trace = tracerService.getTraceByCommandId(cmdRecord.id);
      assert.ok(trace, 'Trace must be found for executed command');
      assert.strictEqual(trace.traceId, 'abcdef0123456789abcdef0123456789');
      assert.strictEqual(trace.status, 'SUCCESS');
      assert.strictEqual(trace.spans.length, 5, 'Must contain exactly 5 spans');

      const spanNames = trace.spans.map((s: CommandTraceSpan) => s.name);
      assert.deepStrictEqual(spanNames, [
        STANDARD_SPAN_NAMES.HTTP_INBOUND_REQUEST,
        STANDARD_SPAN_NAMES.COMMAND_SECURITY_AND_DISPATCH,
        STANDARD_SPAN_NAMES.DEVICE_EXECUTION_ACK,
        STANDARD_SPAN_NAMES.ACK_PROCESSING_AND_PERSISTENCE,
        STANDARD_SPAN_NAMES.WEBSOCKET_CLIENT_NOTIFICATION,
      ]);

      // Each span must have positive millisecond duration
      for (const span of trace.spans) {
        assert.ok(
          span.durationMs > 0,
          `Span ${span.name} durationMs must be > 0, got ${span.durationMs}`
        );
        assert.ok(
          span.endTime >= span.startTime,
          `Span ${span.name} endTime must be >= startTime`
        );
      }

      // Total duration must equal sum of spans
      const sumSpans = trace.spans.reduce(
        (sum: number, s: CommandTraceSpan) => sum + s.durationMs,
        0
      );
      assert.strictEqual(trace.totalDurationMs, sumSpans);

      // Verify MetricsService recorded command success and histogram observation
      const promMetrics = metricsService.exportPrometheusMetrics();
      assert.ok(
        promMetrics.includes(
          `car_commands_total{tenant_id="${tenantId}",command_code="CMD_LOCK",status="SUCCESS"} 1`
        ),
        'Prometheus car_commands_total counter must increment for SUCCESS'
      );
      assert.ok(
        promMetrics.includes(
          `car_command_duration_seconds_count{tenant_id="${tenantId}",command_code="CMD_LOCK"} 1`
        ),
        'Prometheus car_command_duration_seconds histogram count must be 1'
      );
    } finally {
      await simulator.stop();
    }
  });

  await t.test('5. CommandService Integration: lock contention increments car_lock_contention_total metric on 409', async () => {
    const productKey = 'PK_TRACE_DEMO';
    const deviceNo = 'DEV_TRACE_002';
    const vehicleId = 'VEH_TRACE_002';
    const tenantId = 'TENANT_TRACE_BETA';
    const operatorId = 'USER_TRACE_OP';

    const lockPort = new InMemoryLockAdapter();
    const sharedBus = InMemoryMessagingAdapter.getSharedBus();
    const messagingAdapter = new InMemoryMessagingAdapter(sharedBus);
    messagingAdapter.subscribeDevice(productKey, deviceNo);

    const deviceStatusService = new DeviceStatusService();
    const wsGateway = new WebSocketGatewayService();
    const tracerService = new TracerService();
    const metricsService = new MetricsService();

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
      lockPort,
      tracerService,
      metricsService
    );

    // First command acquires lock and enters WAITING_ACK
    await commandService.executeCommand({
      tenantId,
      vehicleId,
      deviceNo,
      productKey,
      commandCode: CommandCode.CMD_LOCK,
      idempotencyKey: 'idemp_contention_1',
      operatorId,
      customTimeoutMs: 5000,
    });

    // Concurrent second command on same vehicle must fail with 409 ConflictException
    await assert.rejects(
      async () => {
        await commandService.executeCommand({
          tenantId,
          vehicleId,
          deviceNo,
          productKey,
          commandCode: CommandCode.CMD_UNLOCK,
          idempotencyKey: 'idemp_contention_2',
          operatorId,
          customTimeoutMs: 5000,
        });
      },
      (err: any) => {
        assert.ok(err instanceof ConflictException);
        return true;
      }
    );

    // Verify car_lock_contention_total was incremented for tenant
    const promMetrics = metricsService.exportPrometheusMetrics();
    assert.ok(
      promMetrics.includes(`car_lock_contention_total{tenant_id="${tenantId}"} 1`),
      'car_lock_contention_total must be incremented on 409 lock contention'
    );
  });

  await t.test('6. CommandService Integration: ACK rejection and timeout finish trace and increment metrics', async () => {
    const productKey = 'PK_TRACE_DEMO';
    const deviceNo = 'DEV_TRACE_003';
    const vehicleId = 'VEH_TRACE_003';
    const tenantId = 'TENANT_TRACE_GAMMA';
    const operatorId = 'USER_TRACE_OP';

    const lockPort = new InMemoryLockAdapter();
    const sharedBus = InMemoryMessagingAdapter.getSharedBus();
    const messagingAdapter = new InMemoryMessagingAdapter(sharedBus);
    messagingAdapter.subscribeDevice(productKey, deviceNo);

    const deviceStatusService = new DeviceStatusService();
    const wsGateway = new WebSocketGatewayService();
    const tracerService = new TracerService();
    const metricsService = new MetricsService();

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
      lockPort,
      tracerService,
      metricsService
    );

    // 6.1 Test Device Rejected (ACK code 1001)
    const cmd1 = await commandService.executeCommand({
      tenantId,
      vehicleId,
      deviceNo,
      productKey,
      commandCode: CommandCode.CMD_LOCK,
      idempotencyKey: 'idemp_reject_1',
      operatorId,
      customTimeoutMs: 5000,
    });

    // Manually trigger rejection ACK
    await commandService.handleAck({
      traceId: cmd1.traceId,
      requestId: cmd1.requestId,
      commandId: cmd1.id,
      commandCode: cmd1.commandCode,
      code: 1001,
      message: 'Doors already locked',
      timestamp: Date.now(),
    });

    const trace1 = tracerService.getTraceByCommandId(cmd1.id);
    assert.ok(trace1);
    assert.strictEqual(trace1.status, 'DEVICE_REJECTED');

    let promMetrics = metricsService.exportPrometheusMetrics();
    assert.ok(
      promMetrics.includes(`car_commands_total{tenant_id="${tenantId}",command_code="CMD_LOCK",status="DEVICE_REJECTED"} 1`)
    );

    // 6.2 Test Timeout
    const cmd2 = await commandService.executeCommand({
      tenantId,
      vehicleId,
      deviceNo,
      productKey,
      commandCode: CommandCode.CMD_UNLOCK,
      idempotencyKey: 'idemp_timeout_1',
      operatorId,
      customTimeoutMs: 50,
    });

    // Wait for timeout to fire
    await new Promise((r) => setTimeout(r, 80));

    const trace2 = tracerService.getTraceByCommandId(cmd2.id);
    assert.ok(trace2);
    assert.strictEqual(trace2.status, 'TIMEOUT');

    promMetrics = metricsService.exportPrometheusMetrics();
    assert.ok(
      promMetrics.includes(`car_commands_total{tenant_id="${tenantId}",command_code="CMD_UNLOCK",status="TIMEOUT"} 1`)
    );
  });
});
