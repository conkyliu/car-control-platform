import { ApiError } from '../../api/client.ts';

export type PrometheusMetricType = 'counter' | 'gauge' | 'histogram' | 'summary' | 'untyped';

export interface PrometheusSample {
  name: string;
  labels: Record<string, string>;
  value: number;
}

export interface PrometheusParsedMetric {
  name: string;
  help: string;
  type: PrometheusMetricType;
  samples: PrometheusSample[];
}

export interface CommandDurationStats {
  sum: number;
  count: number;
  avgSeconds: number;
  p50Seconds: number;
  p90Seconds: number;
  p99Seconds: number;
  buckets: Array<{ le: number; count: number }>;
}

export interface ActiveSimulatorsStats {
  online: number;
  offline: number;
  total: number;
  onlineRate: number;
}

export interface WebsocketConnectionsStats {
  total: number;
  byTenant: Record<string, number>;
}

export interface LockContentionsStats {
  total: number;
  byTenant: Record<string, number>;
  contentionRatePerThousand: number;
}

export interface CorePrometheusMetrics {
  commandsTotal: number;
  commandSuccessRate: number;
  commandsByStatus: Record<string, number>;
  commandsByCode: Record<string, number>;
  commandDuration: CommandDurationStats;
  telemetryUplinksTotal: number;
  telemetryUplinksByProductKey: Record<string, number>;
  telemetryUplinksByTenant: Record<string, number>;
  alarmsTotal: number;
  alarmsByType: Record<string, number>;
  alarmsByLevel: Record<string, number>;
  activeSimulators: ActiveSimulatorsStats;
  websocketConnections: WebsocketConnectionsStats;
  lockContentions: LockContentionsStats;
}

export type ClusterServiceRole =
  | 'GATEWAY'
  | 'CORE_API'
  | 'TELEMETRY'
  | 'WORKER'
  | 'DATABASE'
  | 'BROKER';

export type ClusterNodeStatus = 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';

export interface ClusterNodeHealth {
  id: string;
  serviceName: string;
  role: ClusterServiceRole;
  host: string;
  port: number;
  status: ClusterNodeStatus;
  cpuUsagePercent: number;
  memoryUsagePercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  uptimeSeconds: number;
  uptimeFormatted: string;
  restartCount: number;
  lastHeartbeatTime: string;
  version: string;
}

export interface ClusterHealthSummary {
  overallStatus: ClusterNodeStatus;
  nodes: ClusterNodeHealth[];
  healthyCount: number;
  totalCount: number;
  avgCpuPercent: number;
  avgMemoryPercent: number;
}

export interface MessageQueueStats {
  brokerType: 'EMQX' | 'KAFKA';
  msgInRateSec: number;
  msgOutRateSec: number;
  totalMessagesIn: number;
  totalMessagesOut: number;
  retainedMessages: number;
  consumerLagCount: number;
  connectedClients: number;
}

export interface SystemResourceWatermark {
  cpuUsagePercent: number;
  memoryUsagePercent: number;
  memoryTotalGb: number;
  memoryUsedGb: number;
  diskUsagePercent: number;
  diskTotalGb: number;
  diskUsedGb: number;
  networkIngressMbps: number;
  networkEgressMbps: number;
}

export interface SystemMetricsSnapshotDto {
  timestamp: number;
  corePrometheus: CorePrometheusMetrics;
  clusterHealth: ClusterHealthSummary;
  messageQueue: MessageQueueStats;
  resources: SystemResourceWatermark;
  rawPrometheusText: string;
}

/**
 * 判断捕获的异常是否为 ApiError 实例
 */
export function isApiError(err: unknown): err is ApiError {
  if (err instanceof ApiError) return true;
  if (typeof err === 'object' && err !== null) {
    const candidate = err as Record<string, unknown>;
    return (
      typeof candidate.statusCode === 'number' &&
      candidate.name === 'ApiError' &&
      typeof candidate.message === 'string'
    );
  }
  return false;
}

/**
 * 人性化格式化运行持续时长
 */
export function formatUptime(seconds: number): string {
  if (seconds <= 0) return '0s';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

/**
 * 格式化二进制字节容量
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  if (i <= 0) {
    return `${bytes.toFixed(1)} B`;
  }
  const val = bytes / Math.pow(k, i);
  return `${val.toFixed(1)} ${units[i]}`;
}

/**
 * 解析 Prometheus 原始输出文本
 */
export function parsePrometheusText(rawText: string): PrometheusParsedMetric[] {
  if (!rawText || !rawText.trim()) {
    return [];
  }

  const lines = rawText.split(/\r?\n/);
  const metricFamilies = new Map<string, PrometheusParsedMetric>();

  // 保证家族遍历顺序
  const getOrCreateFamily = (
    name: string,
    initialType: PrometheusMetricType = 'untyped'
  ): PrometheusParsedMetric => {
    let family = metricFamilies.get(name);
    if (!family) {
      family = {
        name,
        help: '',
        type: initialType,
        samples: [],
      };
      metricFamilies.set(name, family);
    }
    return family;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // 解析 HELP
    if (line.startsWith('# HELP ')) {
      const parts = line.slice(7).trim().split(/\s+/);
      const metricName = parts[0];
      const helpText = line.slice(7).trim().slice(metricName.length).trim();
      const family = getOrCreateFamily(metricName);
      family.help = helpText;
      continue;
    }

    // 解析 TYPE
    if (line.startsWith('# TYPE ')) {
      const parts = line.slice(7).trim().split(/\s+/);
      const metricName = parts[0];
      const typeStr = (parts[1] || 'untyped').toLowerCase() as PrometheusMetricType;
      const family = getOrCreateFamily(metricName, typeStr);
      family.type = typeStr;
      continue;
    }

    // 其他注释行忽略
    if (line.startsWith('#')) {
      continue;
    }

    // 解析 Sample 行
    // 样本名称匹配
    const nameMatch = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)/);
    if (!nameMatch) continue;

    const sampleName = nameMatch[1];
    let remaining = line.slice(sampleName.length).trim();
    const labels: Record<string, string> = {};

    // 检查是否存在标签组 { ... }
    if (remaining.startsWith('{')) {
      // 寻找匹配的闭合括号（需处理引号内部的括号转义）
      let closingIndex = -1;
      let inQuote = false;
      let escape = false;

      for (let i = 0; i < remaining.length; i++) {
        const char = remaining[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (char === '\\') {
          escape = true;
          continue;
        }
        if (char === '"') {
          inQuote = !inQuote;
          continue;
        }
        if (char === '}' && !inQuote) {
          closingIndex = i;
          break;
        }
      }

      if (closingIndex !== -1) {
        const labelContent = remaining.slice(1, closingIndex);
        remaining = remaining.slice(closingIndex + 1).trim();

        // 正则提取所有 label_key="label_val"
        const labelRegex = /([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*"((?:\\.|[^"\\])*)"/g;
        let match: RegExpExecArray | null;
        while ((match = labelRegex.exec(labelContent)) !== null) {
          const key = match[1];
          const rawVal = match[2];
          const unescapedVal = rawVal
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\')
            .replace(/\\n/g, '\n');
          labels[key] = unescapedVal;
        }
      }
    }

    // 解析 value
    const valueMatch = remaining.match(/^([^\s]+)/);
    if (!valueMatch) continue;

    const valStr = valueMatch[1];
    let numValue: number;
    if (valStr === '+Inf' || valStr === 'Inf') {
      numValue = Infinity;
    } else if (valStr === '-Inf') {
      numValue = -Infinity;
    } else if (valStr === 'NaN') {
      numValue = NaN;
    } else {
      numValue = parseFloat(valStr);
    }

    // 确定归属的 metric family
    let targetFamilyName = sampleName;
    if (metricFamilies.has(sampleName)) {
      targetFamilyName = sampleName;
    } else {
      // 检查直方图与摘要后缀
      const baseName = sampleName.replace(/(_bucket|_sum|_count|_total)$/, '');
      if (metricFamilies.has(baseName)) {
        targetFamilyName = baseName;
      }
    }

    const family = getOrCreateFamily(targetFamilyName);
    family.samples.push({
      name: sampleName,
      labels,
      value: numValue,
    });
  }

  return Array.from(metricFamilies.values());
}

/**
 * 线性内插直方图分位数估算算法 (Prometheus histogram_quantile)
 */
export function calculateHistogramPercentile(
  buckets: Array<{ le: number; count: number }>,
  percentile: number
): number {
  if (!buckets || buckets.length === 0) return 0;
  if (percentile <= 0) return 0;

  // 确保按 le 升序排序
  const sorted = [...buckets].sort((a, b) => a.le - b.le);
  const totalCount = sorted[sorted.length - 1]?.count ?? 0;
  if (totalCount === 0) return 0;

  const targetRank = Math.min(percentile, 1) * totalCount;
  if (targetRank <= 0) return 0;

  // 寻找首个 count >= targetRank 的桶
  const bucketIndex = sorted.findIndex((b) => b.count >= targetRank);
  if (bucketIndex === -1) {
    const lastFinite = [...sorted].reverse().find((b) => Number.isFinite(b.le));
    return lastFinite ? lastFinite.le : 0;
  }

  const currentBucket = sorted[bucketIndex];
  const prevBucket = bucketIndex > 0 ? sorted[bucketIndex - 1] : { le: 0, count: 0 };

  if (!Number.isFinite(currentBucket.le)) {
    return prevBucket.le;
  }

  const countDiff = currentBucket.count - prevBucket.count;
  if (countDiff <= 0) {
    return currentBucket.le;
  }

  const rankDiff = targetRank - prevBucket.count;
  const fraction = rankDiff / countDiff;
  const interpolated = prevBucket.le + fraction * (currentBucket.le - prevBucket.le);

  return Number(interpolated.toFixed(4));
}

/**
 * 聚合提取 7 大后端核心监控指标
 */
export function extractCorePrometheusMetrics(
  parsed: PrometheusParsedMetric[],
  filterTenantId?: string
): CorePrometheusMetrics {
  const result: CorePrometheusMetrics = {
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

  // 辅助扁平样本查找器
  const allSamples: PrometheusSample[] = [];
  for (const metric of parsed) {
    for (const sample of metric.samples) {
      allSamples.push(sample);
    }
  }

  // 1. car_commands_total
  const commandSamples = allSamples.filter(
    (s) =>
      s.name === 'car_commands_total' &&
      (!filterTenantId || s.labels.tenant_id === filterTenantId)
  );

  let successCount = 0;
  for (const s of commandSamples) {
    result.commandsTotal += s.value;
    const status = s.labels.status || 'UNKNOWN';
    result.commandsByStatus[status] = (result.commandsByStatus[status] || 0) + s.value;
    if (status === 'SUCCESS') {
      successCount += s.value;
    }

    const code = s.labels.command_code || 'UNKNOWN';
    result.commandsByCode[code] = (result.commandsByCode[code] || 0) + s.value;
  }

  result.commandSuccessRate =
    result.commandsTotal > 0
      ? Number(((successCount / result.commandsTotal) * 100).toFixed(2))
      : 100;

  // 2. car_command_duration_seconds
  const durationSamples = allSamples.filter(
    (s) =>
      s.name.startsWith('car_command_duration_seconds') &&
      (!filterTenantId || s.labels.tenant_id === filterTenantId)
  );

  const bucketMap = new Map<number, number>();
  for (const s of durationSamples) {
    if (s.name.endsWith('_sum')) {
      result.commandDuration.sum += s.value;
    } else if (s.name.endsWith('_count')) {
      result.commandDuration.count += s.value;
    } else if (s.name.endsWith('_bucket')) {
      const leStr = s.labels.le;
      const leVal = leStr === '+Inf' || leStr === 'Inf' ? Infinity : parseFloat(leStr);
      if (!Number.isNaN(leVal)) {
        bucketMap.set(leVal, (bucketMap.get(leVal) || 0) + s.value);
      }
    }
  }

  result.commandDuration.avgSeconds =
    result.commandDuration.count > 0
      ? Number((result.commandDuration.sum / result.commandDuration.count).toFixed(4))
      : 0;

  const bucketsArray = Array.from(bucketMap.entries())
    .map(([le, count]) => ({ le, count }))
    .sort((a, b) => a.le - b.le);

  result.commandDuration.buckets = bucketsArray;
  result.commandDuration.p50Seconds = calculateHistogramPercentile(bucketsArray, 0.5);
  result.commandDuration.p90Seconds = calculateHistogramPercentile(bucketsArray, 0.9);
  result.commandDuration.p99Seconds = calculateHistogramPercentile(bucketsArray, 0.99);

  // 3. car_telemetry_uplinks_total
  const telemetrySamples = allSamples.filter(
    (s) =>
      s.name === 'car_telemetry_uplinks_total' &&
      (!filterTenantId || s.labels.tenant_id === filterTenantId)
  );
  for (const s of telemetrySamples) {
    result.telemetryUplinksTotal += s.value;
    const pk = s.labels.product_key || 'UNKNOWN';
    result.telemetryUplinksByProductKey[pk] =
      (result.telemetryUplinksByProductKey[pk] || 0) + s.value;

    const tid = s.labels.tenant_id || 'UNKNOWN';
    result.telemetryUplinksByTenant[tid] =
      (result.telemetryUplinksByTenant[tid] || 0) + s.value;
  }

  // 4. car_alarms_total
  const alarmSamples = allSamples.filter(
    (s) =>
      s.name === 'car_alarms_total' &&
      (!filterTenantId || s.labels.tenant_id === filterTenantId)
  );
  for (const s of alarmSamples) {
    result.alarmsTotal += s.value;
    const at = s.labels.alarm_type || 'UNKNOWN';
    result.alarmsByType[at] = (result.alarmsByType[at] || 0) + s.value;

    const lvl = s.labels.level || 'UNKNOWN';
    result.alarmsByLevel[lvl] = (result.alarmsByLevel[lvl] || 0) + s.value;
  }

  // 5. car_active_simulators
  const simulatorSamples = allSamples.filter((s) => s.name === 'car_active_simulators');
  for (const s of simulatorSamples) {
    const status = (s.labels.online_status || '').toLowerCase();
    if (status === 'online') {
      result.activeSimulators.online += s.value;
    } else if (status === 'offline') {
      result.activeSimulators.offline += s.value;
    }
  }
  result.activeSimulators.total =
    result.activeSimulators.online + result.activeSimulators.offline;
  result.activeSimulators.onlineRate =
    result.activeSimulators.total > 0
      ? Number(
          (
            (result.activeSimulators.online / result.activeSimulators.total) *
            100
          ).toFixed(2)
        )
      : 0;

  // 6. car_websocket_connections
  const wsSamples = allSamples.filter(
    (s) =>
      s.name === 'car_websocket_connections' &&
      (!filterTenantId || s.labels.tenant_id === filterTenantId)
  );
  for (const s of wsSamples) {
    result.websocketConnections.total += s.value;
    const tid = s.labels.tenant_id || 'UNKNOWN';
    result.websocketConnections.byTenant[tid] =
      (result.websocketConnections.byTenant[tid] || 0) + s.value;
  }

  // 7. car_lock_contention_total
  const lockSamples = allSamples.filter(
    (s) =>
      s.name === 'car_lock_contention_total' &&
      (!filterTenantId || s.labels.tenant_id === filterTenantId)
  );
  for (const s of lockSamples) {
    result.lockContentions.total += s.value;
    const tid = s.labels.tenant_id || 'UNKNOWN';
    result.lockContentions.byTenant[tid] =
      (result.lockContentions.byTenant[tid] || 0) + s.value;
  }

  result.lockContentions.contentionRatePerThousand =
    result.commandsTotal > 0
      ? Number(((result.lockContentions.total / result.commandsTotal) * 1000).toFixed(2))
      : 0;

  return result;
}

/**
 * 汇总集群健康度与节点资源水位
 */
export function calculateClusterHealthSummary(
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

/**
 * 生成包含 7 大核心指标的合规 Prometheus 格式样本数据
 */
export function generateMockPrometheusText(
  overrides?: Partial<CorePrometheusMetrics>
): string {
  const sections: string[] = [];

  // 1. car_commands_total
  sections.push([
    '# HELP car_commands_total Total number of car control commands processed',
    '# TYPE car_commands_total counter',
    `car_commands_total{tenant_id="tenant-alpha",command_code="UNLOCK_DOORS",status="SUCCESS"} ${overrides?.commandsTotal ? Math.round(overrides.commandsTotal * 0.45) : 3840}`,
    `car_commands_total{tenant_id="tenant-alpha",command_code="LOCK_DOORS",status="SUCCESS"} 3210`,
    `car_commands_total{tenant_id="tenant-alpha",command_code="ENGINE_START",status="SUCCESS"} 1520`,
    `car_commands_total{tenant_id="tenant-alpha",command_code="ENGINE_START",status="FAILED"} 45`,
    `car_commands_total{tenant_id="tenant-alpha",command_code="UNLOCK_DOORS",status="TIMEOUT"} 18`,
    `car_commands_total{tenant_id="tenant-alpha",command_code="LOCK_DOORS",status="CONFLICT"} 12`,
    `car_commands_total{tenant_id="tenant-beta",command_code="UNLOCK_DOORS",status="SUCCESS"} 2890`,
    `car_commands_total{tenant_id="tenant-beta",command_code="LOCK_DOORS",status="SUCCESS"} 2450`,
    `car_commands_total{tenant_id="tenant-beta",command_code="WINDOWS_CONTROL",status="SUCCESS"} 860`,
    `car_commands_total{tenant_id="tenant-beta",command_code="AIR_CONDITIONER",status="SUCCESS"} 740`,
    `car_commands_total{tenant_id="tenant-beta",command_code="AIR_CONDITIONER",status="FAILED"} 32`,
    `car_commands_total{tenant_id="tenant-gamma",command_code="UNLOCK_DOORS",status="SUCCESS"} 1450`,
    `car_commands_total{tenant_id="tenant-gamma",command_code="LOCK_DOORS",status="SUCCESS"} 1320`,
    `car_commands_total{tenant_id="tenant-gamma",command_code="ENGINE_START",status="FAILED"} 15`,
  ].join('\n'));

  // 2. car_command_duration_seconds
  sections.push([
    '# HELP car_command_duration_seconds End-to-end command execution latency in seconds',
    '# TYPE car_command_duration_seconds histogram',
    'car_command_duration_seconds_bucket{tenant_id="tenant-alpha",command_code="ALL",le="0.05"} 1850',
    'car_command_duration_seconds_bucket{tenant_id="tenant-alpha",command_code="ALL",le="0.1"} 4280',
    'car_command_duration_seconds_bucket{tenant_id="tenant-alpha",command_code="ALL",le="0.25"} 6720',
    'car_command_duration_seconds_bucket{tenant_id="tenant-alpha",command_code="ALL",le="0.5"} 7890',
    'car_command_duration_seconds_bucket{tenant_id="tenant-alpha",command_code="ALL",le="1"} 8420',
    'car_command_duration_seconds_bucket{tenant_id="tenant-alpha",command_code="ALL",le="1.5"} 8580',
    'car_command_duration_seconds_bucket{tenant_id="tenant-alpha",command_code="ALL",le="2"} 8615',
    'car_command_duration_seconds_bucket{tenant_id="tenant-alpha",command_code="ALL",le="3"} 8632',
    'car_command_duration_seconds_bucket{tenant_id="tenant-alpha",command_code="ALL",le="5"} 8641',
    'car_command_duration_seconds_bucket{tenant_id="tenant-alpha",command_code="ALL",le="10"} 8645',
    'car_command_duration_seconds_bucket{tenant_id="tenant-alpha",command_code="ALL",le="+Inf"} 8645',
    'car_command_duration_seconds_sum{tenant_id="tenant-alpha",command_code="ALL"} 1642.55',
    'car_command_duration_seconds_count{tenant_id="tenant-alpha",command_code="ALL"} 8645',
    'car_command_duration_seconds_bucket{tenant_id="tenant-beta",command_code="ALL",le="0.05"} 1240',
    'car_command_duration_seconds_bucket{tenant_id="tenant-beta",command_code="ALL",le="0.1"} 3150',
    'car_command_duration_seconds_bucket{tenant_id="tenant-beta",command_code="ALL",le="0.25"} 5320',
    'car_command_duration_seconds_bucket{tenant_id="tenant-beta",command_code="ALL",le="0.5"} 6540',
    'car_command_duration_seconds_bucket{tenant_id="tenant-beta",command_code="ALL",le="1"} 6890',
    'car_command_duration_seconds_bucket{tenant_id="tenant-beta",command_code="ALL",le="1.5"} 6942',
    'car_command_duration_seconds_bucket{tenant_id="tenant-beta",command_code="ALL",le="2"} 6960',
    'car_command_duration_seconds_bucket{tenant_id="tenant-beta",command_code="ALL",le="3"} 6968',
    'car_command_duration_seconds_bucket{tenant_id="tenant-beta",command_code="ALL",le="5"} 6971',
    'car_command_duration_seconds_bucket{tenant_id="tenant-beta",command_code="ALL",le="10"} 6972',
    'car_command_duration_seconds_bucket{tenant_id="tenant-beta",command_code="ALL",le="+Inf"} 6972',
    'car_command_duration_seconds_sum{tenant_id="tenant-beta",command_code="ALL"} 1285.34',
    'car_command_duration_seconds_count{tenant_id="tenant-beta",command_code="ALL"} 6972',
  ].join('\n'));

  // 3. car_telemetry_uplinks_total
  sections.push([
    '# HELP car_telemetry_uplinks_total Total count of GPS and telemetry packets ingested',
    '# TYPE car_telemetry_uplinks_total counter',
    'car_telemetry_uplinks_total{tenant_id="tenant-alpha",product_key="PK_4G_TBOX_PRO"} 10850230',
    'car_telemetry_uplinks_total{tenant_id="tenant-alpha",product_key="PK_5G_SMART_COCKPIT"} 4280120',
    'car_telemetry_uplinks_total{tenant_id="tenant-beta",product_key="PK_4G_TBOX_PRO"} 7642100',
    'car_telemetry_uplinks_total{tenant_id="tenant-gamma",product_key="PK_4G_OBD_BASIC"} 3140500',
  ].join('\n'));

  // 4. car_alarms_total
  sections.push([
    '# HELP car_alarms_total Total count of trigger alarms',
    '# TYPE car_alarms_total counter',
    'car_alarms_total{tenant_id="tenant-alpha",alarm_type="LOW_BATTERY",level="HIGH"} 48',
    'car_alarms_total{tenant_id="tenant-alpha",alarm_type="GEOFENCE_OUT",level="MEDIUM"} 82',
    'car_alarms_total{tenant_id="tenant-alpha",alarm_type="VIBRATION_WARN",level="LOW"} 135',
    'car_alarms_total{tenant_id="tenant-alpha",alarm_type="CRASH_IMPACT",level="CRITICAL"} 3',
    'car_alarms_total{tenant_id="tenant-beta",alarm_type="LOW_BATTERY",level="HIGH"} 32',
    'car_alarms_total{tenant_id="tenant-beta",alarm_type="GEOFENCE_IN",level="LOW"} 54',
  ].join('\n'));

  // 5. car_active_simulators
  sections.push([
    '# HELP car_active_simulators Number of currently active simulators',
    '# TYPE car_active_simulators gauge',
    'car_active_simulators{online_status="online"} 485',
    'car_active_simulators{online_status="offline"} 25',
  ].join('\n'));

  // 6. car_websocket_connections
  sections.push([
    '# HELP car_websocket_connections Number of active WebSocket connections',
    '# TYPE car_websocket_connections gauge',
    'car_websocket_connections{tenant_id="tenant-alpha"} 680',
    'car_websocket_connections{tenant_id="tenant-beta"} 420',
    'car_websocket_connections{tenant_id="tenant-gamma"} 180',
  ].join('\n'));

  // 7. car_lock_contention_total
  sections.push([
    '# HELP car_lock_contention_total Total count of distributed command lock contentions',
    '# TYPE car_lock_contention_total counter',
    'car_lock_contention_total{tenant_id="tenant-alpha"} 16',
    'car_lock_contention_total{tenant_id="tenant-beta"} 9',
    'car_lock_contention_total{tenant_id="tenant-gamma"} 4',
  ].join('\n'));

  return sections.join('\n\n') + '\n';
}

export const SEED_PROMETHEUS_RAW_TEXT = generateMockPrometheusText();

export const SEED_CLUSTER_NODES: ClusterNodeHealth[] = [
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

export const SEED_SYSTEM_METRICS_SNAPSHOT: SystemMetricsSnapshotDto = {
  timestamp: Date.now(),
  corePrometheus: extractCorePrometheusMetrics(parsePrometheusText(SEED_PROMETHEUS_RAW_TEXT)),
  clusterHealth: calculateClusterHealthSummary(SEED_CLUSTER_NODES),
  messageQueue: {
    brokerType: 'EMQX',
    msgInRateSec: 2840,
    msgOutRateSec: 2795,
    totalMessagesIn: 184529000,
    totalMessagesOut: 181200000,
    retainedMessages: 12450,
    consumerLagCount: 45,
    connectedClients: 12480,
  },
  resources: {
    cpuUsagePercent: 32.4,
    memoryUsagePercent: 54.8,
    memoryTotalGb: 128,
    memoryUsedGb: 70.1,
    diskUsagePercent: 41.2,
    diskTotalGb: 2048,
    diskUsedGb: 843.8,
    networkIngressMbps: 85.6,
    networkEgressMbps: 92.4,
  },
  rawPrometheusText: SEED_PROMETHEUS_RAW_TEXT,
};
