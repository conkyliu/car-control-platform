import { http, ApiError } from './client.ts';
import {
  type VehicleLocationDto,
  type TelemetryFilterQuery,
  filterVehicleLocations,
  applyLocationUpdate,
  SEED_TELEMETRY_VEHICLES,
  isApiError,
} from '../views/telemetry/telemetry-core.ts';
import {
  type TrajectoryPoint,
  type StayPoint,
  type TrajectoryStats,
  type TrajectoryQueryDto,
  type SimplifiedTrajectoryDto,
  detectStayPoints,
  calculateTrajectoryStats,
  simplifyTrajectory,
  SEED_TRAJECTORIES,
  DEFAULT_TRAJECTORY,
} from '../views/telemetry/trajectory-core.ts';

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

/**
 * 获取车辆历史轨迹并支持 Douglas-Peucker 矢量抽稀
 * GET /api/v1/telemetry/:vehicleId/trajectory
 * 在离线降级模式下从本地种子库匹配，并执行前端矢量抽稀与停驻点重算
 */
export async function fetchVehicleTrajectoryApi(
  vehicleId: string,
  params?: TrajectoryQueryDto
): Promise<SimplifiedTrajectoryDto> {
  const queryTolerance = params?.tolerance !== undefined
    ? params.tolerance
    : params?.toleranceMeters !== undefined
      ? params.toleranceMeters / 111139
      : undefined;

  try {
    const res = await http.get<any>(
      `/telemetry/${encodeURIComponent(vehicleId)}/trajectory`,
      {
        params: {
          startTime: params?.startTime,
          endTime: params?.endTime,
          tolerance: queryTolerance,
        },
      }
    );

    if (res && Array.isArray(res.points)) {
      const points: TrajectoryPoint[] = res.points.map((pt: any) => ({
        lat: pt.lat,
        lng: pt.lng,
        speed: pt.speed ?? 0,
        heading: pt.heading ?? 0,
        altitude: pt.altitude,
        mileage: pt.mileage,
        satellites: pt.satellites,
        gpsValid: pt.gpsValid ?? true,
        timestamp: typeof pt.timestamp === 'number' ? pt.timestamp : Date.now(),
        timeFormatted: pt.timeFormatted || new Date(pt.timestamp).toISOString(),
      }));

      const stayPoints = res.stayPoints || detectStayPoints(points);
      const stats = res.stats || calculateTrajectoryStats(points, stayPoints);

      return {
        vehicleId: res.vehicleId || vehicleId,
        points,
        stayPoints,
        stats,
        rawCount: res.originalCount ?? res.rawCount ?? points.length,
        simplifiedCount: points.length,
        toleranceMeters: params?.toleranceMeters ?? (queryTolerance ? Math.round(queryTolerance * 111139) : 0),
        tolerance: queryTolerance,
        startTime: res.startTime,
        endTime: res.endTime,
      };
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线降级回退
  const baseSeed = SEED_TRAJECTORIES[vehicleId] || {
    ...DEFAULT_TRAJECTORY,
    vehicleId,
  };

  const rawPoints = baseSeed.points;
  const tolDeg = queryTolerance !== undefined ? queryTolerance : 0;
  const simplifiedPoints = tolDeg > 0 ? simplifyTrajectory(rawPoints, tolDeg) : [...rawPoints];
  const stayPoints = baseSeed.stayPoints && baseSeed.stayPoints.length > 0
    ? baseSeed.stayPoints
    : detectStayPoints(rawPoints);
  const stats = calculateTrajectoryStats(simplifiedPoints, stayPoints);

  stats.rawPointCount = rawPoints.length;
  stats.simplifiedPointCount = simplifiedPoints.length;
  stats.compressionRatio = rawPoints.length > 0
    ? Number((((rawPoints.length - simplifiedPoints.length) / rawPoints.length) * 100).toFixed(1))
    : 0;

  return {
    vehicleId,
    points: simplifiedPoints,
    stayPoints,
    stats,
    rawCount: rawPoints.length,
    simplifiedCount: simplifiedPoints.length,
    toleranceMeters: params?.toleranceMeters ?? (tolDeg > 0 ? Math.round(tolDeg * 111139) : 0),
    tolerance: tolDeg,
    startTime: simplifiedPoints[0]?.timeFormatted,
    endTime: simplifiedPoints[simplifiedPoints.length - 1]?.timeFormatted,
  };
}

