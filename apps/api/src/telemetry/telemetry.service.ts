import { Injectable, Inject, Optional } from '@nestjs/common';
import {
  TelemetryLocationPayload,
  WebSocketEvent,
  VehicleLocationDto,
  TelemetryFilterQuery,
  VehicleOnlineStatus,
} from '@car-control/contracts';
import {
  LocationRepository,
  VehicleRepository,
  DeviceRepository,
  TenantContext,
} from '@car-control/database';
import { DeviceOnlineStatus } from '@car-control/domain-types';
import { MessagingPort } from '../messaging/messaging.port.js';
import { WebSocketGatewayService } from '../realtime/websocket.gateway.js';
import { DeviceStatusService } from '../device/device-status.service.js';
import { GeofenceService } from './geofence.service.js';
import { douglasPeucker } from './douglas-peucker.js';

/**
 * 8 台标准遥测种子车辆（用于 TENANT_DEFAULT 初始化与演示态大盘）
 */
export const SEED_FLEET_LOCATIONS: VehicleLocationDto[] = [
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
    coordinates: { lat: 22.535, lng: 113.908 },
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
    coordinates: { lat: 22.583, lng: 113.968 },
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
    coordinates: { lat: 31.205, lng: 121.595 },
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
    coordinates: { lat: 31.239, lng: 121.499 },
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
    coordinates: { lat: 31.194, lng: 121.32 },
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
    coordinates: { lat: 22.541, lng: 113.9395 },
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

export function filterVehicleLocations(
  vehicles: VehicleLocationDto[],
  query?: TelemetryFilterQuery
): VehicleLocationDto[] {
  if (!query) return [...vehicles];

  return vehicles.filter((veh) => {
    // 1. 关键字匹配（车牌号、VIN 码全称或后 6 位、硬件设备号、品牌车型）
    if (query.keyword && query.keyword.trim().length > 0) {
      const kw = query.keyword.trim().toLowerCase();
      const matchPlate = veh.plateNumber.toLowerCase().includes(kw);
      const matchVin = veh.vin.toLowerCase().includes(kw);
      const matchVinSuffix =
        veh.vin.length >= 6 && veh.vin.slice(-6).toLowerCase().includes(kw);
      const matchDevice = veh.deviceNo.toLowerCase().includes(kw);
      const matchBrand = (veh.brand || '').toLowerCase().includes(kw);
      const matchModel = (veh.modelName || '').toLowerCase().includes(kw);
      const matchComposite = `${veh.brand} ${veh.modelName}`
        .toLowerCase()
        .includes(kw);

      if (
        !matchPlate &&
        !matchVin &&
        !matchVinSuffix &&
        !matchDevice &&
        !matchBrand &&
        !matchModel &&
        !matchComposite
      ) {
        return false;
      }
    }

    // 2. 状态过滤
    if (query.status && query.status !== 'ALL') {
      const s = String(query.status).toUpperCase();
      switch (s) {
        case 'ONLINE':
          if (
            veh.status !== 'ONLINE' &&
            !(veh.status === 'ALARM' && veh.gpsValid)
          ) {
            return false;
          }
          break;
        case 'MOVING':
          if (
            (veh.status !== 'ONLINE' && veh.status !== 'ALARM') ||
            (veh.speed ?? 0) <= 0
          ) {
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
    if (
      query.lowVoltageOnly === true ||
      String(query.lowVoltageOnly) === 'true'
    ) {
      if (veh.voltage === undefined || veh.voltage >= 11.5) {
        return false;
      }
    }

    return true;
  });
}

@Injectable()
export class TelemetryService {
  constructor(
    private readonly locationRepo: LocationRepository,
    private readonly vehicleRepo: VehicleRepository,
    private readonly wsGateway: WebSocketGatewayService,
    private readonly geofenceService: GeofenceService,
    @Inject('MessagingPort') private readonly messagingPort: MessagingPort,
    @Optional() private readonly deviceStatusService?: DeviceStatusService,
    @Optional() private readonly deviceRepo?: DeviceRepository
  ) {
    // 注册设备遥测定位上行回调监听
    this.messagingPort.onLocation(async ({ deviceNo, payload }) => {
      await this.handleLocationUplink(deviceNo, payload);
    });
  }

  /**
   * 处理设备端 GPS/GNSS 遥测定位上行
   */
  async handleLocationUplink(
    deviceNo: string,
    payload: TelemetryLocationPayload
  ): Promise<void> {
    // 1. 通过 deviceNo / deviceId 关联车辆信息
    let vehicle = await this.vehicleRepo.findByDeviceId(deviceNo);
    if (!vehicle && this.deviceStatusService) {
      const devState = this.deviceStatusService.getDevice(deviceNo);
      if (devState?.vehicleId) {
        const session = TenantContext.getOptional();
        if (session?.tenantId) {
          vehicle = await this.vehicleRepo.findById(devState.vehicleId);
        } else {
          for (const item of (this.vehicleRepo as any).items?.values() || []) {
            if (item.id === devState.vehicleId) {
              vehicle = item;
              break;
            }
          }
        }
      }
    }

    if (!vehicle) {
      return;
    }

    // 2. 注入车辆所属租户上下文，安全持久化位置与时序轨迹
    await TenantContext.run(
      { tenantId: vehicle.tenantId, userId: 'system' },
      async () => {
        await this.locationRepo.saveLocation(vehicle.id, payload);
      }
    );

    // 3. 向该车辆的 WebSocket 专属房间广播最新定位事件
    this.wsGateway.emitToVehicle(
      vehicle.id,
      WebSocketEvent.LOCATION_UPDATED,
      payload
    );
  }

  /**
   * 获取车辆最新位置（热数据）
   * 严格受调用方激活的 TenantContext 约束，禁止未授权跨租户提取
   */
  async getLatestLocation(
    vehicleId: string
  ): Promise<TelemetryLocationPayload | null> {
    return this.locationRepo.getLatestLocation(vehicleId);
  }

  /**
   * 查询车队全局车辆最新定位与工况列表
   * 严格受多租户上下文隔离约束，支持关键字、状态及低电压筛选
   */
  async getFleetLocations(
    query?: TelemetryFilterQuery,
    tenantId?: string
  ): Promise<VehicleLocationDto[]> {
    const effectiveTenantId =
      tenantId || TenantContext.getOptional()?.tenantId || 'TENANT_DEFAULT';

    return TenantContext.run(
      { tenantId: effectiveTenantId, userId: 'telemetry' },
      async () => {
        const vehicles = await this.vehicleRepo.findMany();

        // 当租户为 TENANT_DEFAULT 且未创建自定义车辆时，回退至内置标准车队种子
        if (vehicles.length === 0) {
          if (effectiveTenantId === 'TENANT_DEFAULT') {
            return filterVehicleLocations(SEED_FLEET_LOCATIONS, query);
          }
          return [];
        }

        const list: VehicleLocationDto[] = [];
        for (const v of vehicles) {
          const rawDevNo = (v as any).deviceNo || v.deviceId || `DEV_${v.id}`;
          let effectiveDeviceNo = rawDevNo;
          let dev = null;
          if (v.deviceId && this.deviceRepo) {
            dev = await this.deviceRepo.findById(v.deviceId);
            if (!dev) {
              dev = await this.deviceRepo.findByDeviceNo(v.deviceId);
            }
            if (dev) {
              effectiveDeviceNo = dev.deviceNo;
            }
          }

          const loc = await this.locationRepo.getLatestLocation(v.id);
          const devState = this.deviceStatusService?.getDevice(effectiveDeviceNo);
          const isOnline = devState
            ? this.deviceStatusService?.isOnline(effectiveDeviceNo)
            : dev
            ? dev.onlineStatus === DeviceOnlineStatus.ONLINE
            : (v as any).status === 'NORMAL';

          const speed =
            loc?.speed !== undefined ? loc.speed : isOnline ? 35 : 0;
          const voltage =
            devState?.batteryVoltage ??
            (loc as any)?.voltage ??
            (isOnline ? 12.6 : 11.1);

          let status: VehicleOnlineStatus = 'OFFLINE';
          if ((v as any).alarmCount > 0 || (loc as any)?.alarmCount > 0) {
            status = 'ALARM';
          } else if (isOnline) {
            status = 'ONLINE';
          }

          const lat =
            loc ? (loc.lat ?? (loc as any).latitude ?? 31.2304) : 31.2304;
          const lng =
            loc ? (loc.lng ?? (loc as any).longitude ?? 121.4737) : 121.4737;
          const timestamp = loc
            ? typeof loc.timestamp === 'number'
              ? loc.timestamp
              : new Date(loc.timestamp).getTime()
            : Date.now();

          list.push({
            vehicleId: v.id,
            plateNumber: v.plateNumber,
            vin: v.vin,
            brand: (v as any).brand || (v as any).brandName || '比亚迪',
            modelName: (v as any).modelName || (v as any).model || '汉EV',
            deviceNo: effectiveDeviceNo,
            coordinates: { lat, lng },
            altitude: loc?.altitude ?? 20,
            speed,
            heading: loc?.heading ?? 90,
            satellites: loc?.satellites ?? 12,
            gpsValid: loc?.gpsValid ?? true,
            timestamp,
            mileage: loc?.mileage ?? 25000,
            voltage,
            status,
            alarmCount:
              (v as any).alarmCount ??
              (loc as any)?.alarmCount ??
              (status === 'ALARM' ? 1 : 0),
            lastReportTime: new Date(timestamp).toISOString(),
            address: (loc as any)?.address ?? '上海市浦东新区张江高科技园区',
          });
        }

        return filterVehicleLocations(list, query);
      }
    );
  }

  /**
   * 查询车辆历史轨迹并使用 Douglas-Peucker 算法抽稀回放
   * 严格受调用方激活的 TenantContext 约束
   */
  async getTrajectory(
    vehicleId: string,
    start: Date,
    end: Date,
    tolerance?: number
  ): Promise<TelemetryLocationPayload[]> {
    const rawPoints = await this.locationRepo.getTrajectory(
      vehicleId,
      start,
      end
    );
    return douglasPeucker(rawPoints, tolerance);
  }
}
