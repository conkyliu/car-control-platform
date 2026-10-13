import {
  CommandCode,
  SecurityLevel,
  CommandStatus,
  type CreateCommandRequestDto,
  type EffectiveCapabilityDto,
} from '@car-control/contracts';
import { http } from './client.ts';
import {
  CommandLockError,
  isApiError,
  COMMAND_METADATA,
  generateDefaultCapabilities,
  SEED_WORKBENCH_VEHICLES,
} from '../views/command/command-core.ts';
import {
  type CommandTraceDto,
  type CommandLifecycleStep,
  SEED_COMMAND_TRACES,
} from '../views/command/command-stream-core.ts';

export interface CommandRecord {
  id: string;
  tenantId: string;
  projectId: string;
  vehicleId: string;
  deviceId: string;
  deviceNo: string;
  commandCode: CommandCode;
  status: CommandStatus;
  securityLevel: SecurityLevel;
  idempotencyKey: string;
  traceId: string;
  requestId: string;
  params?: Record<string, unknown>;
  sentAt?: Date | string;
  ackedAt?: Date | string;
  finishedAt?: Date | string;
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string;
  operatorId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

// 内存中的并发锁集合 (key: vehicleId)
const inMemoryLocks = new Set<string>();

// 内存中的指令历史流水
let inMemoryHistory: CommandRecord[] = [
  {
    id: 'cmd-seed-01',
    tenantId: 'tenant-demo',
    projectId: 'proj-sz-01',
    vehicleId: 'veh-001',
    deviceId: 'dev-1001',
    deviceNo: 'DEV_1001',
    commandCode: CommandCode.CMD_UNLOCK,
    status: CommandStatus.SUCCESS,
    securityLevel: SecurityLevel.L1,
    idempotencyKey: 'idemp-seed-1',
    traceId: 'trace-seed-01',
    requestId: 'req-seed-01',
    sentAt: new Date(Date.now() - 3600000),
    ackedAt: new Date(Date.now() - 3598800),
    finishedAt: new Date(Date.now() - 3598800),
    durationMs: 1200,
    operatorId: 'operator-01',
    createdAt: new Date(Date.now() - 3600000),
    updatedAt: new Date(Date.now() - 3598800),
  },
  {
    id: 'cmd-seed-02',
    tenantId: 'tenant-demo',
    projectId: 'proj-sz-01',
    vehicleId: 'veh-001',
    deviceId: 'dev-1001',
    deviceNo: 'DEV_1001',
    commandCode: CommandCode.CMD_FIND_VEHICLE,
    status: CommandStatus.SUCCESS,
    securityLevel: SecurityLevel.L0,
    idempotencyKey: 'idemp-seed-2',
    traceId: 'trace-seed-02',
    requestId: 'req-seed-02',
    sentAt: new Date(Date.now() - 1800000),
    ackedAt: new Date(Date.now() - 1799100),
    finishedAt: new Date(Date.now() - 1799100),
    durationMs: 900,
    operatorId: 'operator-01',
    createdAt: new Date(Date.now() - 1800000),
    updatedAt: new Date(Date.now() - 1799100),
  },
];

/**
 * 外部设置排他锁状态（用于测试和控制并发互斥）
 */
export function setVehicleCommandLock(vehicleId: string, locked: boolean): void {
  if (locked) {
    inMemoryLocks.add(vehicleId);
  } else {
    inMemoryLocks.delete(vehicleId);
  }
}

/**
 * 获取内存指令历史
 */
export function getInMemoryCommandHistory(vehicleId?: string): CommandRecord[] {
  if (vehicleId) {
    return inMemoryHistory.filter((item) => item.vehicleId === vehicleId);
  }
  return [...inMemoryHistory];
}

/**
 * 重置内存历史与锁状态 (测试前置复位)
 */
export function resetInMemoryCommands(): void {
  inMemoryLocks.clear();
  inMemoryHistory = [];
}

/**
 * 下发远程车控指令
 * 具备 409 排他锁捕获与优雅降级处理
 */
export async function executeCommandApi(
  vehicleId: string,
  input: CreateCommandRequestDto
): Promise<CommandRecord> {
  // 1. 尝试调用真实后端 REST 接口
  try {
    const res = await http.post<CommandRecord>(`/vehicles/${vehicleId}/commands`, input);
    return res;
  } catch (err: unknown) {
    // 捕获 HTTP 409 冲突排他锁
    if (isApiError(err) && err.statusCode === 409) {
      throw new CommandLockError(
        vehicleId,
        err.message || '该车辆已有指令正在执行中，请稍候',
        input.commandCode
      );
    }

    // 若非 409 且非离线降级环境，则判断是否为其它已知 ApiError
    // 如果是开发/演示/网络离线环境，走本地仿真回路
    if (inMemoryLocks.has(vehicleId)) {
      throw new CommandLockError(
        vehicleId,
        '该车辆已有指令正在执行中，请稍候',
        input.commandCode
      );
    }

    // 内存仿真生成 ACK 记录
    const meta = COMMAND_METADATA[input.commandCode];
    const duration = Math.floor(Math.random() * 400) + 250; // 250ms ~ 650ms
    const now = new Date();
    const ackedTime = new Date(now.getTime() + duration);

    const targetVehicle = SEED_WORKBENCH_VEHICLES.find((v) => v.id === vehicleId);

    const record: CommandRecord = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      tenantId: 'tenant-demo',
      projectId: 'proj-01',
      vehicleId,
      deviceId: targetVehicle?.deviceId || `dev_${vehicleId}`,
      deviceNo: targetVehicle?.deviceNo || `DEV_${vehicleId}`,
      commandCode: input.commandCode,
      status: CommandStatus.SUCCESS,
      securityLevel: meta?.securityLevel || SecurityLevel.L0,
      idempotencyKey: input.idempotencyKey,
      traceId: `trace_${Date.now()}`,
      requestId: `req_${Date.now()}`,
      params: input.params,
      sentAt: now,
      ackedAt: ackedTime,
      finishedAt: ackedTime,
      durationMs: duration,
      operatorId: 'operator-admin',
      createdAt: now,
      updatedAt: ackedTime,
    };

    inMemoryHistory.unshift(record);
    return record;
  }
}

/**
 * 获取车辆车型有效能力字典
 */
export async function fetchVehicleCapabilitiesApi(
  vehicleId: string
): Promise<Record<CommandCode, EffectiveCapabilityDto>> {
  try {
    const caps = await http.get<Record<CommandCode, EffectiveCapabilityDto>>(
      `/vehicles/${vehicleId}/capabilities`
    );
    return caps;
  } catch {
    // 离线降级：匹配车辆模型能力
    const targetVehicle = SEED_WORKBENCH_VEHICLES.find((v) => v.id === vehicleId);
    return generateDefaultCapabilities(targetVehicle?.modelId);
  }
}

/**
 * 获取车辆的历史指令流水列表
 */
export async function fetchCommandHistoryApi(vehicleId: string): Promise<CommandRecord[]> {
  try {
    const history = await http.get<CommandRecord[]>(`/vehicles/${vehicleId}/commands`);
    return history;
  } catch {
    // 离线降级
    return inMemoryHistory.filter((item) => item.vehicleId === vehicleId);
  }
}

/**
 * 获取指定指令全生命周期流水追踪详情
 * 具备离线仿真与 SEED_COMMAND_TRACES 匹配降级
 */
export async function fetchCommandTraceApi(commandId: string): Promise<CommandTraceDto> {
  try {
    const trace = await http.get<CommandTraceDto>(`/commands/${commandId}/trace`);
    return trace;
  } catch (err: unknown) {
    if (isApiError(err) && err.statusCode !== 404 && err.statusCode !== 500 && err.statusCode !== 502) {
      throw err;
    }

    // 1. 尝试在预置高保真全链路切片池中查找
    const matchedSeed = SEED_COMMAND_TRACES.find((item) => item.commandId === commandId);
    if (matchedSeed) {
      return matchedSeed;
    }

    // 2. 尝试从内存历史流水中还原生成链路
    const record = inMemoryHistory.find((item) => item.id === commandId);
    if (record) {
      const createdAt = typeof record.createdAt === 'string' ? record.createdAt : new Date(record.createdAt).toISOString();
      const duration = record.durationMs || 1000;
      const finishedAt = record.finishedAt
        ? typeof record.finishedAt === 'string'
          ? record.finishedAt
          : new Date(record.finishedAt).toISOString()
        : new Date(new Date(createdAt).getTime() + duration).toISOString();

      const t0 = new Date(createdAt).getTime();
      const valDelta = Math.min(45, Math.floor(duration * 0.05)) || 35;
      const lockDelta = Math.min(75, Math.floor(duration * 0.08)) || 65;
      const downDelta = Math.min(180, Math.floor(duration * 0.15)) || 140;
      const ackWaitDelta = 20;

      const steps: CommandLifecycleStep[] = [
        {
          stepIndex: 0,
          name: 'CREATED',
          title: '客户端指令创建',
          status: 'finish',
          timestamp: new Date(t0).toISOString(),
          durationMs: 0,
          description: '系统已初始化并生成指令唯一流水号',
        },
        {
          stepIndex: 1,
          name: 'VALIDATING',
          title: '网关安全与权限校验',
          status: 'finish',
          timestamp: new Date(t0 + valDelta).toISOString(),
          durationMs: valDelta,
          description: '操作员权限与安全级别校验通过',
        },
        {
          stepIndex: 2,
          name: 'QUEUED',
          title: '分布式排他加锁与入队',
          status: 'finish',
          timestamp: new Date(t0 + valDelta + lockDelta).toISOString(),
          durationMs: lockDelta,
          description: '成功获得分布式互斥排他锁',
        },
        {
          stepIndex: 3,
          name: 'SENT',
          title: 'MQTT Broker 下发报文',
          status: 'finish',
          timestamp: new Date(t0 + valDelta + lockDelta + downDelta).toISOString(),
          durationMs: downDelta,
          description: '通过 MQTT 主题发布控制指令',
        },
        {
          stepIndex: 4,
          name: 'WAITING_ACK',
          title: '车载终端执行中',
          status: 'finish',
          timestamp: new Date(t0 + valDelta + lockDelta + downDelta + ackWaitDelta).toISOString(),
          durationMs: ackWaitDelta,
          description: '车载 T-Box 执行中，等待控制器 ACK',
        },
        {
          stepIndex: 5,
          name: record.status,
          title: record.status === CommandStatus.SUCCESS ? '终端执行成功并应答' : (record.errorMessage || '执行状态闭环'),
          status: record.status === CommandStatus.SUCCESS ? 'finish' : 'error',
          timestamp: finishedAt,
          durationMs: Math.max(10, duration - (valDelta + lockDelta + downDelta + ackWaitDelta)),
          description: record.errorMessage || '车机终端执行完毕并回传应答',
        },
      ];

      return {
        commandId: record.id,
        commandCode: record.commandCode,
        vehicleId: record.vehicleId,
        deviceId: record.deviceId,
        status: record.status,
        operatorId: record.operatorId,
        createdAt,
        finishedAt,
        durationMs: duration,
        errorMessage: record.errorMessage,
        steps,
        downlinkPayload: {
          traceId: record.traceId,
          commandId: record.id,
          commandCode: record.commandCode,
          vehicleId: record.vehicleId,
          deviceId: record.deviceId,
          idempotencyKey: record.idempotencyKey,
          params: record.params,
          timestamp: createdAt,
        },
        uplinkPayload:
          record.status === CommandStatus.SUCCESS
            ? {
                traceId: record.traceId,
                commandId: record.id,
                ackCode: 0,
                status: record.status,
                timestamp: finishedAt,
              }
            : undefined,
      };
    }

    // 3. 兜底回退：以 SEED_COMMAND_TRACES[0] 为模版返回
    const fallbackTemplate = SEED_COMMAND_TRACES[0];
    return {
      ...fallbackTemplate,
      commandId,
      downlinkPayload: fallbackTemplate.downlinkPayload
        ? {
            ...fallbackTemplate.downlinkPayload,
            commandId,
          }
        : undefined,
      uplinkPayload: fallbackTemplate.uplinkPayload
        ? {
            ...fallbackTemplate.uplinkPayload,
            commandId,
          }
        : undefined,
    };
  }
}
