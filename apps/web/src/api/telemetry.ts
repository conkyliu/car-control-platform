import { http, ApiError } from './client.ts';
import {
  type VehicleLocationDto,
  type TelemetryFilterQuery,
  filterVehicleLocations,
  applyLocationUpdate,
  SEED_TELEMETRY_VEHICLES,
  isApiError,
} from '../views/telemetry/telemetry-core.ts';

export type TelemetryQueryParams = TelemetryFilterQuery;

// 本地内存遥测状态池 (用于离线降级与实时流模拟)
let inMemoryTelemetryVehicles: VehicleLocationDto[] = JSON.parse(
  JSON.stringify(SEED_TELEMETRY_VEHICLES)
);

export function getInMemoryTelemetryVehicles(): VehicleLocationDto[] {
  return inMemoryTelemetryVehicles;
}

export function setInMemoryTelemetryVehicles(list: VehicleLocationDto[]): void {
  inMemoryTelemetryVehicles = list;
}

export function resetInMemoryTelemetryVehicles(): void {
  inMemoryTelemetryVehicles = JSON.parse(JSON.stringify(SEED_TELEMETRY_VEHICLES));
}

/**
 * 获取全量或筛选后的车辆实时定位与工况列表
 * 支持车牌、VIN、设备号关键字匹配及状态过滤
 */
export async function fetchVehicleLocationsApi(
  params?: TelemetryQueryParams
): Promise<VehicleLocationDto[]> {
  try {
    const res = await http.get<VehicleLocationDto[]>('/telemetry/locations', {
      params,
    });
    if (Array.isArray(res)) {
      return res;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线降级逻辑
  const filtered = filterVehicleLocations(inMemoryTelemetryVehicles, params);
  return JSON.parse(JSON.stringify(filtered));
}

/**
 * 获取单台车辆最新实时位置与工况快照
 */
export async function fetchLatestLocationApi(vehicleId: string): Promise<VehicleLocationDto> {
  try {
    const res = await http.get<VehicleLocationDto>(
      `/telemetry/${encodeURIComponent(vehicleId)}/latest`
    );
    if (res && res.vehicleId) {
      return res;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线降级匹配
  const found = inMemoryTelemetryVehicles.find((v) => v.vehicleId === vehicleId);
  if (!found) {
    throw new ApiError(`未找到车辆 [${vehicleId}] 的最新遥测定位数据`, 404);
  }

  return JSON.parse(JSON.stringify(found));
}

/**
 * 实时定位推流订阅器
 * 模拟 WebSocket / SSE 长连接数据通道，定期推送位置变化并同步前端内存池
 */
export function subscribeRealtimeLocations(
  onUpdate: (location: VehicleLocationDto) => void
): () => void {
  let isSubscribed = true;
  let intervalTimer: ReturnType<typeof setInterval> | null = null;
  let initialTimer: ReturnType<typeof setTimeout> | null = null;

  // 触发单次推流与状态池微调
  const pushSimulatedUpdate = () => {
    if (!isSubscribed) return;
    if (inMemoryTelemetryVehicles.length === 0) return;

    // 选择第一台行驶中或首台车辆模拟坐标微调
    const target = inMemoryTelemetryVehicles[0];
    const jitterLat = (Math.random() - 0.5) * 0.0005;
    const jitterLng = (Math.random() - 0.5) * 0.0005;
    const now = Date.now();

    const updatedList = applyLocationUpdate(inMemoryTelemetryVehicles, {
      vehicleId: target.vehicleId,
      lat: target.coordinates.lat + jitterLat,
      lng: target.coordinates.lng + jitterLng,
      speed: Math.max(10, Math.round((target.speed ?? 40) + (Math.random() - 0.5) * 4)),
      heading: (target.heading ?? 0 + 5) % 360,
      timestamp: now,
      lastReportTime: new Date(now).toISOString(),
    });

    inMemoryTelemetryVehicles = updatedList;
    const updatedTarget = updatedList.find((v) => v.vehicleId === target.vehicleId) || updatedList[0];
    onUpdate(JSON.parse(JSON.stringify(updatedTarget)));
  };

  // 建立连接后短时触发首个报文，随后保持周期性心跳
  initialTimer = setTimeout(() => {
    pushSimulatedUpdate();
  }, 25);

  intervalTimer = setInterval(() => {
    pushSimulatedUpdate();
  }, 3000);

  // 返回注销清理函数
  return () => {
    isSubscribed = false;
    if (initialTimer) {
      clearTimeout(initialTimer);
      initialTimer = null;
    }
    if (intervalTimer) {
      clearInterval(intervalTimer);
      intervalTimer = null;
    }
  };
}
