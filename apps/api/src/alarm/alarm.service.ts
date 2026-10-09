import { Injectable, Inject, Optional, BadRequestException } from '@nestjs/common';
import {
  AlarmType,
  AlarmLevel,
  AlarmStatus,
  AlarmRecordDto,
  ProcessAlarmDto,
  AlarmFilterDto,
  UplinkAlarmPayload,
  WebSocketEvent,
} from '@car-control/contracts';
import { AlarmRecord } from '@car-control/domain-types';
import {
  AlarmRepository,
  VehicleRepository,
  TenantContext,
} from '@car-control/database';
import { MessagingPort } from '../messaging/messaging.port.js';
import { WebSocketGatewayService } from '../realtime/websocket.gateway.js';
import { AuditService } from '../audit/audit.service.js';
import { DeviceStatusService } from '../device/device-status.service.js';

export interface TriggerAlarmInput {
  vehicleId: string;
  alarmType: AlarmType;
  alarmLevel?: AlarmLevel;
  lat?: number;
  lng?: number;
  speed?: number;
  message?: string;
  deviceNo?: string;
  projectId?: string;
  tenantId?: string;
  timestamp?: number | Date;
}

/**
 * 车辆告警与安全监控服务
 * 负责接收设备 MQTT 告警上报、支持云端/围栏触发告警、WebSocket 全局与房间分发、
 * 告警处置全生命周期闭环流转，并严格保证多租户隔离与审计留痕。
 */
@Injectable()
export class AlarmService {
  constructor(
    private readonly alarmRepo: AlarmRepository,
    private readonly vehicleRepo: VehicleRepository,
    private readonly wsGateway: WebSocketGatewayService,
    private readonly auditService: AuditService,
    @Inject('MessagingPort') private readonly messagingPort: MessagingPort,
    @Optional() private readonly deviceStatusService?: DeviceStatusService
  ) {
    // 注册设备上行告警报文回调监听
    this.messagingPort.onAlarm(async ({ productKey, deviceNo, payload }) => {
      await this.handleAlarmUplink(productKey, deviceNo, payload);
    });
  }

  /**
   * 处理设备端 MQTT 上报的异常告警报文
   */
  async handleAlarmUplink(
    productKey: string,
    deviceNo: string,
    payload: UplinkAlarmPayload
  ): Promise<AlarmRecord | null> {
    // 1. 通过 deviceNo 关联车辆与所属租户
    let vehicle = await this.vehicleRepo.findByDeviceId(deviceNo);
    if (!vehicle && this.deviceStatusService) {
      const devState = this.deviceStatusService.getDevice(deviceNo);
      if (devState?.vehicleId) {
        vehicle = await this.vehicleRepo.findById(devState.vehicleId);
      }
    }

    if (!vehicle) {
      console.warn(`[AlarmService] Discarding uplink alarm: vehicle not found for deviceNo ${deviceNo}`);
      return null;
    }

    const alarmLevel = payload.alarmLevel ?? this.resolveDefaultAlarmLevel(payload.alarmType);
    const triggeredAt = payload.timestamp ? new Date(payload.timestamp) : new Date();

    // 2. 注入所属租户安全上下文，创建告警记录
    const alarm = await TenantContext.run(
      { tenantId: vehicle.tenantId, userId: 'system' },
      async () => {
        return this.alarmRepo.create({
          projectId: vehicle!.projectId,
          vehicleId: vehicle!.id,
          deviceNo,
          alarmType: payload.alarmType,
          alarmLevel,
          lat: payload.lat,
          lng: payload.lng,
          speed: payload.speed,
          status: AlarmStatus.PENDING,
          message: payload.message,
          triggeredAt,
        });
      }
    );

    // 3. 向该车辆 WebSocket 专属房间广播告警触发事件
    this.wsGateway.emitToVehicle(vehicle.id, WebSocketEvent.ALARM_TRIGGERED, alarm);

    return alarm;
  }

  /**
   * 编程式触发告警（供电子围栏引擎、安全检测规则或业务场景直接调用）
   */
  async triggerAlarm(input: TriggerAlarmInput): Promise<AlarmRecord> {
    const currentTenant = TenantContext.getOptional()?.tenantId;
    let targetTenantId = input.tenantId || currentTenant;
    let vehicle = null;

    if (targetTenantId) {
      vehicle = await TenantContext.run(
        { tenantId: targetTenantId, userId: 'system' },
        () => this.vehicleRepo.findById(input.vehicleId)
      );
    } else {
      // 在各租户空间检索匹配的车辆
      for (const item of (this.vehicleRepo as any).items?.values?.() || []) {
        if (item.id === input.vehicleId) {
          vehicle = item;
          targetTenantId = item.tenantId;
          break;
        }
      }
    }

    if (!targetTenantId) {
      throw new Error(`[AlarmService] Tenant context required or cannot be determined for vehicle: ${input.vehicleId}`);
    }

    const alarmLevel = input.alarmLevel ?? this.resolveDefaultAlarmLevel(input.alarmType);
    const triggeredAt = input.timestamp instanceof Date
      ? input.timestamp
      : (input.timestamp ? new Date(input.timestamp) : new Date());

    const record = await TenantContext.run(
      { tenantId: targetTenantId, userId: TenantContext.getOptional()?.userId || 'system' },
      async () => {
        return this.alarmRepo.create({
          projectId: input.projectId || vehicle?.projectId || 'default',
          vehicleId: input.vehicleId,
          deviceNo: input.deviceNo || vehicle?.deviceId || 'UNKNOWN',
          alarmType: input.alarmType,
          alarmLevel,
          lat: input.lat,
          lng: input.lng,
          speed: input.speed,
          status: AlarmStatus.PENDING,
          message: input.message,
          triggeredAt,
        });
      }
    );

    this.wsGateway.emitToVehicle(input.vehicleId, WebSocketEvent.ALARM_TRIGGERED, record);
    return record;
  }

  /**
   * 按条件分页/组合检索告警列表
   * 严格限定当前租户上下文
   */
  async listAlarms(
    filter?: AlarmFilterDto | { vehicleId?: string; status?: AlarmStatus }
  ): Promise<AlarmRecord[]> {
    return this.alarmRepo.list(filter);
  }

  /**
   * 获取单条告警详情
   * 严格限定当前租户上下文
   */
  async getAlarmById(id: string): Promise<AlarmRecord | null> {
    return this.alarmRepo.findById(id);
  }

  /**
   * 人工处置告警（确认处理 / 判定忽略）
   * 严格遵循不可逆终态保护拓扑，并留存审计日志
   */
  async processAlarm(
    id: string,
    dto: ProcessAlarmDto,
    operatorId?: string
  ): Promise<AlarmRecord> {
    const targetStatus = dto.status as AlarmStatus;
    if (targetStatus !== AlarmStatus.PROCESSED && targetStatus !== AlarmStatus.IGNORED) {
      throw new BadRequestException(
        `[AlarmService] Invalid target status: ${dto.status}. Only PROCESSED and IGNORED are allowed.`
      );
    }

    const effectiveOperator = operatorId || dto.operatorId || 'system';

    // 1. 调用仓储原子流转状态（内部检查终态防线与租户隔离）
    const updated = await this.alarmRepo.updateStatus(
      id,
      targetStatus,
      effectiveOperator,
      dto.remark
    );

    // 2. 广播 WebSocket ALARM_PROCESSED 事件
    this.wsGateway.emitToVehicle(updated.vehicleId, WebSocketEvent.ALARM_PROCESSED, updated);

    // 3. 记录安全操作审计日志
    this.auditService.logAction({
      tenantId: updated.tenantId,
      userId: effectiveOperator,
      action: 'ALARM_PROCESS',
      resourceType: 'ALARM',
      resourceId: updated.id,
      details: {
        newStatus: updated.status,
        remark: dto.remark,
        vehicleId: updated.vehicleId,
        alarmType: updated.alarmType,
      },
    });

    return updated;
  }

  /**
   * 根据告警类型映射默认严重级别
   */
  resolveDefaultAlarmLevel(alarmType: AlarmType): AlarmLevel {
    switch (alarmType) {
      case AlarmType.POWER_CUT:
      case AlarmType.SOS:
      case AlarmType.TOW_AWAY:
        return AlarmLevel.CRITICAL;
      case AlarmType.LOW_BATTERY:
      case AlarmType.OVERSPEED:
      case AlarmType.GEOFENCE_OUT:
        return AlarmLevel.WARNING;
      case AlarmType.VIBRATION:
      case AlarmType.GEOFENCE_IN:
        return AlarmLevel.INFO;
      default:
        return AlarmLevel.WARNING;
    }
  }
}
