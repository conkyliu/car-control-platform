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
