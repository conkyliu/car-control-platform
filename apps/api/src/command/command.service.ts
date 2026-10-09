import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  CommandCode,
  CommandStatus,
  canTransitionStatus,
  isTerminalStatus,
  COMMAND_DEFINITIONS,
  WebSocketEvent,
  DeviceCommandAckUplinkPayload,
  DeviceCommandDownlinkPayload,
} from '@car-control/contracts';
import { CommandRecord } from '@car-control/domain-types';
import { VehicleRepository } from '@car-control/database';
import { MessagingPort } from '../messaging/messaging.port.js';
import { DeviceStatusService } from '../device/device-status.service.js';
import { WebSocketGatewayService } from '../realtime/websocket.gateway.js';
import { CapabilityEngine } from '../capability/capability.engine.js';
import { ControlSecurityService } from '../security/control-security.service.js';
import { AuditService } from '../audit/audit.service.js';

export interface ExecuteCommandInput {
  tenantId: string;
  projectId?: string;
  vehicleId: string;
  deviceNo?: string;
  productKey?: string;
  commandCode: CommandCode;
  idempotencyKey: string;
  operatorId: string;
  securityCode?: string;
  confirmationToken?: string;
  params?: Record<string, unknown>;
  customTimeoutMs?: number;
}

@Injectable()
export class CommandService {
  private commandStore: Map<string, CommandRecord> = new Map();
  private idempotencyIndex: Map<string, string> = new Map(); // idempotencyKey -> commandId
  private timeoutTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    @Inject('MessagingPort') private readonly messagingPort: MessagingPort,
    private readonly deviceStatusService: DeviceStatusService,
    private readonly wsGateway: WebSocketGatewayService,
    @Optional() private readonly capabilityEngine?: CapabilityEngine,
    @Optional() private readonly securityService?: ControlSecurityService,
    @Optional() private readonly vehicleRepo?: VehicleRepository,
    @Optional() private readonly auditService?: AuditService
  ) {
    // 监听设备上行 ACK 报文
    this.messagingPort.onAck((ack) => {
      this.handleAck(ack);
    });

    // 监听设备状态与心跳
    this.messagingPort.onHeartbeat((hb) => {
      this.deviceStatusService.recordHeartbeat(hb.deviceNo, hb.timestamp);
    });

    this.messagingPort.onStatus((st) => {
      this.deviceStatusService.setOnlineStatus(st.deviceNo, st.online);
    });
  }

  /**
   * 创建并下发控车指令 (12 步安全流水线)
   */
  async executeCommand(input: ExecuteCommandInput): Promise<CommandRecord> {
    // 1. 客户端幂等校验 (防重发)
    const existingCommandId = this.idempotencyIndex.get(input.idempotencyKey);
    if (existingCommandId) {
      const existing = this.commandStore.get(existingCommandId);
      if (existing) {
        return existing;
      }
    }

    const meta = COMMAND_DEFINITIONS[input.commandCode];
    if (!meta) {
      throw new BadRequestException(`Unsupported command code: ${input.commandCode}`);
    }

    // 2. 车辆信息与绑定关系检查
    let deviceNo = input.deviceNo;
    let productKey = input.productKey || 'CAR_DEMO_PK';
    let projectId = input.projectId || 'proj_default';

    if (this.vehicleRepo) {
      const vehicle = await this.vehicleRepo.findById(input.vehicleId);
      if (vehicle) {
        projectId = vehicle.projectId;
        if (!deviceNo && vehicle.deviceId) {
          deviceNo = vehicle.deviceId;
        }

        // 3. 车辆运营风控状态检查 (MAINTENANCE, LOCKED)
        if (this.securityService) {
          this.securityService.checkVehicleOperatingState(vehicle, input.commandCode);
        }
      }
    }

    if (!deviceNo) {
      deviceNo = `TBOX_${input.vehicleId}`;
    }

    // 4. 三级能力继承生效检查 (Capability Engine)
    let effectiveSecurityLevel = meta.defaultSecurityLevel;
    let effectiveTimeoutMs = meta.defaultTimeoutMs;
    let effectiveLimitSeconds = 5;

    if (this.capabilityEngine) {
      const effective = await this.capabilityEngine.resolveEffective(input.vehicleId, input.commandCode);
      if (!effective.supported) {
        throw new BadRequestException(
          `Command ${input.commandCode} is not supported for vehicle ${input.vehicleId} (Reason: ${effective.reason || 'UNSUPPORTED'})`
        );
      }
      effectiveSecurityLevel = effective.securityLevel;
      effectiveTimeoutMs = effective.timeoutMs;
      effectiveLimitSeconds = effective.frequencyLimitSeconds;
    }

    // 5. 滑动窗口频次限流检查 (Rate Limiting)
    if (this.securityService) {
      this.securityService.checkRateLimit(input.vehicleId, input.commandCode, effectiveLimitSeconds);
    }

    // 6. 控车安全等级检查 (L0 / L1 安全码 / L2 强确认)
    if (this.securityService) {
      this.securityService.verifySecurityLevel(
        effectiveSecurityLevel,
        input.securityCode,
        input.confirmationToken
      );
      this.securityService.recordRateLimit(input.vehicleId, input.commandCode);
    }

    const commandId = `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const traceId = `trace_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // 7. 初始记录 (CREATED)
    const record: CommandRecord = {
      id: commandId,
      tenantId: input.tenantId,
      projectId,
      vehicleId: input.vehicleId,
      deviceId: deviceNo,
      deviceNo,
      commandCode: input.commandCode,
      status: CommandStatus.CREATED,
      securityLevel: effectiveSecurityLevel,
      idempotencyKey: input.idempotencyKey,
      traceId,
      requestId,
      params: input.params,
      operatorId: input.operatorId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.commandStore.set(commandId, record);
    this.idempotencyIndex.set(input.idempotencyKey, commandId);

    // 8. 校验设备是否在线
    if (!this.deviceStatusService.isOnline(deviceNo)) {
      this.transitionStatus(record, CommandStatus.VALIDATING);
      this.transitionStatus(record, CommandStatus.FAILED, 'DEVICE_OFFLINE', 'Device is currently offline');
      this.wsGateway.emitToVehicle(record.vehicleId, WebSocketEvent.COMMAND_FAILED, record);
      return record;
    }

    // 9. 状态机流转: CREATED -> VALIDATING -> QUEUED -> SENDING -> SENT -> WAITING_ACK
    this.transitionStatus(record, CommandStatus.VALIDATING);
    this.transitionStatus(record, CommandStatus.QUEUED);
    this.transitionStatus(record, CommandStatus.SENDING);

    const downlink: DeviceCommandDownlinkPayload = {
      traceId,
      requestId,
      commandId,
      commandCode: input.commandCode,
      timestamp: Date.now(),
      params: input.params,
    };

    // 10. 消息层直通下发
    await this.messagingPort.publishCommand(productKey, deviceNo, downlink);
    record.sentAt = new Date();
    this.transitionStatus(record, CommandStatus.SENT);
    this.wsGateway.emitToVehicle(record.vehicleId, WebSocketEvent.COMMAND_SENT, record);

    this.transitionStatus(record, CommandStatus.WAITING_ACK);

    // 11. 注册超时定时器
    const timeoutMs = input.customTimeoutMs ?? effectiveTimeoutMs;
    const timer = setTimeout(() => {
      this.handleTimeout(commandId);
    }, timeoutMs);
    this.timeoutTimers.set(commandId, timer);

    // 12. 审计日志
    if (this.auditService) {
      this.auditService.logAction({
        tenantId: input.tenantId,
        userId: input.operatorId,
        action: 'COMMAND_DISPATCH',
        resourceType: 'COMMAND',
        resourceId: commandId,
        traceId,
        details: { commandCode: input.commandCode, vehicleId: input.vehicleId, deviceNo },
      });
    }

    return record;
  }

  /**
   * 处理设备端异步 ACK 应答
   */
  handleAck(ack: DeviceCommandAckUplinkPayload): void {
    const record = this.commandStore.get(ack.commandId);
    if (!record) {
      console.warn(`[CommandService] Received ACK for unknown commandId: ${ack.commandId}`);
      return;
    }

    // 防重防迟到保护：终态指令不可逆
    if (isTerminalStatus(record.status)) {
      console.warn(
        `[CommandService] Ignored ACK for terminal command: ${record.id}, current status: ${record.status}, ack code: ${ack.code}`
      );
      return;
    }

    // 清除超时定时器
    const timer = this.timeoutTimers.get(record.id);
    if (timer) {
      clearTimeout(timer);
      this.timeoutTimers.delete(record.id);
    }

    record.ackedAt = new Date();
    record.finishedAt = new Date();

    if (ack.code === 0) {
      this.transitionStatus(record, CommandStatus.SUCCESS);
      this.wsGateway.emitToVehicle(record.vehicleId, WebSocketEvent.COMMAND_SUCCESS, record);
    } else if (ack.code === 1001) {
      this.transitionStatus(record, CommandStatus.DEVICE_REJECTED, 'DEVICE_REJECTED', ack.message);
      this.wsGateway.emitToVehicle(record.vehicleId, WebSocketEvent.COMMAND_REJECTED, record);
    } else {
      this.transitionStatus(record, CommandStatus.FAILED, 'DEVICE_FAILED', ack.message);
      this.wsGateway.emitToVehicle(record.vehicleId, WebSocketEvent.COMMAND_FAILED, record);
    }

    if (this.auditService) {
      this.auditService.logAction({
        tenantId: record.tenantId,
        userId: record.operatorId,
        action: 'COMMAND_ACK',
        resourceType: 'COMMAND',
        resourceId: record.id,
        traceId: record.traceId,
        details: { status: record.status, code: ack.code, message: ack.message },
      });
    }
  }

  /**
   * 处理超时未应答
   */
  handleTimeout(commandId: string): void {
    const record = this.commandStore.get(commandId);
    if (!record) return;

    this.timeoutTimers.delete(commandId);

    if (record.status === CommandStatus.WAITING_ACK) {
      this.transitionStatus(record, CommandStatus.TIMEOUT, 'TIMEOUT', 'Device response timed out');
      record.finishedAt = new Date();
      this.wsGateway.emitToVehicle(record.vehicleId, WebSocketEvent.COMMAND_TIMEOUT, record);

      if (this.auditService) {
        this.auditService.logAction({
          tenantId: record.tenantId,
          userId: record.operatorId,
          action: 'COMMAND_TIMEOUT',
          resourceType: 'COMMAND',
          resourceId: record.id,
          traceId: record.traceId,
        });
      }
    }
  }

  /**
   * 获取单条指令详情
   */
  getCommand(commandId: string): CommandRecord {
    const record = this.commandStore.get(commandId);
    if (!record) {
      throw new NotFoundException(`Command with id ${commandId} not found`);
    }
    return record;
  }

  private transitionStatus(
    record: CommandRecord,
    nextStatus: CommandStatus,
    errorCode?: string,
    errorMessage?: string
  ): void {
    if (!canTransitionStatus(record.status, nextStatus)) {
      throw new BadRequestException(
        `Invalid status transition: cannot transition from ${record.status} to ${nextStatus}`
      );
    }
    record.status = nextStatus;
    if (errorCode) record.errorCode = errorCode;
    if (errorMessage) record.errorMessage = errorMessage;
    record.updatedAt = new Date();
  }
}
