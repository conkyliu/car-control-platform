export const DEFAULT_HISTOGRAM_BUCKETS: readonly number[] = [
  0.05, 0.1, 0.25, 0.5, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0,
];

export interface IMetricsService {
  incrementCommands(tenantId: string, commandCode: string, status: string): void;
  observeCommandDuration(tenantId: string, commandCode: string, durationSeconds: number): void;
  incrementTelemetryUplinks(tenantId: string, productKey: string): void;
  incrementAlarms(tenantId: string, alarmType: string, level: string): void;
  setActiveSimulators(count: number, onlineStatus: string): void;
  setWebsocketConnections(tenantId: string, count: number): void;
  incrementLockContention(tenantId: string): void;
  exportPrometheusMetrics(): string;
}

export type MetricsService = IMetricsService;

export interface CommandMetricKey {
  tenantId: string;
  commandCode: string;
  status: string;
}

export interface TelemetryMetricKey {
  tenantId: string;
  productKey: string;
}

export interface AlarmMetricKey {
  tenantId: string;
  alarmType: string;
  level: string;
}

export interface HistogramSeriesData {
  bucketCounts: Map<number, number>;
  sum: number;
  count: number;
}
