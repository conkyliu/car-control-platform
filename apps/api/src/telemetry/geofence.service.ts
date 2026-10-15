import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  GeofenceDto,
  CreateGeofenceDto,
  UpdateGeofenceDto,
  GeofenceFilterQueryDto,
  GeofenceStatus,
  Coordinates,
  GeofencePolygon,
} from '@car-control/contracts';
import { TenantContext } from '@car-control/database';

export interface GeofenceCircleLegacy {
  centerLat?: number;
  centerLng?: number;
  center?: Coordinates;
  radiusMeters: number;
}
export type GeofenceCircle = GeofenceCircleLegacy;

export interface GeofencePoint {
  lat: number;
  lng: number;
}

@Injectable()
export class GeofenceService {
  /** 地球平均半径（单位：米） */
  private static readonly EARTH_RADIUS_METERS = 6371000;

  private geofences: Map<string, GeofenceDto> = new Map();

  constructor() {
    this.seedInitialGeofences();
  }

  public seedInitialGeofences(): void {
    this.geofences.clear();

    // Seeds for TENANT_DEFAULT
    const seeds: GeofenceDto[] = [
      {
        id: 'gf_sh_01',
        tenantId: 'TENANT_DEFAULT',
        projectId: 'proj_default_01',
        name: '陆家嘴智能网联示范运营区',
        type: 'CIRCLE',
        circle: {
          center: { lat: 31.2397, lng: 121.4998 },
          radiusMeters: 3000,
        },
        triggerType: 'OUT',
        alarmLevel: 'WARNING',
        status: 'ACTIVE',
        boundVehicleCount: 5,
        vehicleIds: ['veh-001', 'veh-002', 'veh-003'],
        effectiveDays: [1, 2, 3, 4, 5],
        effectiveTimeRange: ['08:00', '20:00'],
        description: '陆家嘴金融与网联示范运营区，车辆非法出界触发中危告警',
        createdAt: '2026-03-01T08:00:00.000Z',
        updatedAt: '2026-03-01T08:00:00.000Z',
      },
      {
        id: 'gf_sh_02',
        tenantId: 'TENANT_DEFAULT',
        projectId: 'proj_default_01',
        name: '浦东国际机场航空禁行控制区',
        type: 'POLYGON',
        polygon: {
          vertices: [
            { lat: 31.155, lng: 121.785 },
            { lat: 31.155, lng: 121.825 },
            { lat: 31.135, lng: 121.825 },
            { lat: 31.135, lng: 121.785 },
          ],
        },
        triggerType: 'IN',
        alarmLevel: 'CRITICAL',
        status: 'ACTIVE',
        boundVehicleCount: 12,
        vehicleIds: ['veh-005', 'veh-006'],
        effectiveDays: [1, 2, 3, 4, 5, 6, 7],
        effectiveTimeRange: ['00:00', '23:59'],
        description: '浦东国际机场空侧及跑道保障禁行区，任何非授权车辆驶入即刻紧急告警',
        createdAt: '2026-03-02T09:00:00.000Z',
        updatedAt: '2026-03-02T09:00:00.000Z',
      },
      {
        id: 'gf_sh_03',
        tenantId: 'TENANT_DEFAULT',
        projectId: 'proj_default_01',
        name: '嘉定整车工业交付园',
        type: 'CIRCLE',
        circle: {
          center: { lat: 31.378, lng: 121.245 },
          radiusMeters: 1500,
        },
        triggerType: 'IN_OUT',
        alarmLevel: 'INFO',
        status: 'ACTIVE',
        boundVehicleCount: 3,
        vehicleIds: ['veh-008'],
        effectiveDays: [1, 2, 3, 4, 5, 6],
        effectiveTimeRange: ['07:30', '19:30'],
        description: '嘉定整车智能网联交付与测试示范基地，进出记录台账',
        createdAt: '2026-03-03T10:00:00.000Z',
        updatedAt: '2026-03-03T10:00:00.000Z',
      },
      // Seed for TENANT_B (Multi-tenant isolation verification)
      {
        id: 'gf_gz_01',
        tenantId: 'TENANT_B',
        projectId: 'proj_b_01',
        name: '广州科学城智慧车联示范区',
        type: 'CIRCLE',
        circle: {
          center: { lat: 23.162, lng: 113.445 },
          radiusMeters: 2000,
        },
        triggerType: 'OUT',
        alarmLevel: 'WARNING',
        status: 'ACTIVE',
        boundVehicleCount: 2,
        vehicleIds: ['veh-b-01'],
        effectiveDays: [1, 2, 3, 4, 5],
        effectiveTimeRange: ['09:00', '18:00'],
        description: '广州开发区科学城车队限行管控围栏',
        createdAt: '2026-03-04T10:00:00.000Z',
        updatedAt: '2026-03-04T10:00:00.000Z',
      },
    ];

    for (const item of seeds) {
      this.geofences.set(item.id, item);
    }
  }

  private resolveTenantId(explicitTenantId?: string): string {
    if (explicitTenantId) return explicitTenantId;
    const optional = TenantContext.getOptional();
    if (optional?.tenantId) return optional.tenantId;
    return 'TENANT_DEFAULT';
  }

  /**
   * 使用 Haversine 大圆距离公式计算两个经纬度点之间的球面距离（米）
   */
  calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;

    const lat1Rad = (lat1 * Math.PI) / 180;
    const lat2Rad = (lat2 * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const clampedA = Math.max(0, Math.min(1, a));
    const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));

    return GeofenceService.EARTH_RADIUS_METERS * c;
  }

  /**
   * 判定目标经纬度点是否在圆形电子围栏内（包含边界）
   */
  checkGeofence(circle: GeofenceCircle, point: GeofencePoint): boolean {
    const centerLat = circle.centerLat ?? circle.center?.lat;
    const centerLng = circle.centerLng ?? circle.center?.lng;
    if (centerLat === undefined || centerLng === undefined) {
      return false;
    }
    const distance = this.calculateDistance(
      centerLat,
      centerLng,
      point.lat,
      point.lng
    );
    return distance <= circle.radiusMeters;
  }

  /**
   * 判定点是否在线段上（含端点与容差）
   */
  private isPointOnSegment(p: Coordinates, a: Coordinates, b: Coordinates, tolerance = 1e-6): boolean {
    const lenSq = (b.lng - a.lng) * (b.lng - a.lng) + (b.lat - a.lat) * (b.lat - a.lat);
    if (lenSq < 1e-14) {
      const distSq = (p.lng - a.lng) * (p.lng - a.lng) + (p.lat - a.lat) * (p.lat - a.lat);
      return distSq <= tolerance * tolerance;
    }

    const cross = (p.lat - a.lat) * (b.lng - a.lng) - (p.lng - a.lng) * (b.lat - a.lat);
    const distSq = (cross * cross) / lenSq;
    if (distSq > tolerance * tolerance) return false;

    const dot = (p.lng - a.lng) * (b.lng - a.lng) + (p.lat - a.lat) * (b.lat - a.lat);
    const len = Math.sqrt(lenSq);
    if (dot < -tolerance * len) return false;
    if (dot > lenSq + tolerance * len) return false;
    return true;
  }

  /**
   * 基于射线投射算法（Ray-Casting Algorithm）的多边形碰撞检测
   */
  isPointInPolygon(point: Coordinates, polygon: GeofencePolygon): boolean {
    if (!polygon || !polygon.vertices || polygon.vertices.length < 3) {
      return false;
    }

    const { vertices } = polygon;

    // 边界碰撞检查（点在端点或边线容差范围内视为进入）
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      if (this.isPointOnSegment(point, vertices[j], vertices[i])) {
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
   * 多态围栏包含检测分发器
   */
  isPointInGeofence(point: Coordinates, geofence: GeofenceDto): boolean {
    if (!geofence || !point) {
      return false;
    }

    if (geofence.type === 'CIRCLE') {
      if (!geofence.circle) return false;
      const distance = this.calculateDistance(
        geofence.circle.center.lat,
        geofence.circle.center.lng,
        point.lat,
        point.lng
      );
      return distance <= geofence.circle.radiusMeters + 1e-4;
    }

    if (geofence.type === 'POLYGON') {
      if (!geofence.polygon) return false;
      return this.isPointInPolygon(point, geofence.polygon);
    }

    return false;
  }

  /**
   * 多维条件查询电子围栏列表（强制多租户隔离）
   */
  async listGeofences(
    query?: GeofenceFilterQueryDto,
    tenantId?: string
  ): Promise<GeofenceDto[]> {
    const effectiveTenantId = this.resolveTenantId(tenantId);
    let list = Array.from(this.geofences.values()).filter(
      (item) => item.tenantId === effectiveTenantId
    );

    if (query) {
      if (query.keyword) {
        const kw = query.keyword.trim().toLowerCase();
        list = list.filter((item) => {
          const matchName = item.name.toLowerCase().includes(kw);
          const matchDesc = item.description?.toLowerCase().includes(kw);
          const matchProj = item.projectId.toLowerCase().includes(kw);
          return matchName || matchDesc || matchProj;
        });
      }

      if (query.type) {
        list = list.filter((item) => item.type === query.type);
      }

      if (query.status) {
        list = list.filter((item) => item.status === query.status);
      }

      if (query.alarmLevel) {
        list = list.filter((item) => item.alarmLevel === query.alarmLevel);
      }

      if (query.projectId) {
        list = list.filter((item) => item.projectId === query.projectId);
      }
    }

    return JSON.parse(JSON.stringify(list));
  }

  /**
   * 根据 ID 查询电子围栏详情（强制多租户隔离）
   */
  async getGeofenceById(id: string, tenantId?: string): Promise<GeofenceDto> {
    const effectiveTenantId = this.resolveTenantId(tenantId);
    const item = this.geofences.get(id);

    if (!item || item.tenantId !== effectiveTenantId) {
      throw new NotFoundException(`电子围栏 [${id}] 不存在`);
    }

    return JSON.parse(JSON.stringify(item));
  }

  /**
   * 创建电子围栏（多租户生命周期入库）
   */
  async createGeofence(
    dto: CreateGeofenceDto,
    tenantId?: string
  ): Promise<GeofenceDto> {
    const effectiveTenantId = this.resolveTenantId(tenantId);

    if (!dto.name || !dto.name.trim()) {
      throw new BadRequestException('围栏名称不能为空');
    }

    if (dto.type !== 'CIRCLE' && dto.type !== 'POLYGON') {
      throw new BadRequestException('围栏类型必须为 CIRCLE 或 POLYGON');
    }

    if (dto.type === 'CIRCLE') {
      if (
        !dto.circle ||
        !dto.circle.center ||
        typeof dto.circle.center.lat !== 'number' ||
        typeof dto.circle.center.lng !== 'number' ||
        typeof dto.circle.radiusMeters !== 'number' ||
        dto.circle.radiusMeters <= 0
      ) {
        throw new BadRequestException('圆形围栏必须包含有效的圆心和半径数值');
      }
    }

    if (dto.type === 'POLYGON') {
      if (
        !dto.polygon ||
        !Array.isArray(dto.polygon.vertices) ||
        dto.polygon.vertices.length < 3
      ) {
        throw new BadRequestException('多边形围栏至少需要 3 个经纬度顶点');
      }
      for (const v of dto.polygon.vertices) {
        if (typeof v.lat !== 'number' || typeof v.lng !== 'number') {
          throw new BadRequestException('多边形顶点经纬度必须为有效数值');
        }
      }
    }

    const now = new Date().toISOString();
    const id =
      dto.id ||
      `gf_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    const boundVehicleCount =
      dto.boundVehicleCount ?? (dto.vehicleIds ? dto.vehicleIds.length : 0);

    const record: GeofenceDto = {
      id,
      tenantId: effectiveTenantId,
      projectId: dto.projectId || 'proj_default_01',
      name: dto.name.trim(),
      type: dto.type,
      circle: dto.type === 'CIRCLE' ? dto.circle : undefined,
      polygon: dto.type === 'POLYGON' ? dto.polygon : undefined,
      triggerType: dto.triggerType || 'OUT',
      alarmLevel: dto.alarmLevel || 'WARNING',
      status: dto.status || 'ACTIVE',
      boundVehicleCount,
      vehicleIds: dto.vehicleIds || [],
      effectiveDays: dto.effectiveDays || [1, 2, 3, 4, 5, 6, 7],
      effectiveTimeRange: dto.effectiveTimeRange || ['00:00', '23:59'],
      description: dto.description?.trim(),
      createdAt: now,
      updatedAt: now,
    };

    this.geofences.set(id, record);
    return JSON.parse(JSON.stringify(record));
  }

  /**
   * 更新电子围栏信息（强制多租户隔离）
   */
  async updateGeofence(
    id: string,
    dto: UpdateGeofenceDto,
    tenantId?: string
  ): Promise<GeofenceDto> {
    const effectiveTenantId = this.resolveTenantId(tenantId);
    const existing = this.geofences.get(id);

    if (!existing || existing.tenantId !== effectiveTenantId) {
      throw new NotFoundException(`未找到 ID 为 [${id}] 的电子围栏进行更新`);
    }

    if (dto.name !== undefined) {
      if (!dto.name.trim()) {
        throw new BadRequestException('围栏名称不能为空');
      }
      existing.name = dto.name.trim();
    }

    if (dto.projectId !== undefined) {
      existing.projectId = dto.projectId;
    }

    if (dto.type !== undefined) {
      if (dto.type !== 'CIRCLE' && dto.type !== 'POLYGON') {
        throw new BadRequestException('围栏类型必须为 CIRCLE 或 POLYGON');
      }
      existing.type = dto.type;
    }

    if (dto.circle !== undefined) {
      existing.circle = dto.circle;
    }

    if (dto.polygon !== undefined) {
      existing.polygon = dto.polygon;
    }

    if (dto.triggerType !== undefined) {
      existing.triggerType = dto.triggerType;
    }

    if (dto.alarmLevel !== undefined) {
      existing.alarmLevel = dto.alarmLevel;
    }

    if (dto.status !== undefined) {
      existing.status = dto.status;
    }

    if (dto.vehicleIds !== undefined) {
      existing.vehicleIds = dto.vehicleIds;
      existing.boundVehicleCount = dto.boundVehicleCount ?? dto.vehicleIds.length;
    } else if (dto.boundVehicleCount !== undefined) {
      existing.boundVehicleCount = dto.boundVehicleCount;
    }

    if (dto.effectiveDays !== undefined) {
      existing.effectiveDays = dto.effectiveDays;
    }

    if (dto.effectiveTimeRange !== undefined) {
      existing.effectiveTimeRange = dto.effectiveTimeRange;
    }

    if (dto.description !== undefined) {
      existing.description = dto.description.trim();
    }

    existing.updatedAt = new Date().toISOString();
    this.geofences.set(id, existing);
    return JSON.parse(JSON.stringify(existing));
  }

  /**
   * 启停状态切换（ACTIVE / DISABLED）
   */
  async updateStatus(
    id: string,
    status: GeofenceStatus,
    tenantId?: string
  ): Promise<GeofenceDto> {
    const effectiveTenantId = this.resolveTenantId(tenantId);
    const existing = this.geofences.get(id);

    if (!existing || existing.tenantId !== effectiveTenantId) {
      throw new NotFoundException(`未找到 ID 为 [${id}] 的电子围栏`);
    }

    if (status !== 'ACTIVE' && status !== 'DISABLED') {
      throw new BadRequestException('无效的电子围栏状态值，仅支持 ACTIVE 或 DISABLED');
    }

    existing.status = status;
    existing.updatedAt = new Date().toISOString();
    this.geofences.set(id, existing);
    return JSON.parse(JSON.stringify(existing));
  }

  /**
   * 删除电子围栏（强制多租户隔离）
   */
  async deleteGeofence(
    id: string,
    tenantId?: string
  ): Promise<{ success: boolean; message: string }> {
    const effectiveTenantId = this.resolveTenantId(tenantId);
    const existing = this.geofences.get(id);

    if (!existing || existing.tenantId !== effectiveTenantId) {
      throw new NotFoundException(`未找到 ID 为 [${id}] 的电子围栏进行删除`);
    }

    this.geofences.delete(id);
    return { success: true, message: '电子围栏删除成功' };
  }
}
