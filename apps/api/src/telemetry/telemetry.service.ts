import { Injectable, Inject, Optional } from '@nestjs/common';
import {
  TelemetryLocationPayload,
  WebSocketEvent,
} from '@car-control/contracts';
import {
  LocationRepository,
  VehicleRepository,
  TenantContext,
} from '@car-control/database';
import { MessagingPort } from '../messaging/messaging.port.js';
import { WebSocketGatewayService } from '../realtime/websocket.gateway.js';
import { DeviceStatusService } from '../device/device-status.service.js';
import { GeofenceService } from './geofence.service.js';
import { douglasPeucker } from './douglas-peucker.js';

@Injectable()
export class TelemetryService {
  constructor(
    private readonly locationRepo: LocationRepository,
    private readonly vehicleRepo: VehicleRepository,
    private readonly wsGateway: WebSocketGatewayService,
    private readonly geofenceService: GeofenceService,
    @Inject('MessagingPort') private readonly messagingPort: MessagingPort,
    @Optional() private readonly deviceStatusService?: DeviceStatusService
  ) {
    // 注册设备遥测定位上行回调监听
    this.messagingPort.onLocation(async ({ deviceNo, payload }) => {
      await this.handleLocationUplink(deviceNo, payload);
    });
  }

  /**
   * 处理设备端 GPS/GNSS 遥测定位上行
   */
  async handleLocationUplink(deviceNo: string, payload: TelemetryLocationPayload): Promise<void> {
    // 1. 通过 deviceNo / deviceId 关联车辆信息
    let vehicle = await this.vehicleRepo.findByDeviceId(deviceNo);
    if (!vehicle && this.deviceStatusService) {
      const devState = this.deviceStatusService.getDevice(deviceNo);
      if (devState?.vehicleId) {
        vehicle = await this.vehicleRepo.findById(devState.vehicleId);
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
    this.wsGateway.emitToVehicle(vehicle.id, WebSocketEvent.LOCATION_UPDATED, payload);
  }

  /**
   * 获取车辆最新位置（热数据）
   */
  async getLatestLocation(vehicleId: string): Promise<TelemetryLocationPayload | null> {
    const session = TenantContext.getOptional();
    if (session?.tenantId) {
      return this.locationRepo.getLatestLocation(vehicleId);
    }

    // 若无外层租户上下文，则通过 vehicleId 解析所属租户
    const vehicle = await this.vehicleRepo.findById(vehicleId);
    if (!vehicle) {
      return null;
    }

    return TenantContext.run(
      { tenantId: vehicle.tenantId, userId: 'system' },
      async () => {
        return this.locationRepo.getLatestLocation(vehicleId);
      }
    );
  }

  /**
   * 查询车辆历史轨迹并使用 Douglas-Peucker 算法抽稀回放
   */
  async getTrajectory(
    vehicleId: string,
    start: Date,
    end: Date,
    tolerance?: number
  ): Promise<TelemetryLocationPayload[]> {
    const session = TenantContext.getOptional();
    let rawPoints: TelemetryLocationPayload[];

    if (session?.tenantId) {
      rawPoints = await this.locationRepo.getTrajectory(vehicleId, start, end);
    } else {
      const vehicle = await this.vehicleRepo.findById(vehicleId);
      if (!vehicle) {
        return [];
      }
      rawPoints = await TenantContext.run(
        { tenantId: vehicle.tenantId, userId: 'system' },
        async () => {
          return this.locationRepo.getTrajectory(vehicleId, start, end);
        }
      );
    }

    // 执行 Douglas-Peucker 抽稀
    return douglasPeucker(rawPoints, tolerance);
  }
}
