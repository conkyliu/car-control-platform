import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  type PrometheusMetricType,
  type PrometheusSample,
  type PrometheusParsedMetric,
  type CorePrometheusMetrics,
  type ClusterNodeHealth,
  type MessageQueueStats,
  type SystemResourceWatermark,
  type SystemMetricsSnapshotDto,
  parsePrometheusText,
  extractCorePrometheusMetrics,
  calculateHistogramPercentile,
  calculateClusterHealthSummary,
  formatUptime,
  formatBytes,
  generateMockPrometheusText,
  SEED_PROMETHEUS_RAW_TEXT,
  SEED_CLUSTER_NODES,
  SEED_SYSTEM_METRICS_SNAPSHOT,
  isApiError,
} from '../views/monitor/metrics-core.ts';
import {
  fetchRawPrometheusMetricsApi,
  fetchSystemMetricsSnapshotApi,
  fetchClusterNodesApi,
  subscribeRealtimeMetrics,
  getInMemoryPrometheusText,
  setInMemoryPrometheusText,
  resetInMemoryPrometheusText,
  getInMemoryClusterNodes,
  setInMemoryClusterNodes,
  resetInMemoryClusterNodes,
} from '../api/metrics.ts';
import { ApiError } from '../api/client.ts';
import { RoutePath, getMenuRoutes, findRouteByPath } from '../router/routes.ts';

describe('System Prometheus Metrics & Cluster Health Core & TDD Test Suite', () => {
  beforeEach(() => {
    resetInMemoryPrometheusText();
    resetInMemoryClusterNodes();
  });

  describe('1. Prometheus Raw Text Parser (parsePrometheusText)', () => {
    it('parses HELP and TYPE comments and associates them with metric definitions', () => {
      const raw = [
        '# HELP http_requests_total Total HTTP requests',
        '# TYPE http_requests_total counter',
        'http_requests_total{method="GET",handler="/status"} 1027',
      ].join('\n');

      const parsed = parsePrometheusText(raw);
      assert.equal(parsed.length, 1);
      const metric = parsed[0];
      assert.equal(metric.name, 'http_requests_total');
      assert.equal(metric.help, 'Total HTTP requests');
      assert.equal(metric.type, 'counter');
      assert.equal(metric.samples.length, 1);
      assert.equal(metric.samples[0].name, 'http_requests_total');
      assert.equal(metric.samples[0].labels.method, 'GET');
      assert.equal(metric.samples[0].labels.handler, '/status');
      assert.equal(metric.samples[0].value, 1027);
    });

    it('parses complex labels with escaped quotes, backslashes, and newlines', () => {
      const raw = [
        '# HELP log_message_total Log messages with escape characters',
        '# TYPE log_message_total counter',
        'log_message_total{error="failed with \\"quote\\"",path="C:\\\\windows\\\\temp",note="line1\\nline2"} 42',
      ].join('\n');

      const parsed = parsePrometheusText(raw);
      assert.equal(parsed.length, 1);
      const sample = parsed[0].samples[0];
      assert.equal(sample.labels.error, 'failed with "quote"');
      assert.equal(sample.labels.path, 'C:\\windows\\temp');
      assert.equal(sample.labels.note, 'line1\nline2');
      assert.equal(sample.value, 42);
    });

    it('handles numeric representations including floating point, +Inf, -Inf, and NaN', () => {
      const raw = [
        '# TYPE latency_seconds histogram',
        'latency_seconds_bucket{le="0.1"} 15.5',
        'latency_seconds_bucket{le="+Inf"} +Inf',
        'latency_seconds_bucket{le="-Inf"} -Inf',
        'latency_seconds_bucket{le="NaN"} NaN',
      ].join('\n');

      const parsed = parsePrometheusText(raw);
      const latencyMetric = parsed.find((m) => m.name === 'latency_seconds');
      assert.ok(latencyMetric, 'latency_seconds family should be found');
      assert.equal(latencyMetric.samples.length, 4);
      assert.equal(latencyMetric.samples[0].value, 15.5);
      assert.equal(latencyMetric.samples[1].value, Infinity);
      assert.equal(latencyMetric.samples[2].value, -Infinity);
      assert.ok(Number.isNaN(latencyMetric.samples[3].value));
    });

    it('parses samples without labels correctly', () => {
      const raw = [
        '# TYPE node_boot_time_seconds gauge',
        'node_boot_time_seconds 1728987654',
      ].join('\n');

      const parsed = parsePrometheusText(raw);
      assert.equal(parsed.length, 1);
      assert.equal(parsed[0].samples[0].value, 1728987654);
      assert.deepEqual(parsed[0].samples[0].labels, {});
    });

    it('gracefully handles empty string and comments only without crashing', () => {
      const emptyParsed = parsePrometheusText('');
      assert.deepEqual(emptyParsed, []);

      const commentsOnly = parsePrometheusText('# Just a comment\n# Another comment\n\n');
      assert.deepEqual(commentsOnly, []);
    });
  });

  describe('2. Histogram Percentile Linear Interpolation (calculateHistogramPercentile)', () => {
    it('calculates P50, P90, P99 with standard Prometheus linear interpolation', () => {
      const buckets = [
        { le: 0.05, count: 20 },
        { le: 0.1, count: 50 },
        { le: 0.25, count: 80 },
        { le: 0.5, count: 90 },
        { le: 1.0, count: 98 },
        { le: 2.0, count: 100 },
        { le: Infinity, count: 100 },
      ];

      const p50 = calculateHistogramPercentile(buckets, 0.5);
      // rank = 50, exactly at bucket le: 0.1 (lowerLe: 0.05, lowerCount: 20, fraction: (50-20)/(50-20) = 1) -> 0.1
      assert.equal(p50, 0.1);

      const p90 = calculateHistogramPercentile(buckets, 0.9);
      // rank = 90, in bucket le: 0.5 (lowerLe: 0.25, lowerCount: 80, fraction: (90-80)/(90-80) = 1) -> 0.5
      assert.equal(p90, 0.5);

      const p99 = calculateHistogramPercentile(buckets, 0.99);
      // rank = 99, in bucket le: 2.0 (lowerLe: 1.0, lowerCount: 98, fraction: (99-98)/(100-98) = 0.5) -> 1.0 + 0.5*(2.0-1.0) = 1.5
      assert.equal(p99, 1.5);
    });

    it('returns 0 when buckets are empty or total count is 0', () => {
      assert.equal(calculateHistogramPercentile([], 0.5), 0);
      assert.equal(calculateHistogramPercentile([{ le: 1.0, count: 0 }, { le: Infinity, count: 0 }], 0.99), 0);
    });

    it('handles percentile boundaries <= 0 and >= 1 safely', () => {
      const buckets = [
        { le: 0.5, count: 10 },
        { le: 1.0, count: 20 },
        { le: Infinity, count: 20 },
      ];
      assert.equal(calculateHistogramPercentile(buckets, 0), 0);
      assert.equal(calculateHistogramPercentile(buckets, 1), 1.0);
    });
  });

  describe('3. Core Prometheus Metrics Extraction (extractCorePrometheusMetrics)', () => {
    it('accurately aggregates all 7 backend core metrics from parsed sample series', () => {
      const parsed = parsePrometheusText(SEED_PROMETHEUS_RAW_TEXT);
      const metrics = extractCorePrometheusMetrics(parsed);

      // 1. car_commands_total
      assert.ok(metrics.commandsTotal > 0, 'commandsTotal should be > 0');
      assert.ok(metrics.commandSuccessRate >= 90 && metrics.commandSuccessRate <= 100);
      assert.ok(metrics.commandsByStatus.SUCCESS > 0);
      assert.ok(metrics.commandsByCode.UNLOCK_DOORS > 0);

      // 2. car_command_duration_seconds
      assert.ok(metrics.commandDuration.count > 0);
      assert.ok(metrics.commandDuration.sum > 0);
      assert.ok(metrics.commandDuration.avgSeconds > 0);
      assert.ok(metrics.commandDuration.p50Seconds > 0);
      assert.ok(metrics.commandDuration.p99Seconds >= metrics.commandDuration.p50Seconds);
      assert.ok(metrics.commandDuration.buckets.length > 0);

      // 3. car_telemetry_uplinks_total
      assert.ok(metrics.telemetryUplinksTotal > 0);
      assert.ok(Object.keys(metrics.telemetryUplinksByProductKey).length > 0);
      assert.ok(Object.keys(metrics.telemetryUplinksByTenant).length > 0);

      // 4. car_alarms_total
      assert.ok(metrics.alarmsTotal > 0);
      assert.ok(Object.keys(metrics.alarmsByType).length > 0);
      assert.ok(Object.keys(metrics.alarmsByLevel).length > 0);

      // 5. car_active_simulators
      assert.ok(metrics.activeSimulators.total > 0);
      assert.equal(
        metrics.activeSimulators.total,
        metrics.activeSimulators.online + metrics.activeSimulators.offline
      );
      assert.ok(metrics.activeSimulators.onlineRate > 0 && metrics.activeSimulators.onlineRate <= 100);

      // 6. car_websocket_connections
      assert.ok(metrics.websocketConnections.total > 0);
      assert.ok(Object.keys(metrics.websocketConnections.byTenant).length > 0);

      // 7. car_lock_contention_total
      assert.ok(metrics.lockContentions.total >= 0);
      assert.ok(metrics.lockContentions.contentionRatePerThousand >= 0);
    });

    it('filters metrics by tenant_id when filterTenantId is provided', () => {
      const parsed = parsePrometheusText(SEED_PROMETHEUS_RAW_TEXT);
      const allMetrics = extractCorePrometheusMetrics(parsed);
      const alphaMetrics = extractCorePrometheusMetrics(parsed, 'tenant-alpha');

      assert.ok(alphaMetrics.commandsTotal > 0);
      assert.ok(alphaMetrics.commandsTotal < allMetrics.commandsTotal);
      assert.ok(alphaMetrics.telemetryUplinksTotal < allMetrics.telemetryUplinksTotal);
      assert.equal(
        Object.keys(alphaMetrics.websocketConnections.byTenant).length,
        1
      );
      assert.ok('tenant-alpha' in alphaMetrics.websocketConnections.byTenant);
    });

    it('protects against division by zero with NaN/Infinity safe fallbacks', () => {
      const emptyMetrics = extractCorePrometheusMetrics([]);
      assert.equal(emptyMetrics.commandsTotal, 0);
      assert.equal(emptyMetrics.commandSuccessRate, 100);
      assert.equal(emptyMetrics.commandDuration.avgSeconds, 0);
      assert.equal(emptyMetrics.commandDuration.p50Seconds, 0);
      assert.equal(emptyMetrics.commandDuration.p99Seconds, 0);
      assert.equal(emptyMetrics.activeSimulators.onlineRate, 0);
      assert.equal(emptyMetrics.lockContentions.contentionRatePerThousand, 0);
    });
  });

  describe('4. Cluster Node Health Summary (calculateClusterHealthSummary)', () => {
    it('returns overall HEALTHY when all cluster nodes are healthy', () => {
      const allHealthy = SEED_CLUSTER_NODES.map((n) => ({ ...n, status: 'HEALTHY' as const }));
      const summary = calculateClusterHealthSummary(allHealthy);
      assert.equal(summary.overallStatus, 'HEALTHY');
      assert.equal(summary.healthyCount, 8);
      assert.equal(summary.totalCount, 8);
      assert.ok(summary.avgCpuPercent > 0);
      assert.ok(summary.avgMemoryPercent > 0);
    });

    it('returns overall DEGRADED when some nodes are DEGRADED and none are UNHEALTHY', () => {
      const nodes: ClusterNodeHealth[] = [
        ...SEED_CLUSTER_NODES.slice(0, 7),
        { ...SEED_CLUSTER_NODES[7], status: 'DEGRADED' },
      ];
      const summary = calculateClusterHealthSummary(nodes);
      assert.equal(summary.overallStatus, 'DEGRADED');
      assert.equal(summary.healthyCount, 7);
    });

    it('returns overall UNHEALTHY if any single service node is UNHEALTHY', () => {
      const nodes: ClusterNodeHealth[] = [
        ...SEED_CLUSTER_NODES.slice(0, 6),
        { ...SEED_CLUSTER_NODES[6], status: 'DEGRADED' },
        { ...SEED_CLUSTER_NODES[7], status: 'UNHEALTHY' },
      ];
      const summary = calculateClusterHealthSummary(nodes);
      assert.equal(summary.overallStatus, 'UNHEALTHY');
      assert.equal(summary.healthyCount, 6);
    });

    it('handles empty node list safely without NaN', () => {
      const summary = calculateClusterHealthSummary([]);
      assert.equal(summary.overallStatus, 'HEALTHY');
      assert.equal(summary.healthyCount, 0);
      assert.equal(summary.totalCount, 0);
      assert.equal(summary.avgCpuPercent, 0);
      assert.equal(summary.avgMemoryPercent, 0);
    });
  });

  describe('5. Formatting Utilities (formatUptime & formatBytes)', () => {
    it('formats uptime seconds into human-readable compact strings', () => {
      assert.equal(formatUptime(45), '45s');
      assert.equal(formatUptime(125), '2m 5s');
      assert.equal(formatUptime(3665), '1h 1m');
      assert.equal(formatUptime(90061), '1d 1h 1m');
      assert.equal(formatUptime(1234560), '14d 6h 56m');
    });

    it('formats byte quantities into standard readable binary units', () => {
      assert.equal(formatBytes(0), '0 B');
      assert.equal(formatBytes(512), '512.0 B');
      assert.equal(formatBytes(1024), '1.0 KB');
      assert.equal(formatBytes(1048576 * 15.5), '15.5 MB');
      assert.equal(formatBytes(1073741824 * 64), '64.0 GB');
    });
  });

  describe('6. Production Seed Invariants', () => {
    it('SEED_PROMETHEUS_RAW_TEXT contains all 7 backend observability metrics', () => {
      assert.ok(SEED_PROMETHEUS_RAW_TEXT.includes('car_commands_total'));
      assert.ok(SEED_PROMETHEUS_RAW_TEXT.includes('car_command_duration_seconds'));
      assert.ok(SEED_PROMETHEUS_RAW_TEXT.includes('car_telemetry_uplinks_total'));
      assert.ok(SEED_PROMETHEUS_RAW_TEXT.includes('car_alarms_total'));
      assert.ok(SEED_PROMETHEUS_RAW_TEXT.includes('car_active_simulators'));
      assert.ok(SEED_PROMETHEUS_RAW_TEXT.includes('car_websocket_connections'));
      assert.ok(SEED_PROMETHEUS_RAW_TEXT.includes('car_lock_contention_total'));
    });

    it('SEED_CLUSTER_NODES contains 8 key microservice and middleware components', () => {
      assert.equal(SEED_CLUSTER_NODES.length, 8);
      const names = SEED_CLUSTER_NODES.map((n) => n.serviceName);
      assert.ok(names.includes('api-gateway'));
      assert.ok(names.includes('car-control-core'));
      assert.ok(names.includes('telemetry-processor'));
      assert.ok(names.includes('ota-scheduler'));
      assert.ok(names.includes('alarm-dispatcher'));
      assert.ok(names.includes('emqx-broker'));
      assert.ok(names.includes('redis-cluster'));
      assert.ok(names.includes('postgres-db'));

      for (const node of SEED_CLUSTER_NODES) {
        assert.ok(node.id);
        assert.ok(node.host);
        assert.ok(node.port > 0);
        assert.ok(node.cpuUsagePercent >= 0 && node.cpuUsagePercent <= 100);
        assert.ok(node.memoryUsagePercent >= 0 && node.memoryUsagePercent <= 100);
        assert.ok(node.uptimeSeconds > 0);
        assert.ok(node.version);
      }
    });

    it('SEED_SYSTEM_METRICS_SNAPSHOT conforms to SystemMetricsSnapshotDto interface', () => {
      const snap = SEED_SYSTEM_METRICS_SNAPSHOT;
      assert.ok(snap.timestamp > 0);
      assert.ok(snap.corePrometheus.commandsTotal > 0);
      assert.equal(snap.clusterHealth.nodes.length, 8);
      assert.equal(snap.messageQueue.brokerType, 'EMQX');
      assert.ok(snap.messageQueue.msgInRateSec > 0);
      assert.ok(snap.resources.cpuUsagePercent > 0);
      assert.ok(snap.rawPrometheusText.length > 0);
    });

    it('generateMockPrometheusText creates valid Prometheus text reflecting overrides', () => {
      const generated = generateMockPrometheusText();
      assert.ok(generated.includes('car_commands_total'));
      const parsed = parsePrometheusText(generated);
      const core = extractCorePrometheusMetrics(parsed);
      assert.ok(core.commandsTotal > 0);
    });
  });

  describe('7. API Client Methods & Offline Fallback (api/metrics.ts)', () => {
    it('fetchRawPrometheusMetricsApi retrieves raw Prometheus metric text', async () => {
      const text = await fetchRawPrometheusMetricsApi();
      assert.ok(typeof text === 'string');
      assert.ok(text.includes('car_commands_total'));
    });

    it('fetchSystemMetricsSnapshotApi returns comprehensive snapshot and honors tenant filtering', async () => {
      const snapshotAll = await fetchSystemMetricsSnapshotApi();
      assert.ok(snapshotAll.corePrometheus.commandsTotal > 0);
      assert.equal(snapshotAll.clusterHealth.nodes.length, 8);

      const snapshotAlpha = await fetchSystemMetricsSnapshotApi('tenant-alpha');
      assert.ok(snapshotAlpha.corePrometheus.commandsTotal < snapshotAll.corePrometheus.commandsTotal);
    });

    it('fetchClusterNodesApi retrieves all 8 microservice health nodes', async () => {
      const nodes = await fetchClusterNodesApi();
      assert.equal(nodes.length, 8);
      assert.equal(nodes[0].serviceName, 'api-gateway');
    });

    it('manages in-memory state pool with update and reset helpers', () => {
      const originalText = getInMemoryPrometheusText();
      setInMemoryPrometheusText('# HELP test 1\n# TYPE test gauge\ntest 99\n');
      assert.ok(getInMemoryPrometheusText().includes('test 99'));
      resetInMemoryPrometheusText();
      assert.equal(getInMemoryPrometheusText(), originalText);

      const nodes = getInMemoryClusterNodes();
      assert.equal(nodes.length, 8);
      setInMemoryClusterNodes([nodes[0]]);
      assert.equal(getInMemoryClusterNodes().length, 1);
      resetInMemoryClusterNodes();
      assert.equal(getInMemoryClusterNodes().length, 8);
    });

    it('does not swallow ApiError thrown by server request', () => {
      const apiErr = new ApiError('Forbidden', 403);
      assert.equal(isApiError(apiErr), true);
      const regularErr = new Error('Network error');
      assert.equal(isApiError(regularErr), false);
    });

    it('subscribeRealtimeMetrics sets up polling interval and cleanup function terminates timer', async () => {
      let callCount = 0;
      let lastSnapshot: SystemMetricsSnapshotDto | null = null;

      const unsubscribe = subscribeRealtimeMetrics((snapshot) => {
        callCount++;
        lastSnapshot = snapshot;
      }, 50);

      assert.ok(typeof unsubscribe === 'function');

      // Wait for initial async fetch to resolve
      await new Promise((resolve) => setTimeout(resolve, 20));
      assert.ok(callCount >= 1);
      assert.ok(lastSnapshot !== null);

      // Wait for at least one timer tick
      await new Promise((resolve) => setTimeout(resolve, 120));
      assert.ok(callCount >= 2);

      const currentCount = callCount;
      unsubscribe();

      // Wait another tick and ensure callCount did not increase
      await new Promise((resolve) => setTimeout(resolve, 80));
      assert.equal(callCount, currentCount, 'Callback should not be called after unsubscribe');
    });
  });

  describe('8. Router Navigation Contract & Sidebar Menu Count', () => {
    it('maintains 14-menu constant contract across the entire platform', () => {
      const menuRoutes = getMenuRoutes();
      assert.equal(
        menuRoutes.length,
        14,
        `Sidebar menu count must remain exactly 14, received ${menuRoutes.length}`
      );
    });

    it('verifies RoutePath.MONITOR is configured as the 14th menu route', () => {
      const menuRoutes = getMenuRoutes();
      const lastRoute = menuRoutes[menuRoutes.length - 1];
      assert.equal(lastRoute.path, RoutePath.MONITOR);
      assert.equal(lastRoute.title, '运维监控');
      assert.equal(lastRoute.category, '运维保障');
      assert.equal(lastRoute.permission, 'monitor:read');

      const route = findRouteByPath(RoutePath.MONITOR);
      assert.ok(route, 'Route metadata must exist for RoutePath.MONITOR');
    });
  });
});
