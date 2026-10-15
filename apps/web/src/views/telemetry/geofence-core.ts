import { type Coordinates, calculateDistanceMeters } from './map-core.ts';
import { ApiError } from '../../api/client.ts';

export { type Coordinates } from './map-core.ts';

export type GeofenceType = 'CIRCLE' | 'POLYGON';
export type AlarmTriggerType = 'IN' | 'OUT' | 'IN_OUT';
export type GeofenceStatus = 'ACTIVE' | 'DISABLED';
export type AlarmLevel = 'INFO' | 'WARNING' | 'CRITICAL';

export interface GeofenceCircle {
  center: Coordinates;
  radiusMeters: number;
}

export interface GeofencePolygon {
  vertices: Coordinates[];
}

export interface GeofenceDto {
  id: string;
  tenantId: string;
  projectId: string;
  name: string;
  type: GeofenceType;
  circle?: GeofenceCircle;
  polygon?: GeofencePolygon;
  triggerType: AlarmTriggerType;
  alarmLevel: AlarmLevel;
  status: GeofenceStatus;
  boundVehicleCount: number;
  vehicleIds?: string[];
  effectiveDays?: number[]; // 1 = Mon, ..., 7 = Sun
  effectiveTimeRange?: [string, string];
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GeofenceFilterQuery {
  keyword?: string;
  type?: GeofenceType;
  status?: GeofenceStatus;
  alarmLevel?: AlarmLevel | string;
  projectId?: string;
  tenantId?: string;
}

/**
 * Krasovsky 1940 / WGS-84 reference radius
 */
const EARTH_RADIUS_METERS = 6378137.0;

/**
 * Pure circular collision detection.
 * Returns true if great-circle distance between point and center <= radius.
 */
export function isPointInCircle(point: Coordinates, circle: GeofenceCircle): boolean {
  if (!circle || !circle.center || circle.radiusMeters === undefined) {
    return false;
  }
  const distance = calculateDistanceMeters(point, circle.center);
  return distance <= circle.radiusMeters + 1e-4;
}

function isPointOnSegment(p: Coordinates, a: Coordinates, b: Coordinates, tolerance = 1e-6): boolean {
  const cross = (p.lat - a.lat) * (b.lng - a.lng) - (p.lng - a.lng) * (b.lat - a.lat);
  if (Math.abs(cross) > tolerance) return false;
  const dot = (p.lng - a.lng) * (b.lng - a.lng) + (p.lat - a.lat) * (b.lat - a.lat);
  if (dot < -tolerance) return false;
  const lenSq = (b.lng - a.lng) * (b.lng - a.lng) + (b.lat - a.lat) * (b.lat - a.lat);
  if (dot > lenSq + tolerance) return false;
  return true;
}

/**
 * Pure polygonal collision detection based on the classic Ray-Casting algorithm.
 * Tests if the given point is inside the arbitrary convex or concave polygon.
 */
export function isPointInPolygon(point: Coordinates, polygon: GeofencePolygon): boolean {
  if (!polygon || !polygon.vertices || polygon.vertices.length < 3) {
    return false;
  }

  const { vertices } = polygon;

  // Boundary check (on vertex or edge)
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    if (isPointOnSegment(point, vertices[j], vertices[i])) {
      return true;
    }
  }

  const x = point.lng;
  const y = point.lat;
  let inside = false;

  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].lng;
    const yi = vertices[i].lat;
    const xj = vertices[j].lng;
    const yj = vertices[j].lat;

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Polymorphic collision dispatcher.
 */
export function isPointInGeofence(point: Coordinates, geofence: GeofenceDto): boolean {
  if (!geofence || !point) {
    return false;
  }

  if (geofence.type === 'CIRCLE') {
    if (!geofence.circle) return false;
    return isPointInCircle(point, geofence.circle);
  }

  if (geofence.type === 'POLYGON') {
    if (!geofence.polygon) return false;
    return isPointInPolygon(point, geofence.polygon);
  }

  return false;
}

/**
 * Calculates geographic area of a circle in square kilometers (km²).
 */
export function calculateCircleAreaKm2(radiusMeters: number): number {
  if (!radiusMeters || radiusMeters <= 0) {
    return 0;
  }
  const rKm = radiusMeters / 1000.0;
  return Math.round(Math.PI * rKm * rKm * 1000) / 1000;
}

/**
 * Calculates geographic area of a polygon in square kilometers (km²) using
 * Gauss's area formula (Shoelace formula) on equirectangular projection centered on the centroid.
 */
export function calculatePolygonAreaKm2(vertices: Coordinates[]): number {
  if (!vertices || vertices.length < 3) {
    return 0;
  }

  const n = vertices.length;
  let latSum = 0;
  for (let i = 0; i < n; i++) {
    latSum += vertices[i].lat;
  }
  const meanLatRad = (latSum / n) * (Math.PI / 180.0);

  // Convert to local meter coordinates (x, y)
  const pts: Array<{ x: number; y: number }> = [];
  const degToRad = Math.PI / 180.0;
  const cosMeanLat = Math.cos(meanLatRad);

  for (let i = 0; i < n; i++) {
    const x = vertices[i].lng * degToRad * EARTH_RADIUS_METERS * cosMeanLat;
    const y = vertices[i].lat * degToRad * EARTH_RADIUS_METERS;
    pts.push({ x, y });
  }

  let doubleAreaM2 = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    doubleAreaM2 += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }

  const areaM2 = Math.abs(doubleAreaM2) / 2.0;
  const areaKm2 = areaM2 / 1000000.0;

  return Math.round(areaKm2 * 1000) / 1000;
}

/**
 * Human-friendly area formatter (e.g. "3.14 km²" or "500 m²").
 */
export function formatGeofenceArea(areaKm2: number): string {
  if (!areaKm2 || areaKm2 <= 0) {
    return '0 m²';
  }
  if (areaKm2 < 0.1) {
    const m2 = Math.round(areaKm2 * 1000000);
    return `${m2} m²`;
  }
  return `${areaKm2.toFixed(2)} km²`;
}

/**
 * Validator for geofence name (2~30 chars, valid Chinese, alphanumeric, dashes).
 */
export function validateGeofenceName(name: string): { valid: boolean; error?: string } {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: '围栏名称不能为空' };
  }
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    return { valid: false, error: '围栏名称不能少于 2 个字符' };
  }
  if (trimmed.length > 30) {
    return { valid: false, error: '围栏名称不能超过 30 个字符' };
  }
  const validPattern = /^[\u4e00-\u9fa5a-zA-Z0-9_\-\s]+$/;
  if (!validPattern.test(trimmed)) {
    return { valid: false, error: '围栏名称仅支持中文、英文字母、数字、下划线及连字符' };
  }
  return { valid: true };
}

/**
 * Validator for circular radius (100m ~ 100,000m).
 */
export function validateCircleRadius(radiusMeters: number): { valid: boolean; error?: string } {
  if (typeof radiusMeters !== 'number' || !Number.isFinite(radiusMeters)) {
    return { valid: false, error: '请输入有效的半径数值' };
  }
  if (radiusMeters < 100) {
    return { valid: false, error: '圆形围栏半径不得小于 100 米' };
  }
  if (radiusMeters > 100000) {
    return { valid: false, error: '圆形围栏半径不得超过 100,000 米 (100公里)' };
  }
  return { valid: true };
}

/**
 * Validator for polygon vertices (at least 3 valid coordinates, non-degenerate area).
 */
export function validatePolygonVertices(vertices: Coordinates[]): { valid: boolean; error?: string } {
  if (!vertices || !Array.isArray(vertices) || vertices.length < 3) {
    return { valid: false, error: '多边形围栏至少需要 3 个经纬度顶点' };
  }

  for (let i = 0; i < vertices.length; i++) {
    const v = vertices[i];
    if (typeof v.lat !== 'number' || typeof v.lng !== 'number' || !Number.isFinite(v.lat) || !Number.isFinite(v.lng)) {
      return { valid: false, error: `顶点 [${i + 1}] 经纬度格式无效` };
    }
    if (v.lat < -90 || v.lat > 90) {
      return { valid: false, error: `顶点 [${i + 1}] 纬度超出范围 [-90, 90]` };
    }
    if (v.lng < -180 || v.lng > 180) {
      return { valid: false, error: `顶点 [${i + 1}] 经度超出范围 [-180, 180]` };
    }
  }

  const area = calculatePolygonAreaKm2(vertices);
  if (area < 0.000001) {
    return { valid: false, error: '多边形顶点退化共线，所围闭合面积为 0' };
  }

  return { valid: true };
}

/**
 * Multi-dimensional filter for geofences.
 */
export function filterGeofences(list: GeofenceDto[], params?: GeofenceFilterQuery): GeofenceDto[] {
  if (!params) return list;

  return list.filter((item) => {
    if (params.keyword) {
      const kw = params.keyword.trim().toLowerCase();
      const matchName = item.name.toLowerCase().includes(kw);
      const matchDesc = item.description?.toLowerCase().includes(kw);
      const matchProj = item.projectId.toLowerCase().includes(kw);
      if (!matchName && !matchDesc && !matchProj) {
        return false;
      }
    }

    if (params.type && item.type !== params.type) {
      return false;
    }

    if (params.status && item.status !== params.status) {
      return false;
    }

    if (params.alarmLevel && item.alarmLevel !== params.alarmLevel) {
      return false;
    }

    if (params.projectId && item.projectId !== params.projectId) {
      return false;
    }

    if (params.tenantId && item.tenantId !== params.tenantId) {
      return false;
    }

    return true;
  });
}

/**
 * Realistic seed geofences in Shenzhen and Shanghai tech corridors.
 */
export const SEED_GEOFENCES: GeofenceDto[] = [
  {
    id: 'gf-001',
    tenantId: 'tenant-001',
    projectId: 'proj-shenzhen-01',
    name: '深圳高新南区核心禁出围栏',
    type: 'CIRCLE',
    circle: {
      center: { lat: 22.5428, lng: 113.9389 },
      radiusMeters: 1200,
    },
    triggerType: 'OUT',
    alarmLevel: 'WARNING',
    status: 'ACTIVE',
    boundVehicleCount: 4,
    vehicleIds: ['veh-001', 'veh-002', 'veh-003', 'veh-008'],
    effectiveDays: [1, 2, 3, 4, 5],
    effectiveTimeRange: ['07:00', '21:00'],
    description: '高新科技园南区核心车辆限行管控围栏，未经报备严禁驶出',
    createdAt: '2026-10-10T08:00:00Z',
    updatedAt: '2026-10-15T09:30:00Z',
  },
  {
    id: 'gf-002',
    tenantId: 'tenant-001',
    projectId: 'proj-shanghai-01',
    name: '上海陆家嘴金融核心禁入围栏',
    type: 'POLYGON',
    polygon: {
      vertices: [
        { lat: 31.246, lng: 121.492 },
        { lat: 31.246, lng: 121.508 },
        { lat: 31.232, lng: 121.508 },
        { lat: 31.232, lng: 121.492 },
      ],
    },
    triggerType: 'IN',
    alarmLevel: 'CRITICAL',
    status: 'ACTIVE',
    boundVehicleCount: 8,
    vehicleIds: ['veh-005', 'veh-006', 'veh-007'],
    effectiveDays: [1, 2, 3, 4, 5, 6, 7],
    effectiveTimeRange: ['00:00', '23:59'],
    description: '陆家嘴金融贸易区重载与非运营车辆全天候严禁驶入',
    createdAt: '2026-10-11T10:15:00Z',
    updatedAt: '2026-10-14T14:20:00Z',
  },
  {
    id: 'gf-003',
    tenantId: 'tenant-001',
    projectId: 'proj-shenzhen-02',
    name: '前海保税物流作业围栏',
    type: 'POLYGON',
    polygon: {
      vertices: [
        { lat: 22.542, lng: 113.895 },
        { lat: 22.545, lng: 113.918 },
        { lat: 22.528, lng: 113.918 },
        { lat: 22.525, lng: 113.895 },
      ],
    },
    triggerType: 'IN_OUT',
    alarmLevel: 'INFO',
    status: 'ACTIVE',
    boundVehicleCount: 5,
    vehicleIds: ['veh-003', 'veh-004'],
    effectiveDays: [1, 2, 3, 4, 5, 6],
    effectiveTimeRange: ['06:00', '22:00'],
    description: '前海深港现代物流保税仓储作业专用围栏，记录进出关卡台账',
    createdAt: '2026-10-12T11:00:00Z',
    updatedAt: '2026-10-15T08:00:00Z',
  },
  {
    id: 'gf-004',
    tenantId: 'tenant-001',
    projectId: 'proj-shanghai-02',
    name: '张江集成电路产业园围栏',
    type: 'CIRCLE',
    circle: {
      center: { lat: 31.205, lng: 121.595 },
      radiusMeters: 2500,
    },
    triggerType: 'IN_OUT',
    alarmLevel: 'INFO',
    status: 'DISABLED',
    boundVehicleCount: 2,
    vehicleIds: ['veh-005'],
    effectiveDays: [1, 2, 3, 4, 5],
    effectiveTimeRange: ['08:30', '19:30'],
    description: '张江集成电路产业基地测试车辆专用监控区域',
    createdAt: '2026-10-13T16:00:00Z',
    updatedAt: '2026-10-13T16:00:00Z',
  },
];

/**
 * Checks if error is an instance of ApiError.
 */
export function isApiError(err: unknown): err is ApiError {
  return (
    err instanceof ApiError ||
    (typeof err === 'object' && err !== null && 'statusCode' in err && 'name' in err && (err as any).name === 'ApiError')
  );
}
