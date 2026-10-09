import { TelemetryLocationPayload } from '@car-control/contracts';
import { TenantContext } from './tenant-context.js';

export interface TrajectoryPointEntry {
  timestamp: Date;
  payload: TelemetryLocationPayload;
  tenantId: string;
}

/**
 * 车辆位置与轨迹仓储
 * 支持最新位置热点缓存与时序轨迹点存储，严格受租户上下文隔离约束
 */
export class LocationRepository {
  /**
   * 最新位置缓存，基于租户与车辆 ID 双重限定
   */
  protected latestLocations: Map<string, TelemetryLocationPayload> = new Map();

  /**
   * 历史轨迹点存储，按 vehicleId 分组，内部每个轨迹点均打上所属 tenantId 标识
   */
  protected trajectoryStore: Map<string, Array<TrajectoryPointEntry>> = new Map();

  private getCacheKey(tenantId: string, vehicleId: string): string {
    return `${tenantId}:${vehicleId}`;
  }

  /**
   * 保存遥测经纬度点：
   * 1. 校验并获取当前 TenantContext 中的 tenantId
   * 2. 追加至历史轨迹时序数组
   * 3. 更新车辆最新位置缓存
   */
  async saveLocation(vehicleId: string, point: TelemetryLocationPayload): Promise<void> {
    const tenantId = TenantContext.getTenantId();
    const ptDate = new Date(point.timestamp);

    // 1. 追加到历史轨迹存储
    const trajectory = this.trajectoryStore.get(vehicleId) ?? [];
    trajectory.push({
      timestamp: ptDate,
      payload: point,
      tenantId,
    });
    this.trajectoryStore.set(vehicleId, trajectory);

    // 2. 更新最新位置热点缓存（仅当时间戳单调递增时刷新）
    const cacheKey = this.getCacheKey(tenantId, vehicleId);
    const existing = this.latestLocations.get(cacheKey);
    if (!existing || point.timestamp >= existing.timestamp) {
      this.latestLocations.set(cacheKey, point);
    }
  }

  /**
   * 查询车辆最新位置，强制限定当前租户
   */
  async getLatestLocation(vehicleId: string): Promise<TelemetryLocationPayload | null> {
    const tenantId = TenantContext.getTenantId();
    const cacheKey = this.getCacheKey(tenantId, vehicleId);
    return this.latestLocations.get(cacheKey) ?? null;
  }

  /**
   * 按起止时间段查询车辆历史轨迹，强制限定当前租户，按时间戳升序返回
   */
  async getTrajectory(vehicleId: string, start: Date, end: Date): Promise<TelemetryLocationPayload[]> {
    const tenantId = TenantContext.getTenantId();
    const startTime = start.getTime();
    const endTime = end.getTime();

    const points = this.trajectoryStore.get(vehicleId) ?? [];
    return points
      .filter((entry) => {
        if (entry.tenantId !== tenantId) {
          return false;
        }
        const time = entry.timestamp.getTime();
        return time >= startTime && time <= endTime;
      })
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      .map((entry) => entry.payload);
  }
}
