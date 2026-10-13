import {
  CommandCode,
  SecurityLevel,
  CommandStatus,
  type EffectiveCapabilityDto,
} from '@car-control/contracts';
import { ApiError } from '../../api/client.ts';

export { CommandCode, SecurityLevel, CommandStatus, type EffectiveCapabilityDto };

export interface CommandMetaItem {
  code: CommandCode;
  name: string;
  group: 'DOOR_TRUNK' | 'POWER_SEARCH' | 'CLIMATE' | 'WINDOW_SUNROOF';
  groupName: string;
  securityLevel: SecurityLevel;
  iconName: string;
  defaultTimeoutMs: number;
  warningText?: string;
  description: string;
}

export const COMMAND_METADATA: Record<CommandCode, CommandMetaItem> = {
  [CommandCode.CMD_LOCK]: {
    code: CommandCode.CMD_LOCK,
    name: '车辆上锁',
    group: 'DOOR_TRUNK',
    groupName: '门锁与后备箱',
    securityLevel: SecurityLevel.L0,
    iconName: 'LockOutlined',
    defaultTimeoutMs: 10000,
    description: '闭锁全车门锁并进入设防状态',
  },
  [CommandCode.CMD_UNLOCK]: {
    code: CommandCode.CMD_UNLOCK,
    name: '车辆解锁',
    group: 'DOOR_TRUNK',
    groupName: '门锁与后备箱',
    securityLevel: SecurityLevel.L1,
    iconName: 'UnlockOutlined',
    defaultTimeoutMs: 10000,
    warningText: '确认解锁车辆门锁吗？解锁后若无人上车，可能存在财产被盗风险',
    description: '解除全车门锁设防',
  },
  [CommandCode.CMD_TRUNK_OPEN]: {
    code: CommandCode.CMD_TRUNK_OPEN,
    name: '开启后备箱',
    group: 'DOOR_TRUNK',
    groupName: '门锁与后备箱',
    securityLevel: SecurityLevel.L1,
    iconName: 'InboxOutlined',
    defaultTimeoutMs: 10000,
    warningText: '后备箱开启后若无人关闭可能存在财产风险，确认开启吗？',
    description: '弹开并升起后备箱门',
  },
  [CommandCode.CMD_TRUNK_CLOSE]: {
    code: CommandCode.CMD_TRUNK_CLOSE,
    name: '关闭后备箱',
    group: 'DOOR_TRUNK',
    groupName: '门锁与后备箱',
    securityLevel: SecurityLevel.L1,
    iconName: 'FolderCloseOutlined',
    defaultTimeoutMs: 10000,
    warningText: '关闭后备箱前请确认尾箱周边无人及障碍物，确认关闭吗？',
    description: '电动关闭车辆后备箱',
  },
  [CommandCode.CMD_FIND_VEHICLE]: {
    code: CommandCode.CMD_FIND_VEHICLE,
    name: '鸣笛寻车',
    group: 'POWER_SEARCH',
    groupName: '动力与寻车',
    securityLevel: SecurityLevel.L0,
    iconName: 'BellOutlined',
    defaultTimeoutMs: 10000,
    description: '控制车机双闪并间歇鸣笛 30 秒协助快速寻车',
  },
  [CommandCode.CMD_ENGINE_START]: {
    code: CommandCode.CMD_ENGINE_START,
    name: '远程点火启动',
    group: 'POWER_SEARCH',
    groupName: '动力与寻车',
    securityLevel: SecurityLevel.L2,
    iconName: 'ThunderboltOutlined',
    defaultTimeoutMs: 15000,
    warningText: '远程启动发动机具有高安全风险，运行到期后自动熄火，强制校验 6 位安全码',
    description: '远程点火起动动力系统，可设定运行时间 (5~45分钟)',
  },
  [CommandCode.CMD_ENGINE_STOP]: {
    code: CommandCode.CMD_ENGINE_STOP,
    name: '远程熄火',
    group: 'POWER_SEARCH',
    groupName: '动力与寻车',
    securityLevel: SecurityLevel.L2,
    iconName: 'PoweroffOutlined',
    defaultTimeoutMs: 15000,
    warningText: '远程熄火前系统严格校验当前车速为 0 且处于 P 档，强制校验 6 位安全码',
    description: '远程切断高压或发动机动力，使车辆进入熄火驻车状态',
  },
  [CommandCode.CMD_AC_START]: {
    code: CommandCode.CMD_AC_START,
    name: '开启空调',
    group: 'CLIMATE',
    groupName: '座舱温控',
    securityLevel: SecurityLevel.L1,
    iconName: 'FireOutlined',
    defaultTimeoutMs: 15000,
    warningText: '远程开启空调将持续消耗电池电量或燃油，确认下发设定吗？',
    description: '开启座舱空调系统并配置温度、风速与循环模式',
  },
  [CommandCode.CMD_AC_STOP]: {
    code: CommandCode.CMD_AC_STOP,
    name: '关闭空调',
    group: 'CLIMATE',
    groupName: '座舱温控',
    securityLevel: SecurityLevel.L0,
    iconName: 'PauseCircleOutlined',
    defaultTimeoutMs: 10000,
    description: '一键停止车载空调运行',
  },
  [CommandCode.CMD_SEAT_HEAT]: {
    code: CommandCode.CMD_SEAT_HEAT,
    name: '座椅加热',
    group: 'CLIMATE',
    groupName: '座舱温控',
    securityLevel: SecurityLevel.L1,
    iconName: 'HeatMapOutlined',
    defaultTimeoutMs: 10000,
    warningText: '开启座椅加热将持续消耗电能，确认加热档位设置吗？',
    description: '调节主驾驶或副驾驶座椅加热档位 (1~3档)',
  },
  [CommandCode.CMD_WINDOW_OPEN]: {
    code: CommandCode.CMD_WINDOW_OPEN,
    name: '一键降窗',
    group: 'WINDOW_SUNROOF',
    groupName: '车窗天窗',
    securityLevel: SecurityLevel.L1,
    iconName: 'DownSquareOutlined',
    defaultTimeoutMs: 10000,
    warningText: '一键开启车窗通风，离开车辆前请确认财产防盗与天气情况',
    description: '下发四门车窗一键开启降下指令',
  },
  [CommandCode.CMD_WINDOW_CLOSE]: {
    code: CommandCode.CMD_WINDOW_CLOSE,
    name: '一键升窗',
    group: 'WINDOW_SUNROOF',
    groupName: '车窗天窗',
    securityLevel: SecurityLevel.L1,
    iconName: 'UpSquareOutlined',
    defaultTimeoutMs: 10000,
    warningText: '一键升窗过程中请特别注意车门旁乘客防夹手安全，确认升起车窗吗？',
    description: '下发四门车窗一键闭合升起指令',
  },
  [CommandCode.CMD_SUNROOF_CONTROL]: {
    code: CommandCode.CMD_SUNROOF_CONTROL,
    name: '开启/关闭天窗',
    group: 'WINDOW_SUNROOF',
    groupName: '车窗天窗',
    securityLevel: SecurityLevel.L1,
    iconName: 'BorderOutlined',
    defaultTimeoutMs: 10000,
    warningText: '操作全景天窗开闭前请确认车顶无异物遮挡及未处于下雨天气',
    description: '控制车顶全景天窗遮阳帘与玻璃开启或关闭',
  },
};

export interface SecurityCodeValidationResult {
  valid: boolean;
  message?: string;
}

/**
 * 安全码纯函数校验
 * L0: 无需校验
 * L1: 可选或普通操作密码
 * L2: 强制 6 位纯数字安全码 (/^\d{6}$/)，默认演示验证码 123456
 */
export function validateSecurityCode(
  code?: string,
  level: SecurityLevel = SecurityLevel.L2,
  expectedPin = '123456'
): SecurityCodeValidationResult {
  if (level === SecurityLevel.L0) {
    return { valid: true };
  }

  if (level === SecurityLevel.L1) {
    return { valid: true };
  }

  // L2 强安全级校验
  if (!code || typeof code !== 'string' || code.trim() === '') {
    return {
      valid: false,
      message: '请输入6位纯数字安全操作码',
    };
  }

  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed)) {
    return {
      valid: false,
      message: '安全码必须为6位纯数字',
    };
  }

  if (expectedPin && trimmed !== expectedPin) {
    return {
      valid: false,
      message: '安全操作码错误，默认演示安全码为 123456',
    };
  }

  return { valid: true };
}

/**
 * 端到端执行耗时格式化纯函数
 * < 1000ms: 显示 Xms
 * ≥ 1000ms: 显示 X.XXs
 */
export function formatExecutionDuration(ms?: number | null): string {
  if (ms === null || ms === undefined || ms < 0 || Number.isNaN(ms)) {
    return '-';
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

export interface CapabilitySupportResult {
  supported: boolean;
  reason?: string;
}

/**
 * 车型能力继承判定纯函数
 */
export function isCommandSupportedByCapability(
  commandCode: CommandCode,
  capabilities?: Partial<Record<CommandCode, EffectiveCapabilityDto>> | null
): CapabilitySupportResult {
  if (!capabilities) {
    return { supported: true };
  }

  const cap = capabilities[commandCode];
  if (!cap) {
    return {
      supported: false,
      reason: '该车型硬件配置不支持此功能',
    };
  }

  if (cap.supported === false) {
    return {
      supported: false,
      reason: cap.reason || '该车型硬件配置不支持此功能',
    };
  }

  return { supported: true };
}

export type VoltageHealthLevel = 'NORMAL' | 'LOW' | 'CRITICAL';

export interface VoltageHealthMeta {
  level: VoltageHealthLevel;
  text: string;
  color: string;
  tagColor: 'success' | 'warning' | 'error';
}

/**
 * 蓄电池电压健康度评估
 * ≥ 12.0V: 正常 (绿色)
 * 11.0V ~ 11.9V: 欠压警告 (橙色)
 * < 11.0V: 严重欠压 (红色)
 */
export function evaluateVoltageHealth(voltage: number): VoltageHealthMeta {
  if (voltage >= 12.0) {
    return {
      level: 'NORMAL',
      text: '正常',
      color: '#52c41a',
      tagColor: 'success',
    };
  }
  if (voltage >= 11.0) {
    return {
      level: 'LOW',
      text: '欠压告警',
      color: '#faad14',
      tagColor: 'warning',
    };
  }
  return {
    level: 'CRITICAL',
    text: '严重欠压',
    color: '#ff4d4f',
    tagColor: 'error',
  };
}

/**
 * 409 并发排他锁标准化异常
 */
export class CommandLockError extends Error {
  public readonly vehicleId: string;
  public readonly commandCode?: CommandCode;

  constructor(
    vehicleId: string,
    message = '该车辆已有指令正在执行中，请稍候',
    commandCode?: CommandCode
  ) {
    super(message);
    this.name = 'CommandLockError';
    this.vehicleId = vehicleId;
    this.commandCode = commandCode;
    Object.setPrototypeOf(this, CommandLockError.prototype);
  }
}

export function isCommandLockError(err: unknown): err is CommandLockError {
  if (err instanceof CommandLockError) return true;
  if (typeof err === 'object' && err !== null) {
    const candidate = err as Record<string, unknown>;
    return candidate.name === 'CommandLockError' && typeof candidate.vehicleId === 'string';
  }
  return false;
}

/**
 * 判断是否为 ApiError
 */
export function isApiError(err: unknown): err is ApiError {
  if (err instanceof ApiError) return true;
  if (typeof err === 'object' && err !== null) {
    const candidate = err as Record<string, unknown>;
    return typeof candidate.statusCode === 'number' && typeof candidate.message === 'string';
  }
  return false;
}

// ---------------- 遥测与全景运营台领域模型 ----------------

export interface VehicleTelemetryData {
  batteryVoltage: number;
  speed: number;
  gear: 'P' | 'D' | 'R' | 'N';
  mileage: number;
  doorLocks: 'LOCKED' | 'UNLOCKED';
  trunk: 'CLOSED' | 'OPEN';
  engine: 'RUNNING' | 'STOPPED';
  windows: 'CLOSED' | 'OPEN' | 'HALF';
  sunroof: 'CLOSED' | 'OPEN';
  acRunning: boolean;
  acTemp: number;
  acFanSpeed: number;
  seatHeatDriver: number;
  seatHeatPassenger: number;
  lastHeartbeat: string;
}

export interface VehicleWorkbenchItem {
  id: string;
  vin: string;
  plateNumber: string;
  brandName: string;
  modelName: string;
  modelId: string;
  deviceId: string;
  deviceNo: string;
  isOnline: boolean;
  telemetry: VehicleTelemetryData;
}

export const SEED_WORKBENCH_VEHICLES: VehicleWorkbenchItem[] = [
  {
    id: 'veh-001',
    vin: 'LSVAA4188P1002341',
    plateNumber: '粤B·88888',
    brandName: '特斯拉',
    modelName: 'Model Y 全轮驱动版',
    modelId: 'model-tesla-y',
    deviceId: 'dev-1001',
    deviceNo: 'DEV_1001',
    isOnline: true,
    telemetry: {
      batteryVoltage: 12.6,
      speed: 0,
      gear: 'P',
      mileage: 18240,
      doorLocks: 'LOCKED',
      trunk: 'CLOSED',
      engine: 'STOPPED',
      windows: 'CLOSED',
      sunroof: 'CLOSED',
      acRunning: false,
      acTemp: 24,
      acFanSpeed: 2,
      seatHeatDriver: 0,
      seatHeatPassenger: 0,
      lastHeartbeat: '刚刚',
    },
  },
  {
    id: 'veh-002',
    vin: 'LFPH2E023N1000678',
    plateNumber: '粤B·66666',
    brandName: '比亚迪',
    modelName: '汉 EV 旗舰型',
    modelId: 'model-byd-han',
    deviceId: 'dev-1002',
    deviceNo: 'DEV_1002',
    isOnline: true,
    telemetry: {
      batteryVoltage: 11.8,
      speed: 0,
      gear: 'P',
      mileage: 32510,
      doorLocks: 'LOCKED',
      trunk: 'CLOSED',
      engine: 'STOPPED',
      windows: 'CLOSED',
      sunroof: 'CLOSED',
      acRunning: true,
      acTemp: 22,
      acFanSpeed: 1,
      seatHeatDriver: 2,
      seatHeatPassenger: 0,
      lastHeartbeat: '1分钟前',
    },
  },
  {
    id: 'veh-003',
    vin: 'LSVAR4183M1004512',
    plateNumber: '京A·99999',
    brandName: '吉利极氪',
    modelName: '极氪 001 YOU版',
    modelId: 'model-zeekr-001',
    deviceId: 'dev-1003',
    deviceNo: 'DEV_1003',
    isOnline: false,
    telemetry: {
      batteryVoltage: 10.8,
      speed: 0,
      gear: 'P',
      mileage: 9540,
      doorLocks: 'LOCKED',
      trunk: 'CLOSED',
      engine: 'STOPPED',
      windows: 'CLOSED',
      sunroof: 'CLOSED',
      acRunning: false,
      acTemp: 25,
      acFanSpeed: 1,
      seatHeatDriver: 0,
      seatHeatPassenger: 0,
      lastHeartbeat: '15分钟前',
    },
  },
  {
    id: 'veh-004',
    vin: 'LFPH3A021K1007890',
    plateNumber: '沪A·12345',
    brandName: '广汽埃安',
    modelName: 'AION Y Plus 智驾版',
    modelId: 'model-aion-y',
    deviceId: 'dev-1004',
    deviceNo: 'DEV_1004',
    isOnline: true,
    telemetry: {
      batteryVoltage: 12.4,
      speed: 0,
      gear: 'P',
      mileage: 41200,
      doorLocks: 'UNLOCKED',
      trunk: 'OPEN',
      engine: 'STOPPED',
      windows: 'HALF',
      sunroof: 'CLOSED',
      acRunning: false,
      acTemp: 24,
      acFanSpeed: 2,
      seatHeatDriver: 0,
      seatHeatPassenger: 0,
      lastHeartbeat: '刚刚',
    },
  },
];

/**
 * 默认车型能力字典生成器
 */
export function generateDefaultCapabilities(modelId?: string): Record<CommandCode, EffectiveCapabilityDto> {
  const isAionY = modelId === 'model-aion-y';
  const isLowEnd = modelId === 'model-low-end';

  return {
    [CommandCode.CMD_LOCK]: {
      commandCode: CommandCode.CMD_LOCK,
      commandName: '车辆上锁',
      supported: true,
      securityLevel: SecurityLevel.L0,
      timeoutMs: 10000,
      frequencyLimitSeconds: 3,
    },
    [CommandCode.CMD_UNLOCK]: {
      commandCode: CommandCode.CMD_UNLOCK,
      commandName: '车辆解锁',
      supported: true,
      securityLevel: SecurityLevel.L1,
      timeoutMs: 10000,
      frequencyLimitSeconds: 3,
    },
    [CommandCode.CMD_FIND_VEHICLE]: {
      commandCode: CommandCode.CMD_FIND_VEHICLE,
      commandName: '鸣笛寻车',
      supported: true,
      securityLevel: SecurityLevel.L0,
      timeoutMs: 10000,
      frequencyLimitSeconds: 5,
    },
    [CommandCode.CMD_TRUNK_OPEN]: {
      commandCode: CommandCode.CMD_TRUNK_OPEN,
      commandName: '开启后备箱',
      supported: true,
      securityLevel: SecurityLevel.L1,
      timeoutMs: 10000,
      frequencyLimitSeconds: 5,
    },
    [CommandCode.CMD_TRUNK_CLOSE]: {
      commandCode: CommandCode.CMD_TRUNK_CLOSE,
      commandName: '关闭后备箱',
      supported: true,
      securityLevel: SecurityLevel.L1,
      timeoutMs: 10000,
      frequencyLimitSeconds: 5,
    },
    [CommandCode.CMD_ENGINE_START]: {
      commandCode: CommandCode.CMD_ENGINE_START,
      commandName: '远程点火启动',
      supported: !isLowEnd,
      securityLevel: SecurityLevel.L2,
      timeoutMs: 15000,
      frequencyLimitSeconds: 15,
      reason: isLowEnd ? '该车型硬件配置不支持远程动力启动' : undefined,
    },
    [CommandCode.CMD_ENGINE_STOP]: {
      commandCode: CommandCode.CMD_ENGINE_STOP,
      commandName: '远程熄火',
      supported: !isLowEnd,
      securityLevel: SecurityLevel.L2,
      timeoutMs: 15000,
      frequencyLimitSeconds: 15,
      reason: isLowEnd ? '该车型硬件配置不支持远程熄火' : undefined,
    },
    [CommandCode.CMD_WINDOW_OPEN]: {
      commandCode: CommandCode.CMD_WINDOW_OPEN,
      commandName: '开启车窗',
      supported: true,
      securityLevel: SecurityLevel.L1,
      timeoutMs: 10000,
      frequencyLimitSeconds: 5,
    },
    [CommandCode.CMD_WINDOW_CLOSE]: {
      commandCode: CommandCode.CMD_WINDOW_CLOSE,
      commandName: '关闭车窗',
      supported: true,
      securityLevel: SecurityLevel.L1,
      timeoutMs: 10000,
      frequencyLimitSeconds: 5,
    },
    [CommandCode.CMD_AC_START]: {
      commandCode: CommandCode.CMD_AC_START,
      commandName: '开启空调',
      supported: true,
      securityLevel: SecurityLevel.L1,
      timeoutMs: 15000,
      frequencyLimitSeconds: 10,
    },
    [CommandCode.CMD_AC_STOP]: {
      commandCode: CommandCode.CMD_AC_STOP,
      commandName: '关闭空调',
      supported: true,
      securityLevel: SecurityLevel.L0,
      timeoutMs: 10000,
      frequencyLimitSeconds: 5,
    },
    [CommandCode.CMD_SEAT_HEAT]: {
      commandCode: CommandCode.CMD_SEAT_HEAT,
      commandName: '座椅加热',
      supported: !isAionY && !isLowEnd,
      securityLevel: SecurityLevel.L1,
      timeoutMs: 10000,
      frequencyLimitSeconds: 5,
      reason: isAionY || isLowEnd ? '该车型硬件配置不支持此功能' : undefined,
    },
    [CommandCode.CMD_SUNROOF_CONTROL]: {
      commandCode: CommandCode.CMD_SUNROOF_CONTROL,
      commandName: '开启/关闭天窗',
      supported: !isAionY,
      securityLevel: SecurityLevel.L1,
      timeoutMs: 10000,
      frequencyLimitSeconds: 5,
      reason: isAionY ? '该车型无全景天窗硬件' : undefined,
    },
  };
}
