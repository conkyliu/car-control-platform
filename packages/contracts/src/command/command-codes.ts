export enum CommandCode {
  CMD_LOCK = 'CMD_LOCK',
  CMD_UNLOCK = 'CMD_UNLOCK',
  CMD_FIND_VEHICLE = 'CMD_FIND_VEHICLE',
  CMD_TRUNK_OPEN = 'CMD_TRUNK_OPEN',
  CMD_TRUNK_CLOSE = 'CMD_TRUNK_CLOSE',
  CMD_ENGINE_START = 'CMD_ENGINE_START',
  CMD_ENGINE_STOP = 'CMD_ENGINE_STOP',
  CMD_WINDOW_OPEN = 'CMD_WINDOW_OPEN',
  CMD_WINDOW_CLOSE = 'CMD_WINDOW_CLOSE',
  CMD_AC_START = 'CMD_AC_START',
  CMD_AC_STOP = 'CMD_AC_STOP',
}

export enum SecurityLevel {
  L0 = 'L0', // 无需额外安全校验
  L1 = 'L1', // 安全码 / 密码验证
  L2 = 'L2', // 强安全二次确认 / 验证码
}

export interface CommandDefinitionMeta {
  code: CommandCode;
  name: string;
  defaultTimeoutMs: number;
  defaultSecurityLevel: SecurityLevel;
}

export const COMMAND_DEFINITIONS: Record<CommandCode, CommandDefinitionMeta> = {
  [CommandCode.CMD_LOCK]: {
    code: CommandCode.CMD_LOCK,
    name: '车辆上锁',
    defaultTimeoutMs: 10000,
    defaultSecurityLevel: SecurityLevel.L0,
  },
  [CommandCode.CMD_UNLOCK]: {
    code: CommandCode.CMD_UNLOCK,
    name: '车辆解锁',
    defaultTimeoutMs: 10000,
    defaultSecurityLevel: SecurityLevel.L1,
  },
  [CommandCode.CMD_FIND_VEHICLE]: {
    code: CommandCode.CMD_FIND_VEHICLE,
    name: '鸣笛寻车',
    defaultTimeoutMs: 10000,
    defaultSecurityLevel: SecurityLevel.L0,
  },
  [CommandCode.CMD_TRUNK_OPEN]: {
    code: CommandCode.CMD_TRUNK_OPEN,
    name: '开启后备箱',
    defaultTimeoutMs: 10000,
    defaultSecurityLevel: SecurityLevel.L1,
  },
  [CommandCode.CMD_TRUNK_CLOSE]: {
    code: CommandCode.CMD_TRUNK_CLOSE,
    name: '关闭后备箱',
    defaultTimeoutMs: 10000,
    defaultSecurityLevel: SecurityLevel.L1,
  },
  [CommandCode.CMD_ENGINE_START]: {
    code: CommandCode.CMD_ENGINE_START,
    name: '远程点火启动',
    defaultTimeoutMs: 15000,
    defaultSecurityLevel: SecurityLevel.L2,
  },
  [CommandCode.CMD_ENGINE_STOP]: {
    code: CommandCode.CMD_ENGINE_STOP,
    name: '远程熄火',
    defaultTimeoutMs: 15000,
    defaultSecurityLevel: SecurityLevel.L2,
  },
  [CommandCode.CMD_WINDOW_OPEN]: {
    code: CommandCode.CMD_WINDOW_OPEN,
    name: '开启车窗',
    defaultTimeoutMs: 10000,
    defaultSecurityLevel: SecurityLevel.L1,
  },
  [CommandCode.CMD_WINDOW_CLOSE]: {
    code: CommandCode.CMD_WINDOW_CLOSE,
    name: '关闭车窗',
    defaultTimeoutMs: 10000,
    defaultSecurityLevel: SecurityLevel.L1,
  },
  [CommandCode.CMD_AC_START]: {
    code: CommandCode.CMD_AC_START,
    name: '开启空调',
    defaultTimeoutMs: 15000,
    defaultSecurityLevel: SecurityLevel.L1,
  },
  [CommandCode.CMD_AC_STOP]: {
    code: CommandCode.CMD_AC_STOP,
    name: '关闭空调',
    defaultTimeoutMs: 10000,
    defaultSecurityLevel: SecurityLevel.L0,
  },
};
