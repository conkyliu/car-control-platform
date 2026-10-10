import test from 'node:test';
import assert from 'node:assert/strict';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { MetricsService } from '../observability/metrics/metrics.service.js';
import { MetricsController } from '../observability/metrics/metrics.controller.js';
import { ObservabilityModule } from '../observability/observability.module.js';
import { AppModule } from '../app.module.js';

test('Gate 6 Task 3: Prometheus Metrics Service & GET /metrics Suite', async (t) => {
  await t.test('1. MetricsService: basic Prometheus exposition and counters (brief sample)', async () => {
    const metrics = new MetricsService();
    metrics.incrementCommands('tenant_01', 'CMD_UNLOCK', 'SUCCESS');
    metrics.observeCommandDuration('tenant_01', 'CMD_UNLOCK', 0.24);
    metrics.setActiveSimulators(10, 'online');

    const text = metrics.exportPrometheusMetrics();
    assert.ok(text.includes('# TYPE car_commands_total counter'));
    assert.ok(text.includes('car_commands_total{tenant_id="tenant_01",command_code="CMD_UNLOCK",status="SUCCESS"} 1'));
    assert.ok(text.includes('# TYPE car_command_duration_seconds histogram'));
    assert.ok(text.includes('car_active_simulators{online_status="online"} 10'));
  });

  await t.test('2. MetricsService: all 7 core metrics produce correct Prometheus format', async () => {
    const metrics = new MetricsService();

    // 1. car_commands_total
    metrics.incrementCommands('tenant-alpha', 'CMD_LOCK', 'SUCCESS');
    metrics.incrementCommands('tenant-alpha', 'CMD_LOCK', 'CONFLICT');

    // 2. car_command_duration_seconds
    metrics.observeCommandDuration('tenant-alpha', 'CMD_LOCK', 0.15);

    // 3. car_telemetry_uplinks_total
    metrics.incrementTelemetryUplinks('tenant-alpha', 'PK_MODEL_Y');

    // 4. car_alarms_total
    metrics.incrementAlarms('tenant-alpha', 'LOW_BATTERY', 'WARN');

    // 5. car_active_simulators
    metrics.setActiveSimulators(100, 'online');
    metrics.setActiveSimulators(5, 'offline');

    // 6. car_websocket_connections
    metrics.setWebsocketConnections('tenant-alpha', 45);

    // 7. car_lock_contention_total
    metrics.incrementLockContention('tenant-alpha');

    const text = metrics.exportPrometheusMetrics();

    // Assert HELP and TYPE for all 7 metrics
    assert.ok(text.includes('# HELP car_commands_total Total number of car control commands processed'));
    assert.ok(text.includes('# TYPE car_commands_total counter'));
    assert.ok(text.includes('car_commands_total{tenant_id="tenant-alpha",command_code="CMD_LOCK",status="SUCCESS"} 1'));
    assert.ok(text.includes('car_commands_total{tenant_id="tenant-alpha",command_code="CMD_LOCK",status="CONFLICT"} 1'));

    assert.ok(text.includes('# HELP car_command_duration_seconds End-to-end command execution latency in seconds'));
    assert.ok(text.includes('# TYPE car_command_duration_seconds histogram'));
    assert.ok(text.includes('car_command_duration_seconds_bucket{tenant_id="tenant-alpha",command_code="CMD_LOCK",le="0.25"} 1'));
    assert.ok(text.includes('car_command_duration_seconds_sum{tenant_id="tenant-alpha",command_code="CMD_LOCK"} 0.15'));
    assert.ok(text.includes('car_command_duration_seconds_count{tenant_id="tenant-alpha",command_code="CMD_LOCK"} 1'));

    assert.ok(text.includes('# HELP car_telemetry_uplinks_total Total count of GPS and telemetry packets ingested'));
    assert.ok(text.includes('# TYPE car_telemetry_uplinks_total counter'));
    assert.ok(text.includes('car_telemetry_uplinks_total{tenant_id="tenant-alpha",product_key="PK_MODEL_Y"} 1'));

    assert.ok(text.includes('# HELP car_alarms_total Total count of trigger alarms'));
    assert.ok(text.includes('# TYPE car_alarms_total counter'));
    assert.ok(text.includes('car_alarms_total{tenant_id="tenant-alpha",alarm_type="LOW_BATTERY",level="WARN"} 1'));

    assert.ok(text.includes('# HELP car_active_simulators Number of currently active simulators'));
    assert.ok(text.includes('# TYPE car_active_simulators gauge'));
    assert.ok(text.includes('car_active_simulators{online_status="online"} 100'));
    assert.ok(text.includes('car_active_simulators{online_status="offline"} 5'));

    assert.ok(text.includes('# HELP car_websocket_connections Number of active WebSocket connections'));
    assert.ok(text.includes('# TYPE car_websocket_connections gauge'));
    assert.ok(text.includes('car_websocket_connections{tenant_id="tenant-alpha"} 45'));

    assert.ok(text.includes('# HELP car_lock_contention_total Total count of distributed command lock contentions'));
    assert.ok(text.includes('# TYPE car_lock_contention_total counter'));
    assert.ok(text.includes('car_lock_contention_total{tenant_id="tenant-alpha"} 1'));
  });

  await t.test('3. Histogram bucket accumulation & SLA buckets verification', async () => {
    const metrics = new MetricsService();

    // First observation: 0.24s
    metrics.observeCommandDuration('tenant_01', 'CMD_UNLOCK', 0.24);

    let text = metrics.exportPrometheusMetrics();
    // le="0.05" -> 0, le="0.1" -> 0
    assert.ok(text.includes('car_command_duration_seconds_bucket{tenant_id="tenant_01",command_code="CMD_UNLOCK",le="0.05"} 0'));
    assert.ok(text.includes('car_command_duration_seconds_bucket{tenant_id="tenant_01",command_code="CMD_UNLOCK",le="0.1"} 0'));
    // le="0.25" through le="10" and +Inf -> 1
    assert.ok(text.includes('car_command_duration_seconds_bucket{tenant_id="tenant_01",command_code="CMD_UNLOCK",le="0.25"} 1'));
    assert.ok(text.includes('car_command_duration_seconds_bucket{tenant_id="tenant_01",command_code="CMD_UNLOCK",le="0.5"} 1'));
    assert.ok(text.includes('car_command_duration_seconds_bucket{tenant_id="tenant_01",command_code="CMD_UNLOCK",le="1"} 1'));
    assert.ok(text.includes('car_command_duration_seconds_bucket{tenant_id="tenant_01",command_code="CMD_UNLOCK",le="1.5"} 1'));
    assert.ok(text.includes('car_command_duration_seconds_bucket{tenant_id="tenant_01",command_code="CMD_UNLOCK",le="2"} 1'));
    assert.ok(text.includes('car_command_duration_seconds_bucket{tenant_id="tenant_01",command_code="CMD_UNLOCK",le="3"} 1'));
    assert.ok(text.includes('car_command_duration_seconds_bucket{tenant_id="tenant_01",command_code="CMD_UNLOCK",le="5"} 1'));
    assert.ok(text.includes('car_command_duration_seconds_bucket{tenant_id="tenant_01",command_code="CMD_UNLOCK",le="10"} 1'));
    assert.ok(text.includes('car_command_duration_seconds_bucket{tenant_id="tenant_01",command_code="CMD_UNLOCK",le="+Inf"} 1'));
    assert.ok(text.includes('car_command_duration_seconds_sum{tenant_id="tenant_01",command_code="CMD_UNLOCK"} 0.24'));
    assert.ok(text.includes('car_command_duration_seconds_count{tenant_id="tenant_01",command_code="CMD_UNLOCK"} 1'));

    // Second observation: 0.04s
    metrics.observeCommandDuration('tenant_01', 'CMD_UNLOCK', 0.04);

    text = metrics.exportPrometheusMetrics();
    // le="0.05" -> 1, le="0.1" -> 1, le="0.25" -> 2
    assert.ok(text.includes('car_command_duration_seconds_bucket{tenant_id="tenant_01",command_code="CMD_UNLOCK",le="0.05"} 1'));
    assert.ok(text.includes('car_command_duration_seconds_bucket{tenant_id="tenant_01",command_code="CMD_UNLOCK",le="0.1"} 1'));
    assert.ok(text.includes('car_command_duration_seconds_bucket{tenant_id="tenant_01",command_code="CMD_UNLOCK",le="0.25"} 2'));
    assert.ok(text.includes('car_command_duration_seconds_bucket{tenant_id="tenant_01",command_code="CMD_UNLOCK",le="+Inf"} 2'));
    assert.ok(text.includes('car_command_duration_seconds_sum{tenant_id="tenant_01",command_code="CMD_UNLOCK"} 0.28'));
    assert.ok(text.includes('car_command_duration_seconds_count{tenant_id="tenant_01",command_code="CMD_UNLOCK"} 2'));

    // Third observation: 12.0s (> 10s timeout window)
    metrics.observeCommandDuration('tenant_01', 'CMD_UNLOCK', 12.0);

    text = metrics.exportPrometheusMetrics();
    assert.ok(text.includes('car_command_duration_seconds_bucket{tenant_id="tenant_01",command_code="CMD_UNLOCK",le="10"} 2'));
    assert.ok(text.includes('car_command_duration_seconds_bucket{tenant_id="tenant_01",command_code="CMD_UNLOCK",le="+Inf"} 3'));
    assert.ok(text.includes('car_command_duration_seconds_sum{tenant_id="tenant_01",command_code="CMD_UNLOCK"} 12.28'));
    assert.ok(text.includes('car_command_duration_seconds_count{tenant_id="tenant_01",command_code="CMD_UNLOCK"} 3'));
  });

  await t.test('4. Gauges update dynamically to their latest values', async () => {
    const metrics = new MetricsService();

    // Initial gauges
    metrics.setActiveSimulators(10, 'online');
    metrics.setWebsocketConnections('tenant-A', 5);

    let text = metrics.exportPrometheusMetrics();
    assert.ok(text.includes('car_active_simulators{online_status="online"} 10'));
    assert.ok(text.includes('car_websocket_connections{tenant_id="tenant-A"} 5'));

    // Update gauge values
    metrics.setActiveSimulators(25, 'online');
    metrics.setWebsocketConnections('tenant-A', 0);

    text = metrics.exportPrometheusMetrics();
    assert.ok(text.includes('car_active_simulators{online_status="online"} 25'));
    assert.ok(!text.includes('car_active_simulators{online_status="online"} 10'));
    assert.ok(text.includes('car_websocket_connections{tenant_id="tenant-A"} 0'));
  });

  await t.test('5. Counters and lock contentions accumulate monotonically', async () => {
    const metrics = new MetricsService();

    for (let i = 0; i < 5; i++) {
      metrics.incrementLockContention('tenant-C');
      metrics.incrementCommands('tenant-C', 'CMD_LOCK', 'SUCCESS');
    }

    let text = metrics.exportPrometheusMetrics();
    assert.ok(text.includes('car_lock_contention_total{tenant_id="tenant-C"} 5'));
    assert.ok(text.includes('car_commands_total{tenant_id="tenant-C",command_code="CMD_LOCK",status="SUCCESS"} 5'));

    // Reset clears everything
    metrics.reset();
    text = metrics.exportPrometheusMetrics();
    assert.ok(!text.includes('tenant-C'));
  });

  await t.test('6. Label escaping handles special characters safely', async () => {
    const metrics = new MetricsService();
    metrics.incrementCommands('tenant"with"quotes', 'CMD\\ESCAPE', 'FAILED\nNEWLINE');

    const text = metrics.exportPrometheusMetrics();
    assert.ok(text.includes('tenant\\"with\\"quotes'));
    assert.ok(text.includes('CMD\\\\ESCAPE'));
    assert.ok(text.includes('FAILED\\nNEWLINE'));
  });

  await t.test('7. MetricsController: returns text/plain export', async () => {
    const metrics = new MetricsService();
    metrics.incrementCommands('tenant-beta', 'CMD_AC_ON', 'SUCCESS');
    const controller = new MetricsController(metrics);

    const result = controller.getMetrics();
    assert.ok(typeof result === 'string');
    assert.ok(result.includes('car_commands_total{tenant_id="tenant-beta",command_code="CMD_AC_ON",status="SUCCESS"} 1'));
  });

  await t.test('8. ObservabilityModule resolves MetricsService & MetricsController via NestFactory context', async () => {
    const app = await NestFactory.createApplicationContext(ObservabilityModule, { logger: false });
    const metricsService = app.get(MetricsService);
    const metricsController = app.get(MetricsController);

    assert.ok(metricsService instanceof MetricsService);
    assert.ok(metricsController instanceof MetricsController);

    metricsService.incrementCommands('tenant-di-test', 'CMD_WINDOWS', 'SUCCESS');
    const output = metricsController.getMetrics();
    assert.ok(output.includes('tenant-di-test'));

    await app.close();
  });

  await t.test('9. AppModule metadata registers ObservabilityModule in imports and exports', async () => {
    const imports = Reflect.getMetadata('imports', AppModule) as any[];
    const exports = Reflect.getMetadata('exports', AppModule) as any[];

    assert.ok(Array.isArray(imports));
    assert.ok(imports.includes(ObservabilityModule));
    assert.ok(Array.isArray(exports));
    assert.ok(exports.includes(ObservabilityModule));
  });
});
