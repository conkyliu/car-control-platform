import { CommandCode, CommandStatus, SecurityLevel } from '@car-control/contracts';

export { CommandCode, CommandStatus, SecurityLevel };

export interface CommandLifecycleStep {
  stepIndex: number;
  name: string;
  title: string;
  status: 'finish' | 'process' | 'error' | 'wait';
  timestamp: string;
  durationMs?: number;
  description?: string;
  metadata?: Record<string, unknown>;
}

export type LatencySlaLevel = 'NORMAL' | 'WARNING' | 'CRITICAL';

export interface TimingSegment {
  key: string;
  label: string;
  durationMs: number;
  percentage: number;
  color: string;
}

export interface StepTimingBreakdown {
  totalDurationMs: number;
  slaLevel: LatencySlaLevel;
  slaText: string;
  slaColor: string;
  segments: TimingSegment[];
  validationDurationMs: number;
  lockingDurationMs: number;
  downlinkDurationMs: number;
  ackDurationMs: number;
}

export interface CommandLockDetails {
  isConflict: boolean;
  lockKey: string;
  holderCommandId?: string;
  ttlSeconds?: number;
  waitSuggestion: string;
  rawMessage?: string;
}

export interface CommandTraceDto {
  commandId: string;
  commandCode: CommandCode;
  vehicleId: string;
  deviceId: string;
  status: CommandStatus;
  operatorId: string;
  createdAt: string;
  finishedAt?: string;
  durationMs?: number;
  errorMessage?: string;
  steps: CommandLifecycleStep[];
  downlinkPayload?: Record<string, unknown>;
  uplinkPayload?: Record<string, unknown>;
  lockDetails?: CommandLockDetails;
}

export interface CommandStepIndexResult {
  stepIndex: number;
  stepStatus: 'finish' | 'process' | 'error' | 'wait';
  title: string;
  description: string;
  isTerminal: boolean;
  isError: boolean;
}

/**
 * 11 步有限状态机 (FSM) 映射纯函数
 * 将 CommandStatus 映射至 6 个核心交互步骤节点 (0 ~ 5)
 */
export function getCommandStatusStepIndex(status: CommandStatus): CommandStepIndexResult {
  switch (status) {
    case CommandStatus.CREATED:
      return {
        stepIndex: 0,
        stepStatus: 'process',
        title: '客户端指令创建 (CREATED)',
        description: '指令已在后台初始化，生成全局唯一追踪链路 TraceID 与幂等凭证',
        isTerminal: false,
        isError: false,
      };

    case CommandStatus.VALIDATING:
      return {
        stepIndex: 1,
        stepStatus: 'process',
        title: '网关安全与权限校验 (VALIDATING)',
        description: '核验操作员权限、车辆在线工况及 L1/L2 安全控制码',
        isTerminal: false,
        isError: false,
      };

    case CommandStatus.QUEUED:
      return {
        stepIndex: 2,
        stepStatus: 'process',
        title: '分布式排他加锁与排队 (QUEUED)',
        description: '获取车辆级独占互斥锁 lock:cmd:vehicle，防止高并发指令风暴',
        isTerminal: false,
        isError: false,
      };

    case CommandStatus.SENDING:
      return {
        stepIndex: 3,
        stepStatus: 'process',
        title: 'MQTT Broker 下发中 (SENDING)',
        description: '指令正通过 MQTT 下行链路向目标车载 T-Box 发布',
        isTerminal: false,
        isError: false,
      };

    case CommandStatus.SENT:
      return {
        stepIndex: 3,
        stepStatus: 'finish',
        title: 'MQTT Broker 下发完成 (SENT)',
        description: 'MQTT 下行报文推送成功，网络层已确认送达车载设备监听通道',
        isTerminal: false,
        isError: false,
      };

    case CommandStatus.WAITING_ACK:
      return {
        stepIndex: 4,
        stepStatus: 'process',
        title: '车载终端执行与等待应答 (WAITING_ACK)',
        description: '车载 T-Box 控制器正在执行 CAN 总线动作并等待传感器闭环反馈',
        isTerminal: false,
        isError: false,
      };

    case CommandStatus.SUCCESS:
      return {
        stepIndex: 5,
        stepStatus: 'finish',
        title: '指令执行成功 (SUCCESS)',
        description: '车载终端已成功执行并回传确认报文 (ACK)',
        isTerminal: true,
        isError: false,
      };

    case CommandStatus.DEVICE_REJECTED:
      return {
        stepIndex: 5,
        stepStatus: 'error',
        title: '车机终端拒绝执行 (DEVICE_REJECTED)',
        description: '车身控制器安全互锁逻辑判定不满足执行前提（如挡位非P档）',
        isTerminal: true,
        isError: true,
      };

    case CommandStatus.TIMEOUT:
      return {
        stepIndex: 5,
        stepStatus: 'error',
        title: '指令执行超时失效 (TIMEOUT)',
        description: '超过设定超时阈值仍未收到车机 ACK 应答报文',
        isTerminal: true,
        isError: true,
      };

    case CommandStatus.FAILED:
      return {
        stepIndex: 5,
        stepStatus: 'error',
        title: '指令下发或执行失败 (FAILED)',
        description: '网络链路异常、报文解析错误或加锁排他冲突拦截',
        isTerminal: true,
        isError: true,
      };

    case CommandStatus.CANCELLED:
      return {
        stepIndex: 5,
        stepStatus: 'error',
        title: '指令已被主动撤销 (CANCELLED)',
        description: '操作员或系统安全调度策略主动取消指令执行',
        isTerminal: true,
        isError: true,
      };

    case CommandStatus.EXPIRED:
      return {
        stepIndex: 5,
        stepStatus: 'error',
        title: '指令队列排队超时 (EXPIRED)',
        description: '指令在排队等待锁时超过最大队列 TTL 窗口',
        isTerminal: true,
        isError: true,
      };

    default:
      return {
        stepIndex: 0,
        stepStatus: 'wait',
        title: String(status),
        description: '未知状态机阶段',
        isTerminal: false,
        isError: false,
      };
  }
}

/**
 * 时延切片计算纯函数
 * 精确计算校验耗时、排他加锁耗时、下行传输耗时与车机执行 ACK 往返耗时
 */
export function calculateStepTimings(steps: CommandLifecycleStep[]): StepTimingBreakdown {
  if (!steps || steps.length === 0) {
    return {
      totalDurationMs: 0,
      slaLevel: 'NORMAL',
      slaText: '优 (健康)',
      slaColor: '#52c41a',
      segments: [
        { key: 'validation', label: '网关校验', durationMs: 0, percentage: 25, color: '#1677ff' },
        { key: 'locking', label: '排他加锁', durationMs: 0, percentage: 25, color: '#722ed1' },
        { key: 'downlink', label: '下行发布', durationMs: 0, percentage: 25, color: '#13c2c2' },
        { key: 'ack', label: '终端及ACK', durationMs: 0, percentage: 25, color: '#52c41a' },
      ],
      validationDurationMs: 0,
      lockingDurationMs: 0,
      downlinkDurationMs: 0,
      ackDurationMs: 0,
    };
  }

  // 1. 尝试从步骤时间戳计算
  const t0 = new Date(steps[0].timestamp).getTime();
  const tEnd = new Date(steps[steps.length - 1].timestamp).getTime();
  let totalDurationMs = Math.max(0, tEnd - t0);

  // 2. 细分各阶段耗时
  const stepMap = new Map<number, CommandLifecycleStep>();
  steps.forEach((s) => {
    stepMap.set(s.stepIndex, s);
  });

  const step0 = stepMap.get(0) || steps[0];
  const step1 = stepMap.get(1);
  const step2 = stepMap.get(2);
  const step3 = stepMap.get(3);
  const step4 = stepMap.get(4);
  const step5 = stepMap.get(5) || steps[steps.length - 1];

  let validationDurationMs = 0;
  let lockingDurationMs = 0;
  let downlinkDurationMs = 0;
  let ackDurationMs = 0;

  if (step1) {
    if (typeof step1.durationMs === 'number' && step1.durationMs > 0) {
      validationDurationMs = step1.durationMs;
    } else {
      validationDurationMs = Math.max(0, new Date(step1.timestamp).getTime() - new Date(step0.timestamp).getTime());
    }
  }

  if (step2 && step1) {
    if (typeof step2.durationMs === 'number' && step2.durationMs > 0) {
      lockingDurationMs = step2.durationMs;
    } else {
      lockingDurationMs = Math.max(0, new Date(step2.timestamp).getTime() - new Date(step1.timestamp).getTime());
    }
  }

  if (step3 && step2) {
    if (typeof step3.durationMs === 'number' && step3.durationMs > 0) {
      downlinkDurationMs = step3.durationMs;
    } else {
      downlinkDurationMs = Math.max(0, new Date(step3.timestamp).getTime() - new Date(step2.timestamp).getTime());
    }
  }

  if (step5 && step3) {
    // 包含 step4 和 step5 的总耗时
    if (typeof step4?.durationMs === 'number' && typeof step5?.durationMs === 'number') {
      ackDurationMs = step4.durationMs + step5.durationMs;
    } else {
      ackDurationMs = Math.max(0, new Date(step5.timestamp).getTime() - new Date(step3.timestamp).getTime());
    }
  } else if (step4 && step3) {
    ackDurationMs = Math.max(0, new Date(step4.timestamp).getTime() - new Date(step3.timestamp).getTime());
  }

  // 若仅有部分节点，且有总耗时
  const sumDeltas = validationDurationMs + lockingDurationMs + downlinkDurationMs + ackDurationMs;
  if (sumDeltas > 0 && totalDurationMs === 0) {
    totalDurationMs = sumDeltas;
  } else if (totalDurationMs > 0 && sumDeltas === 0) {
    ackDurationMs = totalDurationMs;
  }

  // 计算百分比
  let valPct = 0;
  let lockPct = 0;
  let downPct = 0;
  let ackPct = 0;

  if (totalDurationMs > 0) {
    valPct = Number(((validationDurationMs / totalDurationMs) * 100).toFixed(1));
    lockPct = Number(((lockingDurationMs / totalDurationMs) * 100).toFixed(1));
    downPct = Number(((downlinkDurationMs / totalDurationMs) * 100).toFixed(1));
    ackPct = Number((100 - valPct - lockPct - downPct).toFixed(1));
  } else {
    valPct = 25;
    lockPct = 25;
    downPct = 25;
    ackPct = 25;
  }

  // 评定 SLA 健康等级
  let slaLevel: LatencySlaLevel = 'NORMAL';
  let slaText = '优 (响应健康)';
  let slaColor = '#52c41a';

  if (totalDurationMs > 3000) {
    slaLevel = 'CRITICAL';
    slaText = '差 (延迟过高)';
    slaColor = '#ff4d4f';
  } else if (totalDurationMs >= 1500) {
    slaLevel = 'WARNING';
    slaText = '良 (波动警告)';
    slaColor = '#faad14';
  }

  const segments: TimingSegment[] = [
    { key: 'validation', label: '网关校验', durationMs: validationDurationMs, percentage: valPct, color: '#1677ff' },
    { key: 'locking', label: '排他加锁', durationMs: lockingDurationMs, percentage: lockPct, color: '#722ed1' },
    { key: 'downlink', label: '下行发布', durationMs: downlinkDurationMs, percentage: downPct, color: '#13c2c2' },
    { key: 'ack', label: '终端及ACK', durationMs: ackDurationMs, percentage: ackPct, color: '#52c41a' },
  ];

  return {
    totalDurationMs,
    slaLevel,
    slaText,
    slaColor,
    segments,
    validationDurationMs,
    lockingDurationMs,
    downlinkDurationMs,
    ackDurationMs,
  };
}

/**
 * 409 排他锁冲突归因分析器
 * 提取冲突 Key、持锁指令 ID、TTL 倒计时与释锁建议
 */
export function parseCommandLockDetails(errOrMessage: unknown): CommandLockDetails {
  if (!errOrMessage) {
    return {
      isConflict: false,
      lockKey: '',
      waitSuggestion: '',
    };
  }

  let text = '';
  let obj: Record<string, unknown> | null = null;

  if (typeof errOrMessage === 'string') {
    text = errOrMessage;
  } else if (typeof errOrMessage === 'object' && errOrMessage !== null) {
    obj = errOrMessage as Record<string, unknown>;
    text = String(obj.message || obj.errorMessage || '');
  }

  const is409Status = obj && (obj.statusCode === 409 || obj.status === 409);
  const hasLockKeywords =
    text.includes('409') ||
    text.includes('lock:cmd:') ||
    text.includes('active lock') ||
    text.includes('排他锁') ||
    text.includes('正在执行中') ||
    text.includes('held by') ||
    Boolean(obj && obj.name === 'CommandLockError');

  if (!is409Status && !hasLockKeywords) {
    return {
      isConflict: false,
      lockKey: '',
      waitSuggestion: '',
      rawMessage: text,
    };
  }

  // 提取 lockKey
  let lockKey = '';
  if (obj && typeof obj.lockKey === 'string') {
    lockKey = obj.lockKey;
  } else {
    const lockMatch = text.match(/(?:lock:cmd:[a-zA-Z0-9_\-:]+)|(?:lock:[a-zA-Z0-9_\-:]+)/);
    if (lockMatch) {
      lockKey = lockMatch[0];
    } else {
      lockKey = 'lock:cmd:tenant-demo:vehicle-active';
    }
  }

  // 提取 holderCommandId
  let holderCommandId: string | undefined;
  if (obj && typeof obj.holderCommandId === 'string') {
    holderCommandId = obj.holderCommandId;
  } else {
    const holderMatch = text.match(/(?:held by|holder|commandId|持锁指令)[:\s]+([a-zA-Z0-9_\-]+)/i);
    if (holderMatch) {
      holderCommandId = holderMatch[1];
    }
  }

  // 提取 ttlSeconds
  let ttlSeconds: number | undefined;
  if (obj && typeof obj.ttlSeconds === 'number') {
    ttlSeconds = obj.ttlSeconds;
  } else if (obj && typeof obj.ttl === 'number') {
    ttlSeconds = obj.ttl;
  } else {
    const ttlMatch = text.match(/(?:ttl|剩余)[:\s]*(\d+)/i);
    if (ttlMatch) {
      ttlSeconds = parseInt(ttlMatch[1], 10);
    } else {
      ttlSeconds = 15;
    }
  }

  const waitSuggestion = `目标车辆当前正处于分布式排他锁保护期${
    holderCommandId ? ` (持锁指令: ${holderCommandId})` : ''
  }，预计 ${ttlSeconds || 15} 秒内自动释放，请勿高频连续重试，以避免指令风暴。`;

  return {
    isConflict: true,
    lockKey,
    holderCommandId,
    ttlSeconds,
    waitSuggestion,
    rawMessage: text,
  };
}

// ---------------- 高保真全链路种子追踪数据 ----------------

export const SEED_COMMAND_TRACES: CommandTraceDto[] = [
  // 1. 正常成功链路 (SUCCESS，耗时约 1.1s)
  {
    commandId: 'cmd-seed-01',
    commandCode: CommandCode.CMD_UNLOCK,
    vehicleId: 'veh-001',
    deviceId: 'dev-1001',
    status: CommandStatus.SUCCESS,
    operatorId: 'operator-admin',
    createdAt: '2026-10-13T10:25:30.000Z',
    finishedAt: '2026-10-13T10:25:31.085Z',
    durationMs: 1085,
    steps: [
      {
        stepIndex: 0,
        name: 'CREATED',
        title: '客户端指令创建',
        status: 'finish',
        timestamp: '2026-10-13T10:25:30.000Z',
        durationMs: 0,
        description: 'Web 管理后台下发车辆解锁指令，生成幂等防重 Key',
      },
      {
        stepIndex: 1,
        name: 'VALIDATING',
        title: '网关安全与权限校验',
        status: 'finish',
        timestamp: '2026-10-13T10:25:30.045Z',
        durationMs: 45,
        description: '操作员权限校验通过，车型能力模板匹配具备【车辆解锁】能力',
      },
      {
        stepIndex: 2,
        name: 'QUEUED',
        title: '分布式排他加锁与入队',
        status: 'finish',
        timestamp: '2026-10-13T10:25:30.120Z',
        durationMs: 75,
        description: '成功获取分布式锁 lock:cmd:tenant-demo:veh-001，TTL 15s',
      },
      {
        stepIndex: 3,
        name: 'SENT',
        title: 'MQTT Broker 下发报文',
        status: 'finish',
        timestamp: '2026-10-13T10:25:30.290Z',
        durationMs: 170,
        description: '通过 MQTT 主题 /v1/devices/dev-1001/cmd 下发二进制 Protobuf 报文',
      },
      {
        stepIndex: 4,
        name: 'WAITING_ACK',
        title: '车载终端执行中',
        status: 'finish',
        timestamp: '2026-10-13T10:25:30.310Z',
        durationMs: 20,
        description: 'T-Box 收到控制帧，BCM 门锁控制器驱动中控锁机构动作',
      },
      {
        stepIndex: 5,
        name: 'SUCCESS',
        title: '终端执行成功并上报 ACK',
        status: 'finish',
        timestamp: '2026-10-13T10:25:31.085Z',
        durationMs: 775,
        description: '车载终端上报执行成功 ACK 响应，门锁状态闭环已切换为 UNLOCKED',
      },
    ],
    downlinkPayload: {
      traceId: 'trace-succ-1001',
      commandId: 'cmd-seed-01',
      commandCode: 'CMD_UNLOCK',
      vehicleId: 'veh-001',
      deviceId: 'dev-1001',
      timestamp: '2026-10-13T10:25:30.000Z',
      securityLevel: 'L1',
      params: {
        door: 'ALL',
        autoRelockSeconds: 60,
      },
    },
    uplinkPayload: {
      traceId: 'trace-succ-1001',
      commandId: 'cmd-seed-01',
      ackCode: 0,
      status: 'SUCCESS',
      message: 'Door unlocked successfully and feedback verified',
      timestamp: '2026-10-13T10:25:31.085Z',
      data: {
        doorsState: 'UNLOCKED',
        actuatorTimeMs: 620,
        batteryVoltage: 12.6,
      },
    },
  },

  // 2. 终端拒绝链路 (DEVICE_REJECTED，挡位非P档)
  {
    commandId: 'cmd-seed-02',
    commandCode: CommandCode.CMD_ENGINE_START,
    vehicleId: 'veh-002',
    deviceId: 'dev-1002',
    status: CommandStatus.DEVICE_REJECTED,
    operatorId: 'operator-dispatch',
    createdAt: '2026-10-13T10:20:00.000Z',
    finishedAt: '2026-10-13T10:20:00.950Z',
    durationMs: 950,
    errorMessage: '安全互锁拦截：车辆变速箱挡位处于 D 档且检测到轮速，安全防护机制拒绝点火',
    steps: [
      {
        stepIndex: 0,
        name: 'CREATED',
        title: '客户端指令创建',
        status: 'finish',
        timestamp: '2026-10-13T10:20:00.000Z',
        durationMs: 0,
      },
      {
        stepIndex: 1,
        name: 'VALIDATING',
        title: '网关安全与 6 位安全码核验',
        status: 'finish',
        timestamp: '2026-10-13T10:20:00.040Z',
        durationMs: 40,
      },
      {
        stepIndex: 2,
        name: 'QUEUED',
        title: '分布式排他加锁',
        status: 'finish',
        timestamp: '2026-10-13T10:20:00.090Z',
        durationMs: 50,
      },
      {
        stepIndex: 3,
        name: 'SENT',
        title: 'MQTT 报文下发',
        status: 'finish',
        timestamp: '2026-10-13T10:20:00.220Z',
        durationMs: 130,
      },
      {
        stepIndex: 4,
        name: 'WAITING_ACK',
        title: '车载动力总成安全互锁前检',
        status: 'finish',
        timestamp: '2026-10-13T10:20:00.250Z',
        durationMs: 30,
      },
      {
        stepIndex: 5,
        name: 'DEVICE_REJECTED',
        title: '车机终端安全互锁拒绝执行',
        status: 'error',
        timestamp: '2026-10-13T10:20:00.950Z',
        durationMs: 700,
        description: '车身 VCU 动力控制器检测到非驻车工况，立即触发防意外启动安全互锁断开',
      },
    ],
    downlinkPayload: {
      traceId: 'trace-rej-1002',
      commandId: 'cmd-seed-02',
      commandCode: 'CMD_ENGINE_START',
      vehicleId: 'veh-002',
      deviceId: 'dev-1002',
      timestamp: '2026-10-13T10:20:00.000Z',
      params: { durationMinutes: 15 },
    },
    uplinkPayload: {
      traceId: 'trace-rej-1002',
      commandId: 'cmd-seed-02',
      ackCode: 10024,
      status: 'DEVICE_REJECTED',
      errorCode: 'ECU_SAFETY_INTERLOCK_GEAR_NOT_P',
      message: '安全互锁拦截：车辆变速箱挡位处于 D 档且检测到轮速，安全防护机制拒绝点火',
      timestamp: '2026-10-13T10:20:00.950Z',
    },
  },

  // 3. 超时链路 (TIMEOUT，10s 无应答)
  {
    commandId: 'cmd-seed-03',
    commandCode: CommandCode.CMD_TRUNK_OPEN,
    vehicleId: 'veh-003',
    deviceId: 'dev-1003',
    status: CommandStatus.TIMEOUT,
    operatorId: 'operator-02',
    createdAt: '2026-10-13T10:15:00.000Z',
    finishedAt: '2026-10-13T10:15:10.000Z',
    durationMs: 10000,
    errorMessage: '车载终端超过 10,000ms 未上报 ACK 响应报文，网关判定指令超时失效',
    steps: [
      {
        stepIndex: 0,
        name: 'CREATED',
        title: '客户端指令创建',
        status: 'finish',
        timestamp: '2026-10-13T10:15:00.000Z',
        durationMs: 0,
      },
      {
        stepIndex: 1,
        name: 'VALIDATING',
        title: '网关安全校验',
        status: 'finish',
        timestamp: '2026-10-13T10:15:00.035Z',
        durationMs: 35,
      },
      {
        stepIndex: 2,
        name: 'QUEUED',
        title: '分布式排他加锁',
        status: 'finish',
        timestamp: '2026-10-13T10:15:00.080Z',
        durationMs: 45,
      },
      {
        stepIndex: 3,
        name: 'SENT',
        title: 'MQTT 报文下发',
        status: 'finish',
        timestamp: '2026-10-13T10:15:00.200Z',
        durationMs: 120,
      },
      {
        stepIndex: 4,
        name: 'WAITING_ACK',
        title: '等待车载设备 ACK 应答',
        status: 'finish',
        timestamp: '2026-10-13T10:15:00.220Z',
        durationMs: 20,
      },
      {
        stepIndex: 5,
        name: 'TIMEOUT',
        title: '等待超时失效 (10s)',
        status: 'error',
        timestamp: '2026-10-13T10:15:10.000Z',
        durationMs: 9780,
        description: '可能原因：车辆停放于地下深层车库等弱网盲区，导致 MQTT 报文丢失',
      },
    ],
    downlinkPayload: {
      traceId: 'trace-timeout-1003',
      commandId: 'cmd-seed-03',
      commandCode: 'CMD_TRUNK_OPEN',
      vehicleId: 'veh-003',
      timestamp: '2026-10-13T10:15:00.000Z',
    },
  },

  // 4. 409 排他锁冲突链路 (LOCK CONFLICT)
  {
    commandId: 'cmd-seed-04',
    commandCode: CommandCode.CMD_AC_START,
    vehicleId: 'veh-001',
    deviceId: 'dev-1001',
    status: CommandStatus.FAILED,
    operatorId: 'operator-admin',
    createdAt: '2026-10-13T10:25:30.080Z',
    finishedAt: '2026-10-13T10:25:30.150Z',
    durationMs: 70,
    errorMessage: '409 Conflict: Vehicle veh-001 has active lock lock:cmd:tenant-demo:veh-001 held by cmd-seed-01. TTL: 12s. Retry later.',
    steps: [
      {
        stepIndex: 0,
        name: 'CREATED',
        title: '客户端指令创建',
        status: 'finish',
        timestamp: '2026-10-13T10:25:30.080Z',
        durationMs: 0,
      },
      {
        stepIndex: 1,
        name: 'VALIDATING',
        title: '网关校验',
        status: 'finish',
        timestamp: '2026-10-13T10:25:30.100Z',
        durationMs: 20,
      },
      {
        stepIndex: 2,
        name: 'QUEUED',
        title: '分布式锁冲突拦截 (409)',
        status: 'error',
        timestamp: '2026-10-13T10:25:30.150Z',
        durationMs: 50,
        description: '排他锁获取失败：目标车辆已由 cmd-seed-01 独占加锁中',
      },
    ],
    lockDetails: {
      isConflict: true,
      lockKey: 'lock:cmd:tenant-demo:veh-001',
      holderCommandId: 'cmd-seed-01',
      ttlSeconds: 12,
      waitSuggestion: '目标车辆当前正处于分布式排他锁保护期 (持锁指令: cmd-seed-01)，预计 12 秒内自动释放，请勿高频连续重试，以避免指令风暴。',
      rawMessage: '409 Conflict: Vehicle veh-001 has active lock lock:cmd:tenant-demo:veh-001 held by cmd-seed-01. TTL: 12s. Retry later.',
    },
    downlinkPayload: {
      traceId: 'trace-lock-1004',
      commandId: 'cmd-seed-04',
      commandCode: 'CMD_AC_START',
      vehicleId: 'veh-001',
      params: { temp: 24, fanSpeed: 2 },
    },
  },
];
