import { http } from './client.ts';
import {
  type SystemMetricsSnapshotDto,
  type ClusterNodeHealth,
  parsePrometheusText,
  extractCorePrometheusMetrics,
  calculateClusterHealthSummary,
  SEED_PROMETHEUS_RAW_TEXT,
  SEED_CLUSTER_NODES,
  SEED_SYSTEM_METRICS_SNAPSHOT,
  isApiError,
} from '../views/monitor/metrics-core.ts';

/**
 * 内部内存状态池 (用于离线降级、研发调试与自动化单元测试)
 */
let inMemoryPrometheusText: string = SEED_PROMETHEUS_RAW_TEXT;
let inMemoryClusterNodes: ClusterNodeHealth[] = JSON.parse(
  JSON.stringify(SEED_CLUSTER_NODES)
);

export function getInMemoryPrometheusText(): string {
  return inMemoryPrometheusText;
}

export function setInMemoryPrometheusText(text: string): void {
  inMemoryPrometheusText = text;
}

export function resetInMemoryPrometheusText(): void {
  inMemoryPrometheusText = SEED_PROMETHEUS_RAW_TEXT;
}

export function getInMemoryClusterNodes(): ClusterNodeHealth[] {
  return JSON.parse(JSON.stringify(inMemoryClusterNodes));
}

export function setInMemoryClusterNodes(nodes: ClusterNodeHealth[]): void {
  inMemoryClusterNodes = JSON.parse(JSON.stringify(nodes));
}

export function resetInMemoryClusterNodes(): void {
  inMemoryClusterNodes = JSON.parse(JSON.stringify(SEED_CLUSTER_NODES));
}

/**
 * 获取 Prometheus 纯文本报文 (/metrics)
 */
export async function fetchRawPrometheusMetricsApi(): Promise<string> {
  try {
    const response = await http.get<any>('/metrics');
    if (typeof response === 'string' && response.trim().length > 0) {
      return response;
    }
    if (response && typeof response.message === 'string' && response.message.trim().length > 0) {
      return response.message;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
    // 离线开发与降级兜底
  }
  return inMemoryPrometheusText;
}

/**
 * 获取集群 8 大微服务及中间件节点健康度
 */
export async function fetchClusterNodesApi(): Promise<ClusterNodeHealth[]> {
  try {
    const remoteNodes = await http.get<ClusterNodeHealth[]>('/metrics/cluster-nodes');
    if (Array.isArray(remoteNodes) && remoteNodes.length > 0) {
      return remoteNodes;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
    // 离线降级
  }
  return getInMemoryClusterNodes();
}

/**
 * 获取系统监控大屏综合快照（支持按租户隔离统计）
 */
export async function fetchSystemMetricsSnapshotApi(
  tenantId?: string
): Promise<SystemMetricsSnapshotDto> {
  try {
    const remoteSnapshot = await http.get<SystemMetricsSnapshotDto>(
      '/metrics/snapshot',
      tenantId ? { tenantId } : undefined
    );
    if (
      remoteSnapshot &&
      remoteSnapshot.corePrometheus &&
      remoteSnapshot.clusterHealth
    ) {
      return remoteSnapshot;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
    // 离线降级
  }

  // 离线降级：从内存文本中实时提取和计算
  const rawText = inMemoryPrometheusText;
  const parsed = parsePrometheusText(rawText);
  const coreMetrics = extractCorePrometheusMetrics(parsed, tenantId);
  const clusterNodes = getInMemoryClusterNodes();
  const clusterHealth = calculateClusterHealthSummary(clusterNodes);

  return {
    timestamp: Date.now(),
    corePrometheus: coreMetrics,
    clusterHealth,
    messageQueue: JSON.parse(JSON.stringify(SEED_SYSTEM_METRICS_SNAPSHOT.messageQueue)),
    resources: JSON.parse(JSON.stringify(SEED_SYSTEM_METRICS_SNAPSHOT.resources)),
    rawPrometheusText: rawText,
  };
}

/**
 * 订阅系统监控实时数据流 (轮询 + 离线自驱动更新)
 *
 * @param callback 接收实时快照的回调函数
 * @param intervalMs 轮询刷新周期（毫秒，默认 5000ms）
 * @returns 销毁订阅的清理函数 (确保无内存泄漏)
 */
export function subscribeRealtimeMetrics(
  callback: (snapshot: SystemMetricsSnapshotDto) => void,
  intervalMs: number = 5000
): () => void {
  let isSubscribed = true;

  // 立即触发首次数据加载
  fetchSystemMetricsSnapshotApi()
    .then((snap) => {
      if (isSubscribed) {
        callback(snap);
      }
    })
    .catch(() => {});

  const timerId = setInterval(async () => {
    if (!isSubscribed) return;
    try {
      const snap = await fetchSystemMetricsSnapshotApi();
      if (isSubscribed) {
        callback(snap);
      }
    } catch {
      // 保持长轮询静默
    }
  }, intervalMs);

  return () => {
    isSubscribed = false;
    clearInterval(timerId);
  };
}
