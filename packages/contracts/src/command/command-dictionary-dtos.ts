import { CommandCode, SecurityLevel } from './command-codes.js';

export type ProtocolParamType = 'string' | 'number' | 'boolean' | 'enum' | 'object';

export interface ProtocolParamSchema {
  paramName: string;
  type: ProtocolParamType;
  required: boolean;
  description: string;
  defaultValue?: unknown;
  unit?: string;
  canSignal?: string;
  allowedValues?: (string | number)[];
  minimum?: number;
  maximum?: number;
  step?: number;
}

export enum CommandCategory {
  DOOR_BODY = 'DOOR_BODY',
  POWER_FIND = 'POWER_FIND',
  CABIN_CLIMATE = 'CABIN_CLIMATE',
  WINDOW_ROOF = 'WINDOW_ROOF',
}

export interface CommandDictionaryItem {
  code: CommandCode;
  name: string;
  category: CommandCategory;
  defaultSecurityLevel: SecurityLevel;
  defaultTimeoutMs: number;
  defaultFrequencyLimitSeconds: number;
  canSignalName: string;
  downlinkOpcode: string;
  payloadSchema: Record<string, ProtocolParamSchema>;
  samplePayload: Record<string, unknown>;
  description: string;
  safetyWarning?: string;
}

export type UpdateCommandDictionaryDto = Partial<CommandDictionaryItem>;

export const DEFAULT_COMMAND_DICTIONARY: CommandDictionaryItem[] = [
  {
    code: CommandCode.CMD_LOCK,
    name: '车辆上锁',
    category: CommandCategory.DOOR_BODY,
    defaultSecurityLevel: SecurityLevel.L0,
    defaultTimeoutMs: 10000,
    defaultFrequencyLimitSeconds: 5,
    canSignalName: 'CAN_BCM_DoorLockCmd',
    downlinkOpcode: '0x02_01',
    payloadSchema: {},
    samplePayload: { action: 'LOCK' },
    description: '闭锁全车四门与后备箱门锁，自动进入设防警戒状态',
  },
  {
    code: CommandCode.CMD_UNLOCK,
    name: '车辆解锁',
    category: CommandCategory.DOOR_BODY,
    defaultSecurityLevel: SecurityLevel.L1,
    defaultTimeoutMs: 10000,
    defaultFrequencyLimitSeconds: 5,
    canSignalName: 'CAN_BCM_DoorUnlockCmd',
    downlinkOpcode: '0x02_02',
    payloadSchema: {},
    samplePayload: { action: 'UNLOCK' },
    description: '解除全车门锁设防状态，允许拉开车门进入座舱',
    safetyWarning: '确认解锁车辆门锁吗？解锁后若无人上车，可能存在财产被盗风险',
  },
  {
    code: CommandCode.CMD_TRUNK_OPEN,
    name: '开启后备箱',
    category: CommandCategory.DOOR_BODY,
    defaultSecurityLevel: SecurityLevel.L1,
    defaultTimeoutMs: 10000,
    defaultFrequencyLimitSeconds: 5,
    canSignalName: 'CAN_PLGM_TrunkOpenCmd',
    downlinkOpcode: '0x02_03',
    payloadSchema: {},
    samplePayload: { action: 'OPEN' },
    description: '电动弹开并举升车辆电动后备箱尾门',
    safetyWarning: '后备箱开启后若无人关闭可能存在财产风险，确认开启吗？',
  },
  {
    code: CommandCode.CMD_TRUNK_CLOSE,
    name: '关闭后备箱',
    category: CommandCategory.DOOR_BODY,
    defaultSecurityLevel: SecurityLevel.L1,
    defaultTimeoutMs: 10000,
    defaultFrequencyLimitSeconds: 5,
    canSignalName: 'CAN_PLGM_TrunkCloseCmd',
    downlinkOpcode: '0x02_04',
    payloadSchema: {},
    samplePayload: { action: 'CLOSE' },
    description: '电动关闭并电吸锁止车辆后备箱尾门',
    safetyWarning: '关闭后备箱前请确认尾箱周边无人及障碍物，确认关闭吗？',
  },
  {
    code: CommandCode.CMD_FIND_VEHICLE,
    name: '鸣笛寻车',
    category: CommandCategory.POWER_FIND,
    defaultSecurityLevel: SecurityLevel.L0,
    defaultTimeoutMs: 10000,
    defaultFrequencyLimitSeconds: 10,
    canSignalName: 'CAN_BCM_HornFlashCmd',
    downlinkOpcode: '0x02_05',
    payloadSchema: {
      durationSeconds: {
        paramName: 'durationSeconds',
        type: 'number',
        required: false,
        description: '寻车鸣笛双闪持续时长 (5~60秒)',
        defaultValue: 30,
        unit: 's',
        canSignal: 'CAN_BCM_HornFlashDuration',
        minimum: 5,
        maximum: 60,
        step: 5,
      },
    },
    samplePayload: { durationSeconds: 30 },
    description: '控制车身双闪灯间歇闪烁并鸣响喇叭协助车主快速辨识方位',
  },
  {
    code: CommandCode.CMD_ENGINE_START,
    name: '远程点火启动',
    category: CommandCategory.POWER_FIND,
    defaultSecurityLevel: SecurityLevel.L2,
    defaultTimeoutMs: 15000,
    defaultFrequencyLimitSeconds: 60,
    canSignalName: 'CAN_VCU_RemoteEngineStartCmd',
    downlinkOpcode: '0x02_06',
    payloadSchema: {
      durationMinutes: {
        paramName: 'durationMinutes',
        type: 'number',
        required: true,
        description: '点火怠速运行时间 (5~45分钟)',
        defaultValue: 15,
        unit: 'min',
        canSignal: 'CAN_VCU_EngineIdleTime',
        minimum: 5,
        maximum: 45,
        step: 5,
      },
    },
    samplePayload: { durationMinutes: 15 },
    description: '远程点火起动动力系统，可设定运行时间 (5~45分钟)',
    safetyWarning: '远程启动发动机具有高安全风险，运行到期后自动熄火，强制校验 6 位安全码',
  },
  {
    code: CommandCode.CMD_ENGINE_STOP,
    name: '远程熄火',
    category: CommandCategory.POWER_FIND,
    defaultSecurityLevel: SecurityLevel.L2,
    defaultTimeoutMs: 15000,
    defaultFrequencyLimitSeconds: 60,
    canSignalName: 'CAN_VCU_RemoteEngineStopCmd',
    downlinkOpcode: '0x02_07',
    payloadSchema: {},
    samplePayload: { action: 'STOP' },
    description: '远程切断高压或发动机动力，使车辆进入熄火驻车状态',
    safetyWarning: '远程熄火前系统严格校验当前车速为 0 且处于 P 档，强制校验 6 位安全码',
  },
  {
    code: CommandCode.CMD_AC_START,
    name: '开启空调',
    category: CommandCategory.CABIN_CLIMATE,
    defaultSecurityLevel: SecurityLevel.L1,
    defaultTimeoutMs: 15000,
    defaultFrequencyLimitSeconds: 15,
    canSignalName: 'CAN_HVAC_AcStartCmd',
    downlinkOpcode: '0x02_08',
    payloadSchema: {
      temperature: {
        paramName: 'temperature',
        type: 'number',
        required: true,
        description: '目标座舱设定温度 (16~30℃)',
        defaultValue: 24,
        unit: '℃',
        canSignal: 'CAN_HVAC_TargetTemp',
        minimum: 16,
        maximum: 30,
        step: 0.5,
      },
      fanSpeed: {
        paramName: 'fanSpeed',
        type: 'number',
        required: false,
        description: '空调出风风速 (1~7档)',
        defaultValue: 3,
        unit: '档',
        canSignal: 'CAN_HVAC_FanSpeed',
        minimum: 1,
        maximum: 7,
        step: 1,
      },
      mode: {
        paramName: 'mode',
        type: 'enum',
        required: false,
        description: '循环风向模式 (AUTO/COOL/HEAT/DEFROST)',
        defaultValue: 'AUTO',
        canSignal: 'CAN_HVAC_AirMode',
        allowedValues: ['AUTO', 'COOL', 'HEAT', 'DEFROST'],
      },
    },
    samplePayload: { temperature: 24, fanSpeed: 3, mode: 'AUTO' },
    description: '开启座舱空调系统并配置温度、风速与循环模式',
    safetyWarning: '远程开启空调将持续消耗电池电量或燃油，确认下发设定吗？',
  },
  {
    code: CommandCode.CMD_AC_STOP,
    name: '关闭空调',
    category: CommandCategory.CABIN_CLIMATE,
    defaultSecurityLevel: SecurityLevel.L0,
    defaultTimeoutMs: 10000,
    defaultFrequencyLimitSeconds: 10,
    canSignalName: 'CAN_HVAC_AcStopCmd',
    downlinkOpcode: '0x02_09',
    payloadSchema: {},
    samplePayload: { action: 'STOP' },
    description: '一键停止车载空调运行并关闭风门',
  },
  {
    code: CommandCode.CMD_SEAT_HEAT,
    name: '座椅加热',
    category: CommandCategory.CABIN_CLIMATE,
    defaultSecurityLevel: SecurityLevel.L1,
    defaultTimeoutMs: 10000,
    defaultFrequencyLimitSeconds: 10,
    canSignalName: 'CAN_SCM_SeatHeatingCmd',
    downlinkOpcode: '0x02_0A',
    payloadSchema: {
      position: {
        paramName: 'position',
        type: 'enum',
        required: true,
        description: '加热座椅位置 (DRIVER=主驾驶, PASSENGER=副驾驶)',
        defaultValue: 'DRIVER',
        canSignal: 'CAN_SCM_SeatPosition',
        allowedValues: ['DRIVER', 'PASSENGER'],
      },
      level: {
        paramName: 'level',
        type: 'number',
        required: true,
        description: '加热档位 (0=关闭, 1=弱, 2=中, 3=强)',
        defaultValue: 2,
        unit: '档',
        canSignal: 'CAN_SCM_HeatLevel',
        minimum: 0,
        maximum: 3,
        step: 1,
      },
    },
    samplePayload: { position: 'DRIVER', level: 2 },
    description: '调节主驾驶或副驾驶座椅电加热档位 (1~3档)',
    safetyWarning: '开启座椅加热将持续消耗电能，确认加热档位设置吗？',
  },
  {
    code: CommandCode.CMD_WINDOW_OPEN,
    name: '一键降窗',
    category: CommandCategory.WINDOW_ROOF,
    defaultSecurityLevel: SecurityLevel.L1,
    defaultTimeoutMs: 10000,
    defaultFrequencyLimitSeconds: 10,
    canSignalName: 'CAN_BCM_WindowDownCmd',
    downlinkOpcode: '0x02_0B',
    payloadSchema: {
      percentage: {
        paramName: 'percentage',
        type: 'number',
        required: false,
        description: '车窗降下开度百分比 (100% 为全开)',
        defaultValue: 100,
        unit: '%',
        canSignal: 'CAN_BCM_WindowOpenPercent',
        minimum: 10,
        maximum: 100,
        step: 10,
      },
    },
    samplePayload: { percentage: 100 },
    description: '下发四门车窗一键开启降下指令',
    safetyWarning: '一键开启车窗通风，离开车辆前请确认财产防盗与天气情况',
  },
  {
    code: CommandCode.CMD_WINDOW_CLOSE,
    name: '一键升窗',
    category: CommandCategory.WINDOW_ROOF,
    defaultSecurityLevel: SecurityLevel.L1,
    defaultTimeoutMs: 10000,
    defaultFrequencyLimitSeconds: 10,
    canSignalName: 'CAN_BCM_WindowUpCmd',
    downlinkOpcode: '0x02_0C',
    payloadSchema: {},
    samplePayload: { action: 'CLOSE' },
    description: '下发四门车窗一键闭合升起指令',
    safetyWarning: '一键升窗过程中请特别注意车门旁乘客防夹手安全，确认升起车窗吗？',
  },
  {
    code: CommandCode.CMD_SUNROOF_CONTROL,
    name: '开启/关闭天窗',
    category: CommandCategory.WINDOW_ROOF,
    defaultSecurityLevel: SecurityLevel.L1,
    defaultTimeoutMs: 10000,
    defaultFrequencyLimitSeconds: 10,
    canSignalName: 'CAN_SRM_SunroofControlCmd',
    downlinkOpcode: '0x02_0D',
    payloadSchema: {
      action: {
        paramName: 'action',
        type: 'enum',
        required: true,
        description: '天窗动作类型 (OPEN=全开, CLOSE=关闭, TILT=起翘通风)',
        defaultValue: 'OPEN',
        canSignal: 'CAN_SRM_SunroofAction',
        allowedValues: ['OPEN', 'CLOSE', 'TILT'],
      },
    },
    samplePayload: { action: 'OPEN' },
    description: '控制车顶全景天窗遮阳帘与玻璃开启或关闭',
    safetyWarning: '操作全景天窗开闭前请确认车顶无异物遮挡及未处于下雨天气',
  },
];
