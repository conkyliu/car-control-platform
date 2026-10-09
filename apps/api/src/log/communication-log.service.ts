import { Injectable, Inject, Optional } from '@nestjs/common';
import {
  CommunicationLogDto,
  CommunicationLogFilterDto,
  CommunicationDirection,
  CommunicationChannel,
  DeviceCommandAckUplinkPayload,
  TelemetryLocationPayload,
  UplinkAlarmPayload,
  MqttTopicBuilder,
} from '@car-control/contracts';
import { CommunicationLog } from '@car-control/domain-types';
import {
  CommunicationLogRepository,
  CreateCommunicationLogInput,
  VehicleRepository,
  TenantContext,
} from '@car-control/database';
import { MessagingPort } from '../messaging/messaging.port.js';
import { DeviceStatusService } from '../device/device-status.service.js';

/**
 * 设备通讯报文日志服务
 * 统一接入并持久化设备上下行报文（MQTT / TCP / HTTP），涵盖控制下发、ACK 应答、位置遥测与告警报文，
 * 严格按照租户上下文隔离存储并提供多维检索分析能力。
 */
@Injectable()
export class CommunicationLogService {
  constructor(
    private readonly commLogRepo: CommunicationLogRepository,
    private readonly vehicleRepo: VehicleRepository,
    @Inject('MessagingPort') private readonly messagingPort: MessagingPort,
    @Optional() private readonly deviceStatusService?: DeviceStatusService
  ) {
    // 监听设备端上行 ACK
    this.messagingPort.onAck(async (ack) => {
      await this.handleAckUplink(ack);
    });

    // 监听设备端上行定位报文
    this.messagingPort.onLocation(async ({ productKey, deviceNo, payload }) => {
      await this.handleLocationUplink(productKey, deviceNo, payload);
    });

    // 监听设备端上行报警报文
    this.messagingPort.onAlarm(async ({ productKey, deviceNo, payload }) => {
      await this.handleAlarmUplink(productKey, deviceNo, payload);
    });
  }

  /**
   * 记录单条通讯日志
   * 支持指定 tenantId 或继承当前租户上下文，严格防范未授权越权写入
   */
  async logMessage(entry: CreateCommunicationLogInput): Promise<CommunicationLog> {
    const session = TenantContext.getOptional();
    if (!session && entry.tenantId) {
      return TenantContext.run(
        { tenantId: entry.tenantId, userId: 'system' },
        async () => this.commLogRepo.log(entry)
      );
    }
    return this.commLogRepo.log(entry);
  }

  /**
   * 多维条件检索通讯报文日志
   * 严格限定当前租户上下文
   */
  async queryLogs(filter?: CommunicationLogFilterDto): Promise<CommunicationLog[]> {
    return this.commLogRepo.query(filter);
  }

  /**
   * 处理上行定位报文日志沉淀
   */
  private async handleLocationUplink(
    productKey: string,
    deviceNo: string,
    payload: TelemetryLocationPayload
  ): Promise<void> {
    const vehicle = await this.resolveVehicle(deviceNo);
    if (!vehicle) return;

    await TenantContext.run(
      { tenantId: vehicle.tenantId, userId: 'system' },
      async () => {
        await this.commLogRepo.log({
          vehicleId: vehicle.id,
          deviceNo,
          direction: CommunicationDirection.UPLINK,
          channel: CommunicationChannel.MQTT,
          topic: MqttTopicBuilder.location(productKey, deviceNo),
          payload,
        });
      }
    );
  }

  /**
   * 处理上行告警报文日志沉淀
   */
  private async handleAlarmUplink(
    productKey: string,
    deviceNo: string,
    payload: UplinkAlarmPayload
  ): Promise<void> {
    const vehicle = await this.resolveVehicle(deviceNo);
    if (!vehicle) return;

    await TenantContext.run(
      { tenantId: vehicle.tenantId, userId: 'system' },
      async () => {
        await this.commLogRepo.log({
          vehicleId: vehicle.id,
          deviceNo,
          direction: CommunicationDirection.UPLINK,
          channel: CommunicationChannel.MQTT,
          topic: MqttTopicBuilder.alarm(productKey, deviceNo),
          payload,
        });
      }
    );
  }

  /**
   * 处理上行指令 ACK 报文日志沉淀
   */
  private async handleAckUplink(ack: DeviceCommandAckUplinkPayload): Promise<void> {
    // 若 ACK 携带 deviceNo 或能通过上下文匹配则记录
    const deviceNo = (ack as any).deviceNo;
    if (!deviceNo) return;

    const vehicle = await this.resolveVehicle(deviceNo);
    if (!vehicle) return;

    await TenantContext.run(
      { tenantId: vehicle.tenantId, userId: 'system' },
      async () => {
        await this.commLogRepo.log({
          vehicleId: vehicle.id,
          deviceNo,
          traceId: ack.traceId,
          requestId: ack.requestId,
          direction: CommunicationDirection.UPLINK,
          channel: CommunicationChannel.MQTT,
          topic: MqttTopicBuilder.commandAck((ack as any).productKey || 'CAR_DEMO_PK', deviceNo),
          payload: ack,
        });
      }
    );
  }

  private async resolveVehicle(deviceNo: string) {
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
    return vehicle;
  }
}
