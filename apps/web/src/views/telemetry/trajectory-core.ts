/**
 * Trajectory Core Engine & Pure Math Models (trajectory-core.ts)
 * 
 * Provides:
 * - Domain contracts for trajectory points, stay points, query and stats
 * - Stay point intelligent detection algorithm (distance <= 30m, duration >= 180s)
 * - Trajectory stats calculation (distance, speed, duration, compression)
 * - 60fps high-precision trajectory interpolation (shortest angular heading wrapping)
 * - Douglas-Peucker vector simplification
 * - Production-fidelity seed trajectory dataset (Shenzhen Bay to Nanshan Tech Park)
 */

import { type Coordinates, calculateDistanceMeters } from './map-core.ts';

export interface TrajectoryPoint {
  lat: number;
  lng: number;
  speed: number; // km/h
  heading: number; // 0..360
  timestamp: number; // epoch ms
  altitude?: number;
  mileage?: number; // cumulative km
  satellites?: number;
  gpsValid?: boolean;
  timeFormatted: string; // e.g. "YYYY-MM-DD HH:mm:ss"
}

export interface StayPoint {
  id: string;
  coordinates: Coordinates;
  startTime: number;
  endTime: number;
  durationSeconds: number;
  durationFormatted: string;
  address?: string;
  pointCount?: number;
}

export interface TrajectoryStats {
  totalDistanceKm: number;
  durationSeconds: number;
  durationFormatted: string;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  stayCount: number;
  pointCount: number;
  rawPointCount?: number;
  simplifiedPointCount?: number;
  compressionRatio?: number; // percentage e.g. 78.4
}

export interface InterpolatedTrajectoryState {
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  timestamp: number;
  timeFormatted: string;
  currentIndex: number;
  progressFraction: number;
}

export interface TrajectoryQueryDto {
  startTime?: string | Date | number;
  endTime?: string | Date | number;
  tolerance?: number;
  toleranceMeters?: number;
}

export interface SimplifiedTrajectoryDto {
  vehicleId: string;
  points: TrajectoryPoint[];
  stayPoints: StayPoint[];
  stats: TrajectoryStats;
  rawCount: number;
  simplifiedCount: number;
  toleranceMeters: number;
  tolerance?: number;
  startTime?: string;
  endTime?: string;
}

/**
 * 格式化持续时间为自然中文表述（如 15分30秒、1小时20分）
 */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const remainingSec = s % 60;

  if (hours > 0) {
    if (minutes === 0 && remainingSec === 0) return `${hours}小时`;
    if (remainingSec === 0) return `${hours}小时${minutes}分`;
    return `${hours}小时${minutes}分${remainingSec}秒`;
  }

  if (minutes > 0) {
    if (remainingSec === 0) return `${minutes}分`;
    return `${minutes}分${remainingSec}秒`;
  }

  return `${remainingSec}秒`;
}

/**
 * 格式化时间戳为标准日期时间字符串 (YYYY-MM-DD HH:mm:ss)
 */
export function formatDateTime(ts: number | Date): string {
  const d = typeof ts === 'number' ? new Date(ts) : ts;
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 停驻点智能识别算法 (Stay Point Detection)
 * 当连续轨迹点之间的位移距离 <= 30米且停留时长 >= 180秒（3分钟）时判定为一个有效停驻点
 */
export function detectStayPoints(
  points: TrajectoryPoint[],
  minDurationSec = 180,
  distThresholdMeters = 30
): StayPoint[] {
  if (points.length < 2) return [];

  const stayPoints: StayPoint[] = [];
  let i = 0;
  const n = points.length;

  while (i < n) {
    let j = i + 1;
    let foundStay = false;

    while (j < n) {
      const dist = calculateDistanceMeters(
        { lat: points[i].lat, lng: points[i].lng },
        { lat: points[j].lat, lng: points[j].lng }
      );

      if (dist > distThresholdMeters) {
        break;
      }
      j++;
    }

    const durationSec = Math.round((points[j - 1].timestamp - points[i].timestamp) / 1000);
    if (durationSec >= minDurationSec && j - 1 > i) {
      // 计算停留窗口内所有点的几何质心坐标
      let sumLat = 0;
      let sumLng = 0;
      for (let k = i; k < j; k++) {
        sumLat += points[k].lat;
        sumLng += points[k].lng;
      }
      const count = j - i;
      const centerLat = Number((sumLat / count).toFixed(6));
      const centerLng = Number((sumLng / count).toFixed(6));

      stayPoints.push({
        id: `stay-${points[i].timestamp}-${points[j - 1].timestamp}`,
        coordinates: {
          lat: centerLat,
          lng: centerLng,
        },
        startTime: points[i].timestamp,
        endTime: points[j - 1].timestamp,
        durationSeconds: durationSec,
        durationFormatted: formatDuration(durationSec),
        pointCount: count,
        address: points[i].timeFormatted
          ? `路口临时停驻 (${formatDuration(durationSec)})`
          : undefined,
      });

      foundStay = true;
      i = j;
    }

    if (!foundStay) {
      i++;
    }
  }

  return stayPoints;
}

/**
 * 计算轨迹宏观统计指标
 */
export function calculateTrajectoryStats(
  points: TrajectoryPoint[],
  customStayPoints?: StayPoint[]
): TrajectoryStats {
  if (points.length === 0) {
    return {
      totalDistanceKm: 0,
      durationSeconds: 0,
      durationFormatted: '0秒',
      maxSpeedKmh: 0,
      avgSpeedKmh: 0,
      stayCount: 0,
      pointCount: 0,
      rawPointCount: 0,
      simplifiedPointCount: 0,
      compressionRatio: 0,
    };
  }

  if (points.length === 1) {
    const p = points[0];
    const sp = p.speed ?? 0;
    return {
      totalDistanceKm: 0,
      durationSeconds: 0,
      durationFormatted: '0秒',
      maxSpeedKmh: sp,
      avgSpeedKmh: sp,
      stayCount: 0,
      pointCount: 1,
      rawPointCount: 1,
      simplifiedPointCount: 1,
      compressionRatio: 0,
    };
  }

  let totalMeters = 0;
  let maxSpeed = 0;
  let movingSpeedSum = 0;
  let movingCount = 0;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    const sp = pt.speed ?? 0;
    if (sp > maxSpeed) {
      maxSpeed = sp;
    }
    if (sp > 0) {
      movingSpeedSum += sp;
      movingCount++;
    }

    if (i > 0) {
      const prev = points[i - 1];
      totalMeters += calculateDistanceMeters(
        { lat: prev.lat, lng: prev.lng },
        { lat: pt.lat, lng: pt.lng }
      );
    }
  }

  const totalDistanceKm = Number((totalMeters / 1000).toFixed(2));
  const firstTimestamp = points[0].timestamp;
  const lastTimestamp = points[points.length - 1].timestamp;
  const durationSeconds = Math.max(0, Math.round((lastTimestamp - firstTimestamp) / 1000));
  const durationFormatted = formatDuration(durationSeconds);
  const avgSpeedKmh = movingCount > 0 ? Number((movingSpeedSum / movingCount).toFixed(1)) : 0;
  const stayPoints = customStayPoints || detectStayPoints(points);

  return {
    totalDistanceKm,
    durationSeconds,
    durationFormatted,
    maxSpeedKmh: Number(maxSpeed.toFixed(1)),
    avgSpeedKmh,
    stayCount: stayPoints.length,
    pointCount: points.length,
    rawPointCount: points.length,
    simplifiedPointCount: points.length,
    compressionRatio: 0,
  };
}

/**
 * 高帧率平滑插值算法 (60fps Interpolation)
 * 基于播放进度百分比 (0 ~ 1) 在相邻轨迹段进行线性位置与最短角度平滑过渡
 */
export function interpolateTrajectory(
  points: TrajectoryPoint[],
  progressFraction: number
): InterpolatedTrajectoryState {
  const clampedFraction = Math.max(0, Math.min(1, progressFraction));

  if (points.length === 0) {
    return {
      lat: 0,
      lng: 0,
      speed: 0,
      heading: 0,
      timestamp: 0,
      timeFormatted: '',
      currentIndex: 0,
      progressFraction: clampedFraction,
    };
  }

  if (points.length === 1 || clampedFraction <= 0) {
    const p = points[0];
    return {
      lat: p.lat,
      lng: p.lng,
      speed: p.speed,
      heading: p.heading,
      timestamp: p.timestamp,
      timeFormatted: p.timeFormatted,
      currentIndex: 0,
      progressFraction: 0,
    };
  }

  if (clampedFraction >= 1) {
    const p = points[points.length - 1];
    return {
      lat: p.lat,
      lng: p.lng,
      speed: p.speed,
      heading: p.heading,
      timestamp: p.timestamp,
      timeFormatted: p.timeFormatted,
      currentIndex: points.length - 1,
      progressFraction: 1,
    };
  }

  const startTimestamp = points[0].timestamp;
  const endTimestamp = points[points.length - 1].timestamp;
  const totalDuration = endTimestamp - startTimestamp;

  let targetTimestamp: number;
  let segIndex = 0;
  let u = 0;

  if (totalDuration > 0) {
    targetTimestamp = startTimestamp + clampedFraction * totalDuration;
    for (let i = 0; i < points.length - 1; i++) {
      if (targetTimestamp >= points[i].timestamp && targetTimestamp <= points[i + 1].timestamp) {
        segIndex = i;
        const segDuration = points[i + 1].timestamp - points[i].timestamp;
        u = segDuration > 0 ? (targetTimestamp - points[i].timestamp) / segDuration : 0;
        break;
      }
    }
  } else {
    const virtualIndex = clampedFraction * (points.length - 1);
    segIndex = Math.min(Math.floor(virtualIndex), points.length - 2);
    u = virtualIndex - segIndex;
    targetTimestamp = startTimestamp;
  }

  const p1 = points[segIndex];
  const p2 = points[segIndex + 1];

  const lat = p1.lat + u * (p2.lat - p1.lat);
  const lng = p1.lng + u * (p2.lng - p1.lng);
  const speed = Number((p1.speed + u * (p2.speed - p1.speed)).toFixed(1));

  // 航向角最短跨越角插值 (解决 350° -> 10° 顺滑过渡)
  let diff = ((p2.heading - p1.heading + 180) % 360) - 180;
  if (diff < -180) diff += 360;
  let heading = Math.round((p1.heading + u * diff + 360) % 360);
  if (heading === 360) heading = 0;

  const timeFormatted = formatDateTime(Math.round(targetTimestamp));

  return {
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
    speed,
    heading,
    timestamp: Math.round(targetTimestamp),
    timeFormatted,
    currentIndex: segIndex,
    progressFraction: clampedFraction,
  };
}

/**
 * 点到线段几何距离（经纬度空间）
 */
function pointToSegmentDistance(
  point: Coordinates,
  lineStart: Coordinates,
  lineEnd: Coordinates
): number {
  const x0 = point.lng;
  const y0 = point.lat;
  const x1 = lineStart.lng;
  const y1 = lineStart.lat;
  const x2 = lineEnd.lng;
  const y2 = lineEnd.lat;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return Math.hypot(x0 - x1, y0 - y1);
  }

  const t = Math.max(0, Math.min(1, ((x0 - x1) * dx + (y0 - y1) * dy) / lenSq));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;

  return Math.hypot(x0 - projX, y0 - projY);
}

/**
 * Douglas-Peucker 经典分治矢量抽稀算法
 */
export function simplifyTrajectory<T extends { lat: number; lng: number }>(
  points: T[],
  toleranceDeg: number = 0.0001
): T[] {
  if (points.length <= 2) {
    return [...points];
  }

  let maxDistance = 0;
  let maxIndex = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = pointToSegmentDistance(points[i], first, last);
    if (dist > maxDistance) {
      maxDistance = dist;
      maxIndex = i;
    }
  }

  if (maxDistance > toleranceDeg) {
    const leftSub = simplifyTrajectory(points.slice(0, maxIndex + 1), toleranceDeg);
    const rightSub = simplifyTrajectory(points.slice(maxIndex), toleranceDeg);
    return leftSub.slice(0, -1).concat(rightSub);
  } else {
    return [first, last];
  }
}

/**
 * 常用抽稀容差预设（米与经纬度度数映射）
 */
export const TRAJECTORY_TOLERANCE_OPTIONS = [
  { label: '高精度 (3.3m)', value: 0.00003, meters: 3.3 },
  { label: '标准 (11.1m)', value: 0.0001, meters: 11.1 },
  { label: '概览 (55.5m)', value: 0.0005, meters: 55.5 },
];

/**
 * 构建高仿真深圳湾大桥 -> 深圳南山科技园生产级行车轨迹点集 (56 个采样点)
 */
function generateShenzhenBayToNanshanTrajectory(): TrajectoryPoint[] {
  const baseTime = 1792040000000; // 2026-10-15 06:13:20
  const points: TrajectoryPoint[] = [];

  // 坐标折线关键路径锚点 (56 点分布)
  // 1. 深圳湾公路大桥入口启程与加速 (点 0 - 15)
  const segment1Coords = [
    { lat: 22.50200, lng: 113.95200, sp: 0, h: 350 },
    { lat: 22.50280, lng: 113.95190, sp: 18.2, h: 350 },
    { lat: 22.50370, lng: 113.95175, sp: 32.5, h: 352 },
    { lat: 22.50490, lng: 113.95160, sp: 48.0, h: 352 },
    { lat: 22.50620, lng: 113.95140, sp: 58.6, h: 353 },
    { lat: 22.50760, lng: 113.95115, sp: 65.4, h: 354 },
    { lat: 22.50900, lng: 113.95090, sp: 68.2, h: 354 },
    { lat: 22.51050, lng: 113.95060, sp: 70.1, h: 354 },
    { lat: 22.51200, lng: 113.95030, sp: 72.5, h: 354 },
    { lat: 22.51350, lng: 113.95000, sp: 69.8, h: 354 },
    { lat: 22.51500, lng: 113.94960, sp: 64.3, h: 353 },
    { lat: 22.51620, lng: 113.94910, sp: 58.0, h: 350 },
    { lat: 22.51730, lng: 113.94840, sp: 52.1, h: 345 },
    { lat: 22.51820, lng: 113.94750, sp: 46.5, h: 335 },
    { lat: 22.51900, lng: 113.94660, sp: 40.2, h: 320 },
    { lat: 22.51970, lng: 113.94580, sp: 30.5, h: 310 },
  ];

  // 2. 转入后海大道/登良路口减速 (点 16 - 24)
  const segment2Coords = [
    { lat: 22.52010, lng: 113.94540, sp: 22.0, h: 305 },
    { lat: 22.52030, lng: 113.94520, sp: 14.5, h: 302 },
    { lat: 22.52042, lng: 113.94508, sp: 8.0, h: 300 },
    { lat: 22.52046, lng: 113.94504, sp: 3.2, h: 300 },
    { lat: 22.52048, lng: 113.94502, sp: 0, h: 300 },
    { lat: 22.52049, lng: 113.94501, sp: 0, h: 300 },
    { lat: 22.52050, lng: 113.94500, sp: 0, h: 300 },
    { lat: 22.52049, lng: 113.94501, sp: 0, h: 300 },
    { lat: 22.52048, lng: 113.94502, sp: 0, h: 300 },
  ];

  // 3. 登良路/后海大道红灯停驻 (点 25 - 30): 停留 >= 180s (此处停留 220s)
  const stayCoords = [
    { lat: 22.52048, lng: 113.94502, sp: 0, h: 300, deltaSec: 600 },  // 停驻起始
    { lat: 22.52050, lng: 113.94500, sp: 0, h: 300, deltaSec: 650 },
    { lat: 22.52051, lng: 113.94501, sp: 0, h: 300, deltaSec: 700 },
    { lat: 22.52049, lng: 113.94500, sp: 0, h: 300, deltaSec: 750 },
    { lat: 22.52050, lng: 113.94502, sp: 0, h: 300, deltaSec: 790 },
    { lat: 22.52052, lng: 113.94501, sp: 0, h: 300, deltaSec: 820 },  // 停驻结束 (+220s)
  ];

  // 4. 科苑南路直行北上高新科技园 (点 31 - 47)
  const segment4Coords = [
    { lat: 22.52100, lng: 113.94480, sp: 18.0, h: 345, deltaSec: 835 },
    { lat: 22.52220, lng: 113.94440, sp: 32.5, h: 350, deltaSec: 855 },
    { lat: 22.52350, lng: 113.94400, sp: 45.0, h: 353, deltaSec: 875 },
    { lat: 22.52500, lng: 113.94360, sp: 52.8, h: 355, deltaSec: 895 },
    { lat: 22.52650, lng: 113.94320, sp: 55.4, h: 355, deltaSec: 915 },
    { lat: 22.52800, lng: 113.94280, sp: 54.0, h: 355, deltaSec: 935 },
    { lat: 22.52950, lng: 113.94240, sp: 56.2, h: 355, deltaSec: 955 },
    { lat: 22.53100, lng: 113.94200, sp: 53.1, h: 355, deltaSec: 975 },
    { lat: 22.53250, lng: 113.94160, sp: 50.8, h: 355, deltaSec: 995 },
    { lat: 22.53400, lng: 113.94120, sp: 48.5, h: 355, deltaSec: 1015 },
    { lat: 22.53550, lng: 113.94080, sp: 46.0, h: 355, deltaSec: 1035 },
    { lat: 22.53700, lng: 113.94040, sp: 44.2, h: 355, deltaSec: 1055 },
    { lat: 22.53850, lng: 113.94000, sp: 42.0, h: 355, deltaSec: 1075 },
    { lat: 22.53980, lng: 113.93960, sp: 38.5, h: 350, deltaSec: 1095 },
    { lat: 22.54080, lng: 113.93930, sp: 32.0, h: 340, deltaSec: 1115 },
    { lat: 22.54160, lng: 113.93910, sp: 25.4, h: 320, deltaSec: 1135 },
    { lat: 22.54220, lng: 113.93895, sp: 18.0, h: 300, deltaSec: 1155 },
  ];

  // 5. 驶入高新南四道园区终点 (点 48 - 55)
  const segment5Coords = [
    { lat: 22.54250, lng: 113.93890, sp: 14.2, h: 80, deltaSec: 1175 },
    { lat: 22.54265, lng: 113.93890, sp: 10.5, h: 85, deltaSec: 1195 },
    { lat: 22.54272, lng: 113.93890, sp: 6.8, h: 85, deltaSec: 1215 },
    { lat: 22.54277, lng: 113.93890, sp: 3.5, h: 85, deltaSec: 1230 },
    { lat: 22.54280, lng: 113.93890, sp: 0, h: 85, deltaSec: 1245 },
    { lat: 22.54280, lng: 113.93890, sp: 0, h: 85, deltaSec: 1255 },
    { lat: 22.54280, lng: 113.93890, sp: 0, h: 85, deltaSec: 1265 },
    { lat: 22.54280, lng: 113.93890, sp: 0, h: 85, deltaSec: 1275 },
  ];

  let currentDistKm = 18420.5;

  // 组合 segment 1
  for (let idx = 0; idx < segment1Coords.length; idx++) {
    const c = segment1Coords[idx];
    const ts = baseTime + idx * 25000;
    currentDistKm += (c.sp * 25) / 3600;
    points.push({
      lat: c.lat,
      lng: c.lng,
      speed: c.sp,
      heading: c.h,
      timestamp: ts,
      altitude: 12 + Math.round(Math.sin(idx) * 3),
      mileage: Number(currentDistKm.toFixed(2)),
      satellites: 12,
      gpsValid: true,
      timeFormatted: formatDateTime(ts),
    });
  }

  // 组合 segment 2
  for (let idx = 0; idx < segment2Coords.length; idx++) {
    const c = segment2Coords[idx];
    const ts = baseTime + (segment1Coords.length + idx) * 20000;
    currentDistKm += (c.sp * 20) / 3600;
    points.push({
      lat: c.lat,
      lng: c.lng,
      speed: c.sp,
      heading: c.h,
      timestamp: ts,
      altitude: 15,
      mileage: Number(currentDistKm.toFixed(2)),
      satellites: 11,
      gpsValid: true,
      timeFormatted: formatDateTime(ts),
    });
  }

  // 组合 stayCoords
  for (const c of stayCoords) {
    const ts = baseTime + c.deltaSec * 1000;
    points.push({
      lat: c.lat,
      lng: c.lng,
      speed: c.sp,
      heading: c.h,
      timestamp: ts,
      altitude: 16,
      mileage: Number(currentDistKm.toFixed(2)),
      satellites: 12,
      gpsValid: true,
      timeFormatted: formatDateTime(ts),
    });
  }

  // 组合 segment 4
  for (const c of segment4Coords) {
    const ts = baseTime + c.deltaSec * 1000;
    currentDistKm += (c.sp * 20) / 3600;
    points.push({
      lat: c.lat,
      lng: c.lng,
      speed: c.sp,
      heading: c.h,
      timestamp: ts,
      altitude: 20 + Math.round(Math.cos(c.lat * 100) * 4),
      mileage: Number(currentDistKm.toFixed(2)),
      satellites: 13,
      gpsValid: true,
      timeFormatted: formatDateTime(ts),
    });
  }

  // 组合 segment 5
  for (const c of segment5Coords) {
    const ts = baseTime + c.deltaSec * 1000;
    currentDistKm += (c.sp * 15) / 3600;
    points.push({
      lat: c.lat,
      lng: c.lng,
      speed: c.sp,
      heading: c.h,
      timestamp: ts,
      altitude: 28,
      mileage: Number(currentDistKm.toFixed(2)),
      satellites: 14,
      gpsValid: true,
      timeFormatted: formatDateTime(ts),
    });
  }

  return points;
}

const defaultTrajectoryPoints = generateShenzhenBayToNanshanTrajectory();
const defaultStayPoints = detectStayPoints(defaultTrajectoryPoints);
const defaultStats = calculateTrajectoryStats(defaultTrajectoryPoints, defaultStayPoints);

export const DEFAULT_TRAJECTORY: SimplifiedTrajectoryDto = {
  vehicleId: 'veh-001',
  points: defaultTrajectoryPoints,
  stayPoints: defaultStayPoints,
  stats: defaultStats,
  rawCount: defaultTrajectoryPoints.length,
  simplifiedCount: defaultTrajectoryPoints.length,
  toleranceMeters: 0,
  startTime: defaultTrajectoryPoints[0].timeFormatted,
  endTime: defaultTrajectoryPoints[defaultTrajectoryPoints.length - 1].timeFormatted,
};

export const SEED_TRAJECTORIES: Record<string, SimplifiedTrajectoryDto> = {
  'veh-001': DEFAULT_TRAJECTORY,
  'veh-002': {
    ...DEFAULT_TRAJECTORY,
    vehicleId: 'veh-002',
  },
  'veh-003': {
    ...DEFAULT_TRAJECTORY,
    vehicleId: 'veh-003',
  },
  'veh-005': {
    ...DEFAULT_TRAJECTORY,
    vehicleId: 'veh-005',
  },
};
