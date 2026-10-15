/**
 * Telemetry Core Domain Models, Calculation & Streaming Engine
 * (telemetry-core.ts)
 */

import { type Coordinates, type MapMarkerItem } from './map-core.ts';
import { ApiError } from '../../api/client.ts';

export type VehicleOnlineStatus = 'ONLINE' | 'OFFLINE' | 'ALARM';

export interface VehicleLocationDto {
  vehicleId: string;
  plateNumber: string;
  vin: string;
  brand: string;
  modelName: string;
  deviceNo: string;
  coordinates: Coordinates;
  altitude?: number;
  speed?: number; // km/h
  heading?: number; // degrees 0..360
  satellites?: number;
  gpsValid: boolean;
  timestamp: number;
  mileage?: number; // km
  voltage?: number; // V
  status: VehicleOnlineStatus;
  alarmCount?: number;
  lastReportTime: string;
  address?: string;
}

export interface TelemetryOverview {
  totalVehicles: number;
  total: number;
  onlineCount: number;
  onlineRate: number; // percentage (0 - 100)
  movingCount: number;
  stationaryCount: number;
  alarmCount: number;
  avgSpeed: number; // km/h
}

export type TelemetryStatusFilter = 'ALL' | 'ONLINE' | 'MOVING' | 'STATIONARY' | 'ALARM' | 'OFFLINE';

export interface TelemetryFilterQuery {
  keyword?: string;
  status?: TelemetryStatusFilter | string;
  lowVoltageOnly?: boolean;
}

export interface TelemetryLocationPayload {
  vehicleId: string;
  lat?: number;
  lng?: number;
  coordinates?: Coordinates;
  speed?: number;
  heading?: number;
  altitude?: number;
  satellites?: number;
  voltage?: number;
  gpsValid?: boolean;
  timestamp?: number;
  mileage?: number;
  alarmCount?: number;
  status?: VehicleOnlineStatus;
  lastReportTime?: string;
  address?: string;
}

/**
 * 判断捕获的异常是否为 API 业务错误
 */
export function isApiError(err: unknown): err is ApiError {
  if (err instanceof ApiError) return true;
  if (typeof err === 'object' && err !== null) {
    const candidate = err as Record<string, unknown>;
    return typeof candidate.statusCode === 'number' && typeof candidate.message === 'string';
  }
  return false;
}

/**
 * 计算全域遥测监控大盘统计概览指标
 */
export function calculateTelemetryOverview(vehicles: VehicleLocationDto[]): TelemetryOverview {
  const totalVehicles = vehicles.length;
  if (totalVehicles === 0) {
    return {
      totalVehicles: 0,
      total: 0,
      onlineCount: 0,
      onlineRate: 0,
      movingCount: 0,
      stationaryCount: 0,
      alarmCount: 0,
      avgSpeed: 0,
    };
  }

  // 在线设备统计：ONLINE 态或具备有效定位信号的 ALARM 告警车
  const onlineCount = vehicles.filter(
    (v) => v.status === 'ONLINE' || (v.status === 'ALARM' && v.gpsValid)
  ).length;

  const onlineRate = Number(((onlineCount / totalVehicles) * 100).toFixed(1));

  // 行驶中车辆：在线或告警且实时车速 > 0
  const movingVehicles = vehicles.filter(
    (v) => (v.status === 'ONLINE' || v.status === 'ALARM') && (v.speed ?? 0) > 0
  );
  const movingCount = movingVehicles.length;

  // 静止熄火：车速 <= 0 或处于离线态
  const stationaryCount = vehicles.filter(
    (v) => (v.speed ?? 0) <= 0 || v.status === 'OFFLINE'
  ).length;

  // 告警中：status 为 ALARM 或告警计数 > 0
  const alarmCount = vehicles.filter(
    (v) => v.status === 'ALARM' || (v.alarmCount ?? 0) > 0
  ).length;

  // 行驶中车辆平均车速
  let avgSpeed = 0;
  if (movingCount > 0) {
    const totalSpeed = movingVehicles.reduce((acc, curr) => acc + (curr.speed ?? 0), 0);
    avgSpeed = Number((totalSpeed / movingCount).toFixed(1));
  }

  return {
    totalVehicles,
    total: totalVehicles,
    onlineCount,
    onlineRate,
    movingCount,
    stationaryCount,
    alarmCount,
    avgSpeed,
  };
}

/**
 * 多维检索与状态筛选算法
 */
export function filterVehicleLocations(
  vehicles: VehicleLocationDto[],
  query?: TelemetryFilterQuery
): VehicleLocationDto[] {
  if (!query) return [...vehicles];

  return vehicles.filter((veh) => {
    // 1. 关键字匹配（车牌号、VIN 码后 6 位或全称、硬件设备号、品牌车型）
    if (query.keyword && query.keyword.trim().length > 0) {
      const kw = query.keyword.trim().toLowerCase();
      const matchPlate = veh.plateNumber.toLowerCase().includes(kw);
      const matchVin = veh.vin.toLowerCase().includes(kw);
      const matchVinSuffix = veh.vin.length >= 6 && veh.vin.slice(-6).toLowerCase().includes(kw);
      const matchDevice = veh.deviceNo.toLowerCase().includes(kw);
      const matchBrand = veh.brand.toLowerCase().includes(kw);
      const matchModel = veh.modelName.toLowerCase().includes(kw);
      const matchComposite = `${veh.brand} ${veh.modelName}`.toLowerCase().includes(kw);

      if (!matchPlate && !matchVin && !matchVinSuffix && !matchDevice && !matchBrand && !matchModel && !matchComposite) {
        return false;
      }
    }

    // 2. 状态过滤
    if (query.status && query.status !== 'ALL') {
      const s = query.status.toUpperCase();
      switch (s) {
        case 'ONLINE':
          if (veh.status !== 'ONLINE' && !(veh.status === 'ALARM' && veh.gpsValid)) {
            return false;
          }
          break;
        case 'MOVING':
          if ((veh.status !== 'ONLINE' && veh.status !== 'ALARM') || (veh.speed ?? 0) <= 0) {
            return false;
          }
          break;
        case 'STATIONARY':
          if ((veh.speed ?? 0) > 0 && veh.status !== 'OFFLINE') {
            return false;
          }
          break;
        case 'ALARM':
          if (veh.status !== 'ALARM' && (veh.alarmCount ?? 0) <= 0) {
            return false;
          }
          break;
        case 'OFFLINE':
          if (veh.status !== 'OFFLINE') {
            return false;
          }
          break;
        default:
          break;
      }
    }

    // 3. 电瓶低电压过滤 (< 11.5V)
    if (query.lowVoltageOnly) {
      if (veh.voltage === undefined || veh.voltage >= 11.5) {
        return false;
      }
    }

    return true;
  });
}

/**
 * 实时定位更新原子操作器 (Immutable Location Stream Reducer)
 * 接收当前车辆集合与实时上报报文，返回按时间排序的最新不可变状态集
 */
export function applyLocationUpdate(
  vehicles: VehicleLocationDto[],
  update: TelemetryLocationPayload & { vehicleId: string }
): VehicleLocationDto[] {
  const targetIndex = vehicles.findIndex((v) => v.vehicleId === update.vehicleId);
  if (targetIndex === -1) {
    return [...vehicles];
  }

  const existing = vehicles[targetIndex]!;
  const newTimestamp = update.timestamp ?? Date.now();
  const newSpeed = update.speed !== undefined ? update.speed : existing.speed;
  const newLat = update.lat ?? update.coordinates?.lat ?? existing.coordinates.lat;
  const newLng = update.lng ?? update.coordinates?.lng ?? existing.coordinates.lng;

  // 状态自动流转：若车速 > 0 且无显式状态覆盖，则自动将状态刷新为在线
  let newStatus: VehicleOnlineStatus = existing.status;
  if (update.status) {
    newStatus = update.status;
  } else if ((newSpeed ?? 0) > 0 && existing.status === 'OFFLINE') {
    newStatus = 'ONLINE';
  }

  const updatedItem: VehicleLocationDto = {
    ...existing,
    coordinates: { lat: newLat, lng: newLng },
    altitude: update.altitude !== undefined ? update.altitude : existing.altitude,
    speed: newSpeed,
    heading: update.heading !== undefined ? update.heading : existing.heading,
    satellites: update.satellites !== undefined ? update.satellites : existing.satellites,
    gpsValid: update.gpsValid !== undefined ? update.gpsValid : existing.gpsValid,
    timestamp: newTimestamp,
    mileage: update.mileage !== undefined ? update.mileage : existing.mileage,
    voltage: update.voltage !== undefined ? update.voltage : existing.voltage,
    status: newStatus,
    alarmCount: update.alarmCount !== undefined ? update.alarmCount : existing.alarmCount,
    lastReportTime: update.lastReportTime ?? new Date(newTimestamp).toISOString(),
    address: update.address !== undefined ? update.address : existing.address,
  };

  const nextList = [...vehicles];
  nextList[targetIndex] = updatedItem;

  // 按最新上报时间重算降序排序
  return nextList.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * 将 VehicleLocationDto 转换为 MapContainer 可直接渲染的 MapMarkerItem
 */
export function toMarkerItem(dto: VehicleLocationDto): MapMarkerItem {
  let signalQuality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' = 'FAIR';
  if (!dto.gpsValid) {
    signalQuality = 'POOR';
  } else if ((dto.satellites ?? 0) >= 10) {
    signalQuality = 'EXCELLENT';
  } else if ((dto.satellites ?? 0) >= 6) {
    signalQuality = 'GOOD';
  } else {
    signalQuality = 'FAIR';
  }

  return {
    id: dto.vehicleId,
    plateNumber: dto.plateNumber,
    vin: dto.vin,
    model: `${dto.brand} ${dto.modelName}`.trim(),
    coordinates: dto.coordinates,
    status: dto.status,
    speedKmh: dto.speed,
    heading: dto.heading,
    voltage: dto.voltage,
    signalQuality,
    lastHeartbeat: dto.lastReportTime,
    address: dto.address,
  };
}

/**
 * 8 台标准遥测种子车辆（与 GIS 示范区坐标无缝同步）
 */
export const SEED_TELEMETRY_VEHICLES: VehicleLocationDto[] = [
  {
    vehicleId: 'veh-001',
    plateNumber: '粤B·D12345',
    vin: 'LB9AA23E5NA001001',
    brand: '比亚迪',
    modelName: '仰望 U8',
    deviceNo: 'DEV_SN_001',
    coordinates: { lat: 22.5428, lng: 113.9389 },
    altitude: 28,
    speed: 45.2,
    heading: 85,
    satellites: 12,
    gpsValid: true,
    timestamp: 1792050000000,
    mileage: 18450.5,
    voltage: 12.8,
    status: 'ONLINE',
    alarmCount: 0,
    lastReportTime: '2026-10-15T07:40:00Z',
    address: '深圳市南山区科苑南路高新科技园南区',
  },
  {
    vehicleId: 'veh-002',
    plateNumber: '粤B·DA6888',
    vin: 'LB9BB34F6PB002002',
    brand: '极氪',
    modelName: '极氪 001',
    deviceNo: 'DEV_SN_002',
    coordinates: { lat: 22.5225, lng: 113.9452 },
    altitude: 15,
    speed: 68.0,
    heading: 142,
    satellites: 11,
    gpsValid: true,
    timestamp: 1792049900000,
    mileage: 26310.0,
    voltage: 12.6,
    status: 'ONLINE',
    alarmCount: 0,
    lastReportTime: '2026-10-15T07:38:20Z',
    address: '深圳市南山区海德三道腾讯滨海大厦',
  },
  {
    vehicleId: 'veh-003',
    plateNumber: '粤B·F99216',
    vin: 'LB9CC45G7RC003003',
    brand: '蔚来',
    modelName: '蔚来 ET7',
    deviceNo: 'DEV_SN_003',
    coordinates: { lat: 22.5350, lng: 113.9080 },
    altitude: 12,
    speed: 0,
    heading: 210,
    satellites: 5,
    gpsValid: true,
    timestamp: 1792049800000,
    mileage: 41200.2,
    voltage: 11.2,
    status: 'ALARM',
    alarmCount: 2,
    lastReportTime: '2026-10-15T07:36:40Z',
    address: '深圳市南山区前海深港现代服务业合作区桂湾',
  },
  {
    vehicleId: 'veh-004',
    plateNumber: '粤B·3388K',
    vin: 'LB9DD56H8SD004004',
    brand: '理想',
    modelName: '理想 L9',
    deviceNo: 'DEV_SN_004',
    coordinates: { lat: 22.5830, lng: 113.9680 },
    altitude: 35,
    speed: 0,
    heading: 0,
    satellites: 8,
    gpsValid: false,
    timestamp: 1792045000000,
    mileage: 52400.8,
    voltage: 12.4,
    status: 'OFFLINE',
    alarmCount: 0,
    lastReportTime: '2026-10-15T06:16:40Z',
    address: '深圳市南山区西丽大学城体育中心',
  },
  {
    vehicleId: 'veh-005',
    plateNumber: '沪A·DZ8826',
    vin: 'LB9EE67J9TE005005',
    brand: '特斯拉',
    modelName: 'Model Y',
    deviceNo: 'DEV_SN_005',
    coordinates: { lat: 31.2050, lng: 121.5950 },
    altitude: 8,
    speed: 55.4,
    heading: 92,
    satellites: 14,
    gpsValid: true,
    timestamp: 1792049750000,
    mileage: 33890.1,
    voltage: 13.1,
    status: 'ONLINE',
    alarmCount: 0,
    lastReportTime: '2026-10-15T07:35:50Z',
    address: '上海市浦东新区张江高科技园区博云路浦软大厦',
  },
  {
    vehicleId: 'veh-006',
    plateNumber: '沪A·D55699',
    vin: 'LB9FF78K0UF006006',
    brand: '小鹏',
    modelName: '小鹏 G9',
    deviceNo: 'DEV_SN_006',
    coordinates: { lat: 31.2390, lng: 121.4990 },
    altitude: 10,
    speed: 32.1,
    heading: 320,
    satellites: 10,
    gpsValid: true,
    timestamp: 1792049700000,
    mileage: 19840.4,
    voltage: 12.7,
    status: 'ONLINE',
    alarmCount: 0,
    lastReportTime: '2026-10-15T07:35:00Z',
    address: '上海市浦东新区陆家嘴环路东方明珠附近',
  },
  {
    vehicleId: 'veh-007',
    plateNumber: '沪B·88998',
    vin: 'LB9GG89L1VG007007',
    brand: '比亚迪',
    modelName: '比亚迪 汉EV',
    deviceNo: 'DEV_SN_007',
    coordinates: { lat: 31.1940, lng: 121.3200 },
    altitude: 5,
    speed: 0,
    heading: 180,
    satellites: 7,
    gpsValid: false,
    timestamp: 1792044000000,
    mileage: 67120.0,
    voltage: 12.5,
    status: 'OFFLINE',
    alarmCount: 0,
    lastReportTime: '2026-10-15T06:00:00Z',
    address: '上海市闵行区申昆路虹桥商务区停车场',
  },
  {
    vehicleId: 'veh-008',
    plateNumber: '粤B·E67123',
    vin: 'LB9HH90M2WH008008',
    brand: '问界',
    modelName: '问界 M9',
    deviceNo: 'DEV_SN_008',
    coordinates: { lat: 22.5410, lng: 113.9395 },
    altitude: 25,
    speed: 12.0,
    heading: 45,
    satellites: 4,
    gpsValid: true,
    timestamp: 1792049650000,
    mileage: 14200.0,
    voltage: 11.4,
    status: 'ALARM',
    alarmCount: 1,
    lastReportTime: '2026-10-15T07:34:10Z',
    address: '深圳市南山区粤海街道高新南四道',
  },
];
