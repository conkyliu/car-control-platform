import { http } from './client.ts';
import {
  type DashboardSnapshotDto,
  type DashboardStreamItem,
  type DashboardTimeRange,
  SEED_DASHBOARD_SNAPSHOT,
  isApiError,
} from '../views/dashboard/dashboard-core.ts';

/**
 * 内部可变内存状态池 (用于离线演示与自动化测试快照回滚)
 */
let inMemoryDashboardSnapshot: DashboardSnapshotDto = JSON.parse(
  JSON.stringify(SEED_DASHBOARD_SNAPSHOT)
);

/**
 * 获取当前内存中的全景大屏快照副本
 */
export function getInMemoryDashboardSnapshot(): DashboardSnapshotDto {
  return JSON.parse(JSON.stringify(inMemoryDashboardSnapshot));
}

/**
 * 覆盖设置内存中的全景大屏快照
 */
export function setInMemoryDashboardSnapshot(snapshot: DashboardSnapshotDto): void {
  inMemoryDashboardSnapshot = JSON.parse(JSON.stringify(snapshot));
}

/**
 * 重置内存大屏快照池为原始种子数据
 */
export function resetInMemoryDashboardSnapshot(): void {
  inMemoryDashboardSnapshot = JSON.parse(JSON.stringify(SEED_DASHBOARD_SNAPSHOT));
}

/**
 * 向内存流追加新实时运营事件 (自动插入头部并限制最大 50 条)
 */
export function appendDashboardStreamEvent(event: DashboardStreamItem): void {
  inMemoryDashboardSnapshot.realtimeStream = [
    event,
    ...inMemoryDashboardSnapshot.realtimeStream.filter((item) => item.id !== event.id),
  ].slice(0, 50);
}

/**
 * 获取全网运营全景大屏综合快照
 *
 * @param timeRange 时间跨度 ('TODAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS')
 * @returns 全景大屏完整统计快照
 */
export async function fetchDashboardSnapshotApi(
  timeRange: DashboardTimeRange = 'TODAY'
): Promise<DashboardSnapshotDto> {
  try {
    const remoteData = await http.get<DashboardSnapshotDto>('/dashboard/snapshot', {
      timeRange,
    });
    if (remoteData && remoteData.kpi && Array.isArray(remoteData.hourlyTrend)) {
      return remoteData;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
    // 离线/开发模式降级兜底
  }

  // 离线状态降级：基于内存快照根据时间跨度进行合理数值换算
  const snapshot: DashboardSnapshotDto = JSON.parse(
    JSON.stringify(inMemoryDashboardSnapshot)
  );

  snapshot.timeRange = timeRange;
  snapshot.updatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);

  if (timeRange === 'LAST_7_DAYS') {
    snapshot.kpi.todayCommands = Math.round(snapshot.kpi.todayCommands * 6.8);
    snapshot.kpi.todayAlarms = Math.round(snapshot.kpi.todayAlarms * 6.5);
    snapshot.kpi.alarmCriticalCount = Math.round(snapshot.kpi.alarmCriticalCount * 5.3);

    // 指令排行与告警分布按倍率缩放
    snapshot.commandRanking = snapshot.commandRanking.map((c) => ({
      ...c,
      count: Math.round(c.count * 6.8),
      successCount: Math.round(c.successCount * 6.8),
    }));
    snapshot.alarmDistribution = snapshot.alarmDistribution.map((a) => ({
      ...a,
      critical: Math.round(a.critical * 5.3),
      warning: Math.round(a.warning * 6.5),
      info: Math.round(a.info * 6.5),
      total: Math.round(a.total * 6.5),
    }));
  } else if (timeRange === 'LAST_30_DAYS') {
    snapshot.kpi.todayCommands = Math.round(snapshot.kpi.todayCommands * 28.5);
    snapshot.kpi.todayAlarms = Math.round(snapshot.kpi.todayAlarms * 26.2);
    snapshot.kpi.alarmCriticalCount = Math.round(snapshot.kpi.alarmCriticalCount * 21.0);

    // 指令排行与告警分布按倍率缩放
    snapshot.commandRanking = snapshot.commandRanking.map((c) => ({
      ...c,
      count: Math.round(c.count * 28.5),
      successCount: Math.round(c.successCount * 28.5),
    }));
    snapshot.alarmDistribution = snapshot.alarmDistribution.map((a) => ({
      ...a,
      critical: Math.round(a.critical * 21.0),
      warning: Math.round(a.warning * 26.2),
      info: Math.round(a.info * 26.2),
      total: Math.round(a.total * 26.2),
    }));
  }

  return snapshot;
}

/**
 * 拉取最新的运营事件流水列表
 */
export async function fetchDashboardRealtimeStreamApi(): Promise<DashboardStreamItem[]> {
  try {
    const remoteStream = await http.get<DashboardStreamItem[]>(
      '/dashboard/realtime-stream'
    );
    if (Array.isArray(remoteStream)) {
      return remoteStream;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
    // 离线降级
  }

  return JSON.parse(JSON.stringify(inMemoryDashboardSnapshot.realtimeStream));
}
