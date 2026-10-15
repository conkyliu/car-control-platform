/**
 * Map Core GIS Engine & Spatial Math (map-core.ts)
 * 
 * Provides:
 * - WGS-84 <-> GCJ-02 (Mars coordinates) high-precision bidirectional conversion
 * - Geodesic calculations (Haversine distance, Compass bearing/heading)
 * - Auto-fitting bounding box & recommended zoom determination
 * - Web Mercator projection & screen coordinate mapping
 * - Distance-threshold spatial marker clustering
 * - Telematics formatting utilities & realistic test seed data
 */

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface MapMarkerItem {
  id: string;
  plateNumber: string;
  vin: string;
  model: string;
  coordinates: Coordinates;
  rawCoordinates?: Coordinates;
  status: 'ONLINE' | 'OFFLINE' | 'ALARM';
  speedKmh?: number;
  heading?: number;
  voltage?: number;
  signalQuality?: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  lastHeartbeat?: string;
  address?: string;
}

export interface ClusterGroup {
  id: string;
  center: Coordinates;
  count: number;
  markers: MapMarkerItem[];
  pixelX: number;
  pixelY: number;
}

export interface MapViewport {
  center: Coordinates;
  zoom: number;
  pitch?: number;
  bearing?: number;
}

export type MapTileLayerType = 'standard' | 'dark' | 'satellite';

// Krasovsky 1940 ellipsoid constants
const KRASOVSKY_A = 6378245.0;
const KRASOVSKY_EE = 0.00669342162296594323;
const EARTH_RADIUS_METERS = 6378137.0;

/**
 * Checks whether coordinates fall within the territorial boundary of mainland China.
 * If outside China, coordinate shift must be bypassed according to Chinese GIS standards.
 */
export function isInChina(lat: number, lng: number): boolean {
  return lng >= 72.004 && lng <= 137.8347 && lat >= 0.8293 && lat <= 55.8271;
}

function transformLat(x: number, y: number): number {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin((y / 3.0) * Math.PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((y / 12.0) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLng(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin((x / 3.0) * Math.PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((x / 12.0) * Math.PI) + 300.0 * Math.sin((x / 30.0) * Math.PI)) * 2.0) / 3.0;
  return ret;
}

/**
 * Transforms standard GPS WGS-84 coordinates to GCJ-02 (Mars coordinates) for domestic map layers.
 */
export function wgs84ToGcj02(lat: number, lng: number): Coordinates {
  if (!isInChina(lat, lng)) {
    return { lat, lng };
  }

  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - KRASOVSKY_EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);

  dLat = (dLat * 180.0) / (((KRASOVSKY_A * (1 - KRASOVSKY_EE)) / (magic * sqrtMagic)) * Math.PI);
  dLng = (dLng * 180.0) / ((KRASOVSKY_A / sqrtMagic) * Math.cos(radLat) * Math.PI);

  return {
    lat: lat + dLat,
    lng: lng + dLng,
  };
}

/**
 * Converts GCJ-02 coordinates back to raw WGS-84 coordinates.
 * Utilizes high-order fixed-point iteration for sub-millimeter reverse accuracy.
 */
export function gcj02ToWgs84(lat: number, lng: number): Coordinates {
  if (!isInChina(lat, lng)) {
    return { lat, lng };
  }

  let wgsLat = lat;
  let wgsLng = lng;

  for (let i = 0; i < 4; i++) {
    const currentGcj = wgs84ToGcj02(wgsLat, wgsLng);
    const deltaLat = currentGcj.lat - lat;
    const deltaLng = currentGcj.lng - lng;

    wgsLat -= deltaLat;
    wgsLng -= deltaLng;

    if (Math.abs(deltaLat) < 1e-8 && Math.abs(deltaLng) < 1e-8) {
      break;
    }
  }

  return {
    lat: wgsLat,
    lng: wgsLng,
  };
}

/**
 * Calculates great-circle distance between two points in meters using the Haversine formula.
 */
export function calculateDistanceMeters(p1: Coordinates, p2: Coordinates): number {
  if (p1.lat === p2.lat && p1.lng === p2.lng) {
    return 0;
  }

  const radLat1 = (p1.lat * Math.PI) / 180.0;
  const radLat2 = (p2.lat * Math.PI) / 180.0;
  const deltaLat = ((p2.lat - p1.lat) * Math.PI) / 180.0;
  const deltaLng = ((p2.lng - p1.lng) * Math.PI) / 180.0;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(EARTH_RADIUS_METERS * c * 100) / 100;
}

/**
 * Calculates the forward azimuth / compass bearing from p1 to p2 in degrees (0° ~ 360°).
 * 0° = North, 90° = East, 180° = South, 270° = West.
 */
export function calculateHeading(p1: Coordinates, p2: Coordinates): number {
  if (Math.abs(p1.lat - p2.lat) < 1e-9 && Math.abs(p1.lng - p2.lng) < 1e-9) {
    return 0;
  }

  const radLat1 = (p1.lat * Math.PI) / 180.0;
  const radLat2 = (p2.lat * Math.PI) / 180.0;
  const deltaLng = ((p2.lng - p1.lng) * Math.PI) / 180.0;

  const y = Math.sin(deltaLng) * Math.cos(radLat2);
  const x =
    Math.cos(radLat1) * Math.sin(radLat2) -
    Math.sin(radLat1) * Math.cos(radLat2) * Math.cos(deltaLng);

  const initialBearing = (Math.atan2(y, x) * 180.0) / Math.PI;
  return (initialBearing + 360.0) % 360.0;
}

/**
 * Formats vehicle speed with standard unit or returns '静止' when stationary.
 */
export function formatSpeed(speedKmh?: number): string {
  if (speedKmh === undefined || speedKmh === null || Number.isNaN(speedKmh) || speedKmh <= 0) {
    return '静止';
  }
  return `${speedKmh.toFixed(1)} km/h`;
}

/**
 * Formats coordinates into standard geographical display (e.g. "31.2304° N, 121.4737° E").
 */
export function formatCoordinates(coords: Coordinates): string {
  const latCard = coords.lat >= 0 ? 'N' : 'S';
  const lngCard = coords.lng >= 0 ? 'E' : 'W';
  const formattedLat = `${Math.abs(coords.lat).toFixed(4)}° ${latCard}`;
  const formattedLng = `${Math.abs(coords.lng).toFixed(4)}° ${lngCard}`;
  return `${formattedLat}, ${formattedLng}`;
}

export interface BoundingBoxResult {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  center: Coordinates;
  recommendedZoom: number;
}

/**
 * Computes the minimum bounding box and auto-fitted recommended zoom level for a list of coordinates.
 */
export function calculateBoundingBox(points: Coordinates[]): BoundingBoxResult {
  if (points.length === 0) {
    return {
      minLat: 22.5428,
      maxLat: 22.5428,
      minLng: 113.9389,
      maxLng: 113.9389,
      center: { lat: 22.5428, lng: 113.9389 },
      recommendedZoom: 13,
    };
  }

  if (points.length === 1) {
    const pt = points[0];
    return {
      minLat: pt.lat,
      maxLat: pt.lat,
      minLng: pt.lng,
      maxLng: pt.lng,
      center: { lat: pt.lat, lng: pt.lng },
      recommendedZoom: 15,
    };
  }

  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLng = points[0].lng;
  let maxLng = points[0].lng;

  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }

  const centerLat = (minLat + maxLat) / 2.0;
  const centerLng = (minLng + maxLng) / 2.0;

  const latSpan = Math.max(maxLat - minLat, 0.0001);
  const lngSpan = Math.max(maxLng - minLng, 0.0001);
  const maxSpan = Math.max(latSpan, lngSpan * Math.cos((centerLat * Math.PI) / 180.0));

  // Auto zoom scale estimation based on logarithmic span curve
  const calculatedZoom = Math.round(8.73 - 0.662 * Math.log2(maxSpan));
  const recommendedZoom = Math.max(3, Math.min(18, calculatedZoom));

  return {
    minLat,
    maxLat,
    minLng,
    maxLng,
    center: { lat: centerLat, lng: centerLng },
    recommendedZoom,
  };
}

/**
 * Projects latitude/longitude to Web Mercator global pixel coordinates at a given zoom level.
 */
export function latLngToPixel(coords: Coordinates, zoom: number, tileSize = 256): { x: number; y: number } {
  const worldSize = tileSize * Math.pow(2, zoom);
  const x = ((coords.lng + 180.0) / 360.0) * worldSize;
  const siny = Math.sin((coords.lat * Math.PI) / 180.0);
  const clampedSiny = Math.min(Math.max(siny, -0.9999), 0.9999);
  const y = (0.5 - Math.log((1 + clampedSiny) / (1 - clampedSiny)) / (4.0 * Math.PI)) * worldSize;
  return { x, y };
}

/**
 * Reverses Web Mercator global pixel coordinates back to geographical latitude/longitude.
 */
export function pixelToLatLng(pixel: { x: number; y: number }, zoom: number, tileSize = 256): Coordinates {
  const worldSize = tileSize * Math.pow(2, zoom);
  const lng = (pixel.x / worldSize) * 360.0 - 180.0;
  const y2 = 0.5 - pixel.y / worldSize;
  const lat = 90.0 - (360.0 * Math.atan(Math.exp(-y2 * 2.0 * Math.PI))) / Math.PI;
  return { lat, lng };
}

/**
 * Groups nearby vehicle markers into ClusterGroups based on pixel proximity at the current zoom level.
 */
export function clusterMarkers(
  markers: MapMarkerItem[],
  distanceThresholdPx = 60,
  zoom = 13,
  _mapWidth?: number,
  _mapHeight?: number
): { singles: MapMarkerItem[]; clusters: ClusterGroup[] } {
  if (markers.length === 0) {
    return { singles: [], clusters: [] };
  }

  interface InternalCluster {
    items: MapMarkerItem[];
    pixelSumX: number;
    pixelSumY: number;
  }

  const groups: InternalCluster[] = [];

  for (const item of markers) {
    const px = latLngToPixel(item.coordinates, zoom);
    let assigned = false;

    for (const group of groups) {
      const avgX = group.pixelSumX / group.items.length;
      const avgY = group.pixelSumY / group.items.length;
      const dist = Math.hypot(avgX - px.x, avgY - px.y);

      if (dist <= distanceThresholdPx) {
        group.items.push(item);
        group.pixelSumX += px.x;
        group.pixelSumY += px.y;
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      groups.push({
        items: [item],
        pixelSumX: px.x,
        pixelSumY: px.y,
      });
    }
  }

  const singles: MapMarkerItem[] = [];
  const clusters: ClusterGroup[] = [];

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (g.items.length === 1) {
      singles.push(g.items[0]);
    } else {
      const avgX = g.pixelSumX / g.items.length;
      const avgY = g.pixelSumY / g.items.length;
      const centerCoords = pixelToLatLng({ x: avgX, y: avgY }, zoom);

      clusters.push({
        id: `cluster-${g.items.map((m) => m.id).sort().join('-')}`,
        center: centerCoords,
        count: g.items.length,
        markers: g.items,
        pixelX: avgX,
        pixelY: avgY,
      });
    }
  }

  return { singles, clusters };
}

/**
 * Realistic seed vehicles located in Shenzhen and Shanghai tech hubs.
 */
export const SEED_MAP_VEHICLES: MapMarkerItem[] = [
  {
    id: 'veh-001',
    plateNumber: '粤B·D12345',
    vin: 'LB9AA23E5NA001001',
    model: '仰望 U8',
    coordinates: { lat: 22.5428, lng: 113.9389 },
    rawCoordinates: { lat: 22.5398, lng: 113.9338 },
    status: 'ONLINE',
    speedKmh: 45.2,
    heading: 85,
    voltage: 12.8,
    signalQuality: 'EXCELLENT',
    lastHeartbeat: '2026-10-15T15:30:10Z',
    address: '深圳市南山区科苑南路高新科技园南区',
  },
  {
    id: 'veh-002',
    plateNumber: '粤B·DA6888',
    vin: 'LB9BB34F6PB002002',
    model: '极氪 001',
    coordinates: { lat: 22.5225, lng: 113.9452 },
    rawCoordinates: { lat: 22.5195, lng: 113.9401 },
    status: 'ONLINE',
    speedKmh: 68.0,
    heading: 142,
    voltage: 12.6,
    signalQuality: 'EXCELLENT',
    lastHeartbeat: '2026-10-15T15:30:25Z',
    address: '深圳市南山区海德三道腾讯滨海大厦',
  },
  {
    id: 'veh-003',
    plateNumber: '粤B·F99216',
    vin: 'LB9CC45G7RC003003',
    model: '蔚来 ET7',
    coordinates: { lat: 22.5350, lng: 113.9080 },
    rawCoordinates: { lat: 22.5320, lng: 113.9029 },
    status: 'ALARM',
    speedKmh: 0,
    heading: 210,
    voltage: 11.2,
    signalQuality: 'POOR',
    lastHeartbeat: '2026-10-15T15:28:12Z',
    address: '深圳市南山区前海深港现代服务业合作区桂湾',
  },
  {
    id: 'veh-004',
    plateNumber: '粤B·3388K',
    vin: 'LB9DD56H8SD004004',
    model: '理想 L9',
    coordinates: { lat: 22.5830, lng: 113.9680 },
    rawCoordinates: { lat: 22.5800, lng: 113.9629 },
    status: 'OFFLINE',
    speedKmh: 0,
    heading: 0,
    voltage: 12.4,
    signalQuality: 'FAIR',
    lastHeartbeat: '2026-10-15T14:45:00Z',
    address: '深圳市南山区西丽大学城体育中心',
  },
  {
    id: 'veh-005',
    plateNumber: '沪A·DZ8826',
    vin: 'LB9EE67J9TE005005',
    model: '特斯拉 Model Y',
    coordinates: { lat: 31.2050, lng: 121.5950 },
    rawCoordinates: { lat: 31.2030, lng: 121.5905 },
    status: 'ONLINE',
    speedKmh: 55.4,
    heading: 92,
    voltage: 13.1,
    signalQuality: 'EXCELLENT',
    lastHeartbeat: '2026-10-15T15:30:30Z',
    address: '上海市浦东新区张江高科技园区博云路浦软大厦',
  },
  {
    id: 'veh-006',
    plateNumber: '沪A·D55699',
    vin: 'LB9FF78K0UF006006',
    model: '小鹏 G9',
    coordinates: { lat: 31.2390, lng: 121.4990 },
    rawCoordinates: { lat: 31.2370, lng: 121.4945 },
    status: 'ONLINE',
    speedKmh: 32.1,
    heading: 320,
    voltage: 12.7,
    signalQuality: 'GOOD',
    lastHeartbeat: '2026-10-15T15:30:18Z',
    address: '上海市浦东新区陆家嘴环路东方明珠附近',
  },
  {
    id: 'veh-007',
    plateNumber: '沪B·88998',
    vin: 'LB9GG89L1VG007007',
    model: '比亚迪 汉EV',
    coordinates: { lat: 31.1940, lng: 121.3200 },
    rawCoordinates: { lat: 31.1920, lng: 121.3155 },
    status: 'OFFLINE',
    speedKmh: 0,
    heading: 180,
    voltage: 12.5,
    signalQuality: 'FAIR',
    lastHeartbeat: '2026-10-15T14:10:00Z',
    address: '上海市闵行区申昆路虹桥商务区停车场',
  },
  {
    id: 'veh-008',
    plateNumber: '粤B·E67123',
    vin: 'LB9HH90M2WH008008',
    model: '问界 M9',
    coordinates: { lat: 22.5410, lng: 113.9395 },
    rawCoordinates: { lat: 22.5380, lng: 113.9344 },
    status: 'ALARM',
    speedKmh: 12.0,
    heading: 45,
    voltage: 11.4,
    signalQuality: 'POOR',
    lastHeartbeat: '2026-10-15T15:29:40Z',
    address: '深圳市南山区粤海街道高新南四道',
  },
];
