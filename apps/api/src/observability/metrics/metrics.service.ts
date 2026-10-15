import { Injectable } from '@nestjs/common';
import {
  ClusterNodeHealth,
  ClusterNodeStatus,
  ClusterHealthSummary,
  CorePrometheusMetrics,
  MessageQueueStats,
  SystemResourceWatermark,
  SystemMetricsSnapshotDto,
} from '@car-control/contracts';
import {
  DEFAULT_HISTOGRAM_BUCKETS,
  IMetricsService,
} from './metrics.types.js';

interface CommandCounterItem {
  tenantId: string;
  commandCode: string;
  status: string;
  count: number;
}

interface HistogramItem {
  tenantId: string;
  commandCode: string;
  bucketCounts: Map<number, number>;
  sum: number;
  count: number;
}

interface TelemetryCounterItem {
  tenantId: string;
  productKey: string;
  count: number;
}

interface AlarmCounterItem {
  tenantId: string;
  alarmType: string;
  level: string;
  count: number;
}

interface LockContentionItem {
  tenantId: string;
  count: number;
}

function escapeLabel(val: string): string {
  return String(val)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

function formatNumber(num: number): string {
  if (Number.isInteger(num)) {
    return num.toString();
  }
  return parseFloat(num.toFixed(6)).toString();
}

function calculateHistogramPercentile(
  buckets: Array<{ le: number; count: number }>,
  percentile: number
): number {
  if (!buckets || buckets.length === 0) return 0;
  if (percentile <= 0) return 0;

  const sorted = [...buckets].sort((a, b) => a.le - b.le);
  const totalCount = sorted[sorted.length - 1]?.count ?? 0;
  if (totalCount === 0) return 0;

  const targetRank = Math.min(percentile, 1) * totalCount;
  if (targetRank <= 0) return 0;

  const bucketIndex = sorted.findIndex((b) => b.count >= targetRank);
  if (bucketIndex === -1) {
    const lastFinite = [...sorted].reverse().find((b) => Number.isFinite(b.le));
    return lastFinite ? lastFinite.le : 0;
  }

  const currentBucket = sorted[bucketIndex];
  const prevBucket =
    bucketIndex > 0 ? sorted[bucketIndex - 1] : { le: 0, count: 0 };

  if (!Number.isFinite(currentBucket.le)) {
    return prevBucket.le;
  }

  const countDiff = currentBucket.count - prevBucket.count;
  if (countDiff <= 0) {
    return currentBucket.le;
  }

  const rankDiff = targetRank - prevBucket.count;
  const fraction = rankDiff / countDiff;
  const interpolated =
    prevBucket.le + fraction * (currentBucket.le - prevBucket.le);

  return Number(interpolated.toFixed(4));
}

function calculateClusterHealthSummary(
  nodes: ClusterNodeHealth[]
): ClusterHealthSummary {
  const totalCount = nodes.length;
  if (totalCount === 0) {
    return {
      overallStatus: 'HEALTHY',
      nodes: [],
      healthyCount: 0,
      totalCount: 0,
      avgCpuPercent: 0,
      avgMemoryPercent: 0,
    };
  }

  const hasUnhealthy = nodes.some((n) => n.status === 'UNHEALTHY');
  const hasDegraded = nodes.some((n) => n.status === 'DEGRADED');
  const healthyCount = nodes.filter((n) => n.status === 'HEALTHY').length;

  const overallStatus: ClusterNodeStatus = hasUnhealthy
    ? 'UNHEALTHY'
    : hasDegraded
    ? 'DEGRADED'
    : 'HEALTHY';

  const sumCpu = nodes.reduce((sum, n) => sum + n.cpuUsagePercent, 0);
  const sumMem = nodes.reduce((sum, n) => sum + n.memoryUsagePercent, 0);

  return {
    overallStatus,
    nodes,
    healthyCount,
    totalCount,
    avgCpuPercent: Number((sumCpu / totalCount).toFixed(1)),
    avgMemoryPercent: Number((sumMem / totalCount).toFixed(1)),
  };
}

@Injectable()
export class MetricsService implements IMetricsService {
  private readonly buckets: readonly number[] = DEFAULT_HISTOGRAM_BUCKETS;

  private readonly commandCounters = new Map<string, CommandCounterItem>();
  private readonly commandHistograms = new Map<string, HistogramItem>();
  private readonly telemetryCounters = new Map<string, TelemetryCounterItem>();
  private readonly alarmCounters = new Map<string, AlarmCounterItem>();
  private readonly activeSimulators = new Map<string, number>();
  private readonly websocketConnections = new Map<string, number>();
  private readonly lockContentions = new Map<string, LockContentionItem>();

  incrementCommands(
    tenantId: string,
    commandCode: string,
    status: string,
    amount = 1
  ): void {
    const key = `${tenantId}\x00${commandCode}\x00${status}`;
    const existing = this.commandCounters.get(key);
    if (existing) {
      existing.count += amount;
    } else {
      this.commandCounters.set(key, {
        tenantId,
        commandCode,
        status,
        count: amount,
      });
    }
  }

  observeCommandDuration(
    tenantId: string,
    commandCode: string,
    durationSeconds: number
  ): void {
    const key = `${tenantId}\x00${commandCode}`;
    let item = this.commandHistograms.get(key);
    if (!item) {
      const bucketCounts = new Map<number, number>();
      for (const b of this.buckets) {
        bucketCounts.set(b, 0);
      }
      item = {
        tenantId,
        commandCode,
        bucketCounts,
        sum: 0,
        count: 0,
      };
      this.commandHistograms.set(key, item);
    }

    item.sum += durationSeconds;
    item.count += 1;

    for (const b of this.buckets) {
      if (durationSeconds <= b) {
        item.bucketCounts.set(b, (item.bucketCounts.get(b) ?? 0) + 1);
      }
    }
  }

  incrementTelemetryUplinks(
    tenantId: string,
    productKey: string,
    amount = 1
  ): void {
    const key = `${tenantId}\x00${productKey}`;
    const existing = this.telemetryCounters.get(key);
    if (existing) {
      existing.count += amount;
    } else {
      this.telemetryCounters.set(key, {
        tenantId,
        productKey,
        count: amount,
      });
    }
  }

  incrementAlarms(
    tenantId: string,
    alarmType: string,
    level: string,
    amount = 1
  ): void {
    const key = `${tenantId}\x00${alarmType}\x00${level}`;
    const existing = this.alarmCounters.get(key);
    if (existing) {
      existing.count += amount;
    } else {
      this.alarmCounters.set(key, {
        tenantId,
        alarmType,
        level,
        count: amount,
      });
    }
  }

  setActiveSimulators(count: number, onlineStatus: string): void {
    this.activeSimulators.set(onlineStatus, count);
  }

  setWebsocketConnections(tenantId: string, count: number): void {
    this.websocketConnections.set(tenantId, count);
  }

  incrementLockContention(tenantId: string, amount = 1): void {
    const existing = this.lockContentions.get(tenantId);
    if (existing) {
      existing.count += amount;
    } else {
      this.lockContentions.set(tenantId, {
        tenantId,
        count: amount,
      });
    }
  }

  reset(): void {
    this.commandCounters.clear();
    this.commandHistograms.clear();
    this.telemetryCounters.clear();
    this.alarmCounters.clear();
    this.activeSimulators.clear();
    this.websocketConnections.clear();
    this.lockContentions.clear();
  }

  getClusterNodes(): ClusterNodeHealth[] {
    return [
      {
        id: 'node-gateway-01',
        serviceName: 'api-gateway',
        role: 'GATEWAY',
        host: '10.0.1.10',
        port: 8080,
        status: 'HEALTHY',
        cpuUsagePercent: 28.5,
        memoryUsagePercent: 45.2,
        memoryUsedMb: 1850,
        memoryTotalMb: 4096,
        uptimeSeconds: 1234560,
        uptimeFormatted: '14d 6h 56m',
        restartCount: 0,
        lastHeartbeatTime: '2026-10-15 19:10:00',
        version: 'v2.4.1',
      },
      {
        id: 'node-core-01',
        serviceName: 'car-control-core',
        role: 'CORE_API',
        host: '10.0.1.11',
        port: 3000,
        status: 'HEALTHY',
        cpuUsagePercent: 42.1,
        memoryUsagePercent: 62.8,
        memoryUsedMb: 5145,
        memoryTotalMb: 8192,
        uptimeSeconds: 864200,
        uptimeFormatted: '10d 0h 3m',
        restartCount: 1,
        lastHeartbeatTime: '2026-10-15 19:10:00',
        version: 'v2.4.1',
      },
      {
        id: 'node-telemetry-01',
        serviceName: 'telemetry-processor',
        role: 'TELEMETRY',
        host: '10.0.1.12',
        port: 3001,
        status: 'HEALTHY',
        cpuUsagePercent: 55.4,
        memoryUsagePercent: 71.3,
        memoryUsedMb: 5840,
        memoryTotalMb: 8192,
        uptimeSeconds: 864200,
        uptimeFormatted: '10d 0h 3m',
        restartCount: 0,
        lastHeartbeatTime: '2026-10-15 19:10:00',
        version: 'v2.4.1',
      },
      {
        id: 'node-ota-01',
        serviceName: 'ota-scheduler',
        role: 'WORKER',
        host: '10.0.1.13',
        port: 3002,
        status: 'HEALTHY',
        cpuUsagePercent: 18.2,
        memoryUsagePercent: 34.6,
        memoryUsedMb: 1417,
        memoryTotalMb: 4096,
        uptimeSeconds: 1542000,
        uptimeFormatted: '17d 20h 20m',
        restartCount: 0,
        lastHeartbeatTime: '2026-10-15 19:10:00',
        version: 'v2.4.1',
      },
      {
        id: 'node-alarm-01',
        serviceName: 'alarm-dispatcher',
        role: 'WORKER',
        host: '10.0.1.14',
        port: 3003,
        status: 'HEALTHY',
        cpuUsagePercent: 22.7,
        memoryUsagePercent: 39.1,
        memoryUsedMb: 1601,
        memoryTotalMb: 4096,
        uptimeSeconds: 1542000,
        uptimeFormatted: '17d 20h 20m',
        restartCount: 0,
        lastHeartbeatTime: '2026-10-15 19:10:00',
        version: 'v2.4.1',
      },
      {
        id: 'node-emqx-01',
        serviceName: 'emqx-broker',
        role: 'BROKER',
        host: '10.0.2.20',
        port: 1883,
        status: 'HEALTHY',
        cpuUsagePercent: 38.6,
        memoryUsagePercent: 58.4,
        memoryUsedMb: 9568,
        memoryTotalMb: 16384,
        uptimeSeconds: 2592000,
        uptimeFormatted: '30d 0h 0m',
        restartCount: 0,
        lastHeartbeatTime: '2026-10-15 19:10:00',
        version: 'v5.8.0',
      },
      {
        id: 'node-redis-01',
        serviceName: 'redis-cluster',
        role: 'DATABASE',
        host: '10.0.3.30',
        port: 6379,
        status: 'HEALTHY',
        cpuUsagePercent: 15.3,
        memoryUsagePercent: 48.9,
        memoryUsedMb: 8012,
        memoryTotalMb: 16384,
        uptimeSeconds: 5184000,
        uptimeFormatted: '60d 0h 0m',
        restartCount: 0,
        lastHeartbeatTime: '2026-10-15 19:10:00',
        version: 'v7.2.4',
      },
      {
        id: 'node-postgres-01',
        serviceName: 'postgres-db',
        role: 'DATABASE',
        host: '10.0.3.40',
        port: 5432,
        status: 'HEALTHY',
        cpuUsagePercent: 32.8,
        memoryUsagePercent: 68.2,
        memoryUsedMb: 22340,
        memoryTotalMb: 32768,
        uptimeSeconds: 5184000,
        uptimeFormatted: '60d 0h 0m',
        restartCount: 0,
        lastHeartbeatTime: '2026-10-15 19:10:00',
        version: 'v16.2',
      },
    ];
  }

  getMetricsSnapshot(tenantId?: string): SystemMetricsSnapshotDto {
    const corePrometheus: CorePrometheusMetrics = {
      commandsTotal: 0,
      commandSuccessRate: 100,
      commandsByStatus: {},
      commandsByCode: {},
      commandDuration: {
        sum: 0,
        count: 0,
        avgSeconds: 0,
        p50Seconds: 0,
        p90Seconds: 0,
        p99Seconds: 0,
        buckets: [],
      },
      telemetryUplinksTotal: 0,
      telemetryUplinksByProductKey: {},
      telemetryUplinksByTenant: {},
      alarmsTotal: 0,
      alarmsByType: {},
      alarmsByLevel: {},
      activeSimulators: {
        online: 0,
        offline: 0,
        total: 0,
        onlineRate: 0,
      },
      websocketConnections: {
        total: 0,
        byTenant: {},
      },
      lockContentions: {
        total: 0,
        byTenant: {},
        contentionRatePerThousand: 0,
      },
    };

    // 1. car_commands_total
    let successCount = 0;
    for (const item of this.commandCounters.values()) {
      if (tenantId && item.tenantId !== tenantId) continue;
      corePrometheus.commandsTotal += item.count;
      corePrometheus.commandsByStatus[item.status] =
        (corePrometheus.commandsByStatus[item.status] || 0) + item.count;
      if (item.status === 'SUCCESS') {
        successCount += item.count;
      }
      corePrometheus.commandsByCode[item.commandCode] =
        (corePrometheus.commandsByCode[item.commandCode] || 0) + item.count;
    }

    corePrometheus.commandSuccessRate =
      corePrometheus.commandsTotal > 0
        ? Number(
            ((successCount / corePrometheus.commandsTotal) * 100).toFixed(2)
          )
        : 100;

    // 2. car_command_duration_seconds
    const bucketMap = new Map<number, number>();
    for (const item of this.commandHistograms.values()) {
      if (tenantId && item.tenantId !== tenantId) continue;
      corePrometheus.commandDuration.sum += item.sum;
      corePrometheus.commandDuration.count += item.count;
      for (const [b, c] of item.bucketCounts.entries()) {
        bucketMap.set(b, (bucketMap.get(b) || 0) + c);
      }
    }

    corePrometheus.commandDuration.avgSeconds =
      corePrometheus.commandDuration.count > 0
        ? Number(
            (
              corePrometheus.commandDuration.sum /
              corePrometheus.commandDuration.count
            ).toFixed(4)
          )
        : 0;

    const bucketsArray = Array.from(bucketMap.entries())
      .map(([le, count]) => ({ le, count }))
      .sort((a, b) => a.le - b.le);

    corePrometheus.commandDuration.buckets = bucketsArray;
    corePrometheus.commandDuration.p50Seconds = calculateHistogramPercentile(
      bucketsArray,
      0.5
    );
    corePrometheus.commandDuration.p90Seconds = calculateHistogramPercentile(
      bucketsArray,
      0.9
    );
    corePrometheus.commandDuration.p99Seconds = calculateHistogramPercentile(
      bucketsArray,
      0.99
    );

    // 3. car_telemetry_uplinks_total
    for (const item of this.telemetryCounters.values()) {
      if (tenantId && item.tenantId !== tenantId) continue;
      corePrometheus.telemetryUplinksTotal += item.count;
      corePrometheus.telemetryUplinksByProductKey[item.productKey] =
        (corePrometheus.telemetryUplinksByProductKey[item.productKey] || 0) +
        item.count;
      corePrometheus.telemetryUplinksByTenant[item.tenantId] =
        (corePrometheus.telemetryUplinksByTenant[item.tenantId] || 0) +
        item.count;
    }

    // 4. car_alarms_total
    for (const item of this.alarmCounters.values()) {
      if (tenantId && item.tenantId !== tenantId) continue;
      corePrometheus.alarmsTotal += item.count;
      corePrometheus.alarmsByType[item.alarmType] =
        (corePrometheus.alarmsByType[item.alarmType] || 0) + item.count;
      corePrometheus.alarmsByLevel[item.level] =
        (corePrometheus.alarmsByLevel[item.level] || 0) + item.count;
    }

    // 5. car_active_simulators
    const onlineSims = this.activeSimulators.get('online') ?? 0;
    const offlineSims = this.activeSimulators.get('offline') ?? 0;
    const totalSims = onlineSims + offlineSims;
    corePrometheus.activeSimulators = {
      online: onlineSims,
      offline: offlineSims,
      total: totalSims,
      onlineRate:
        totalSims > 0
          ? Number(((onlineSims / totalSims) * 100).toFixed(2))
          : 0,
    };

    // 6. car_websocket_connections
    for (const [tid, count] of this.websocketConnections.entries()) {
      if (tenantId && tid !== tenantId) continue;
      corePrometheus.websocketConnections.total += count;
      corePrometheus.websocketConnections.byTenant[tid] = count;
    }

    // 7. car_lock_contention_total
    for (const item of this.lockContentions.values()) {
      if (tenantId && item.tenantId !== tenantId) continue;
      corePrometheus.lockContentions.total += item.count;
      corePrometheus.lockContentions.byTenant[item.tenantId] = item.count;
    }

    corePrometheus.lockContentions.contentionRatePerThousand =
      corePrometheus.commandsTotal > 0
        ? Number(
            (
              (corePrometheus.lockContentions.total /
                corePrometheus.commandsTotal) *
              1000
            ).toFixed(2)
          )
        : 0;

    const nodes = this.getClusterNodes();
    const clusterHealth = calculateClusterHealthSummary(nodes);

    const messageQueue: MessageQueueStats = {
      brokerType: 'EMQX',
      msgInRateSec: 2840,
      msgOutRateSec: 2795,
      totalMessagesIn: 184529000,
      totalMessagesOut: 181200000,
      retainedMessages: 12450,
      consumerLagCount: 45,
      connectedClients: 12480,
    };

    const resources: SystemResourceWatermark = {
      cpuUsagePercent: 32.4,
      memoryUsagePercent: 54.8,
      memoryTotalGb: 128,
      memoryUsedGb: 70.1,
      diskUsagePercent: 41.2,
      diskTotalGb: 2048,
      diskUsedGb: 843.8,
      networkIngressMbps: 85.6,
      networkEgressMbps: 92.4,
    };

    return {
      timestamp: Date.now(),
      corePrometheus,
      clusterHealth,
      messageQueue,
      resources,
      rawPrometheusText: this.exportPrometheusMetrics(),
    };
  }

  exportPrometheusMetrics(): string {
    const sections: string[] = [];

    // 1. car_commands_total
    {
      const lines: string[] = [
        '# HELP car_commands_total Total number of car control commands processed',
        '# TYPE car_commands_total counter',
      ];
      for (const item of this.commandCounters.values()) {
        lines.push(
          `car_commands_total{tenant_id="${escapeLabel(item.tenantId)}",command_code="${escapeLabel(item.commandCode)}",status="${escapeLabel(item.status)}"} ${item.count}`
        );
      }
      sections.push(lines.join('\n'));
    }

    // 2. car_command_duration_seconds
    {
      const lines: string[] = [
        '# HELP car_command_duration_seconds End-to-end command execution latency in seconds',
        '# TYPE car_command_duration_seconds histogram',
      ];
      for (const item of this.commandHistograms.values()) {
        const tenantEscaped = escapeLabel(item.tenantId);
        const codeEscaped = escapeLabel(item.commandCode);

        for (const b of this.buckets) {
          const bucketCount = item.bucketCounts.get(b) ?? 0;
          lines.push(
            `car_command_duration_seconds_bucket{tenant_id="${tenantEscaped}",command_code="${codeEscaped}",le="${String(b)}"} ${bucketCount}`
          );
        }
        lines.push(
          `car_command_duration_seconds_bucket{tenant_id="${tenantEscaped}",command_code="${codeEscaped}",le="+Inf"} ${item.count}`
        );
        lines.push(
          `car_command_duration_seconds_sum{tenant_id="${tenantEscaped}",command_code="${codeEscaped}"} ${formatNumber(item.sum)}`
        );
        lines.push(
          `car_command_duration_seconds_count{tenant_id="${tenantEscaped}",command_code="${codeEscaped}"} ${item.count}`
        );
      }
      sections.push(lines.join('\n'));
    }

    // 3. car_telemetry_uplinks_total
    {
      const lines: string[] = [
        '# HELP car_telemetry_uplinks_total Total count of GPS and telemetry packets ingested',
        '# TYPE car_telemetry_uplinks_total counter',
      ];
      for (const item of this.telemetryCounters.values()) {
        lines.push(
          `car_telemetry_uplinks_total{tenant_id="${escapeLabel(item.tenantId)}",product_key="${escapeLabel(item.productKey)}"} ${item.count}`
        );
      }
      sections.push(lines.join('\n'));
    }

    // 4. car_alarms_total
    {
      const lines: string[] = [
        '# HELP car_alarms_total Total count of trigger alarms',
        '# TYPE car_alarms_total counter',
      ];
      for (const item of this.alarmCounters.values()) {
        lines.push(
          `car_alarms_total{tenant_id="${escapeLabel(item.tenantId)}",alarm_type="${escapeLabel(item.alarmType)}",level="${escapeLabel(item.level)}"} ${item.count}`
        );
      }
      sections.push(lines.join('\n'));
    }

    // 5. car_active_simulators
    {
      const lines: string[] = [
        '# HELP car_active_simulators Number of currently active simulators',
        '# TYPE car_active_simulators gauge',
      ];
      for (const [onlineStatus, count] of this.activeSimulators.entries()) {
        lines.push(
          `car_active_simulators{online_status="${escapeLabel(onlineStatus)}"} ${count}`
        );
      }
      sections.push(lines.join('\n'));
    }

    // 6. car_websocket_connections
    {
      const lines: string[] = [
        '# HELP car_websocket_connections Number of active WebSocket connections',
        '# TYPE car_websocket_connections gauge',
      ];
      for (const [tenantId, count] of this.websocketConnections.entries()) {
        lines.push(
          `car_websocket_connections{tenant_id="${escapeLabel(tenantId)}"} ${count}`
        );
      }
      sections.push(lines.join('\n'));
    }

    // 7. car_lock_contention_total
    {
      const lines: string[] = [
        '# HELP car_lock_contention_total Total count of distributed command lock contentions',
        '# TYPE car_lock_contention_total counter',
      ];
      for (const item of this.lockContentions.values()) {
        lines.push(
          `car_lock_contention_total{tenant_id="${escapeLabel(item.tenantId)}"} ${item.count}`
        );
      }
      sections.push(lines.join('\n'));
    }

    return sections.join('\n\n') + '\n';
  }
}
