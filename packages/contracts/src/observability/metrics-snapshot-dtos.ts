/**
 * 集群节点健康与系统监控快照数据传输契约
 */

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
