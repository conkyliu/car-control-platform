import { CommandCode, SecurityLevel } from '@car-control/contracts';

/**
 * 4 大车控业务功能集群
 */
export const CommandCategory = {
  DOOR_BODY: 'DOOR_BODY',
  POWER_FIND: 'POWER_FIND',
  CABIN_CLIMATE: 'CABIN_CLIMATE',
  WINDOW_ROOF: 'WINDOW_ROOF',
} as const;

export type CommandCategory = (typeof CommandCategory)[keyof typeof CommandCategory];

export interface CommandCategoryMeta {
  key: CommandCategory;
  label: string;
  color: string;
  tagColor: string;
  description: string;
  commandCodes: CommandCode[];
}

export const COMMAND_CATEGORY_MAP: Record<CommandCategory, CommandCategoryMeta> = {
  [CommandCategory.DOOR_BODY]: {
    key: CommandCategory.DOOR_BODY,
    label: '车门与车身',
    color: '#1677ff',
    tagColor: 'blue',
    description: '四门门锁闭锁/解锁、电动尾门开闭及设防控制',
    commandCodes: [
      CommandCode.CMD_LOCK,
      CommandCode.CMD_UNLOCK,
      CommandCode.CMD_TRUNK_OPEN,
      CommandCode.CMD_TRUNK_CLOSE,
    ],
  },
  [CommandCategory.POWER_FIND]: {
    key: CommandCategory.POWER_FIND,
    label: '动力与寻车',
    color: '#fa8c16',
    tagColor: 'orange',
    description: '远程点火启动、远程熄火与双闪鸣笛寻车',
    commandCodes: [
      CommandCode.CMD_FIND_VEHICLE,
      CommandCode.CMD_ENGINE_START,
      CommandCode.CMD_ENGINE_STOP,
    ],
  },
  [CommandCategory.CABIN_CLIMATE]: {
    key: CommandCategory.CABIN_CLIMATE,
    label: '座舱温控',
    color: '#52c41a',
    tagColor: 'green',
    description: '车载空调系统开启/关闭与座椅加热多档位控制',
    commandCodes: [
      CommandCode.CMD_AC_START,
      CommandCode.CMD_AC_STOP,
      CommandCode.CMD_SEAT_HEAT,
    ],
  },
  [CommandCategory.WINDOW_ROOF]: {
    key: CommandCategory.WINDOW_ROOF,
    label: '车窗天窗',
    color: '#722ed1',
    tagColor: 'purple',
    description: '四门车窗一键升降与全景天窗/遮阳帘电动开闭',
    commandCodes: [
      CommandCode.CMD_WINDOW_OPEN,
      CommandCode.CMD_WINDOW_CLOSE,
      CommandCode.CMD_SUNROOF_CONTROL,
    ],
  },
};

/**
 * 根据指令代码获取所属功能集群
 */
export function getCategoryForCommand(code: CommandCode): CommandCategory {
  for (const [cat, meta] of Object.entries(COMMAND_CATEGORY_MAP)) {
    if (meta.commandCodes.includes(code)) {
      return cat as CommandCategory;
    }
  }
  return CommandCategory.DOOR_BODY;
}

/**
 * 单项指令能力规则
 */
export interface CapabilityRule {
  supported: boolean;
  securityLevel: SecurityLevel;
  timeoutMs: number;
  frequencyLimitSeconds: number;
  paramConstraints?: Record<string, unknown>;
  description?: string;
}

/**
 * 动力类型定义
 */
export type PowertrainType = 'EV' | 'PHEV' | 'ICE' | 'REEV';

/**
 * 车型能力模板模型
 */
export interface ModelTemplateDto {
  id: string;
  modelId: string;
  modelName: string;
  protocolCode: string; // 0x02 协议十六进制代号 (如 0x0001)
  powertrain: PowertrainType;
  description?: string;
  updatedAt: string;
  updatedBy?: string;
  capabilities: Record<CommandCode, CapabilityRule>;
}

/**
 * 创建车型模板输入
 */
export interface CreateCapabilityTemplateInput {
  modelId: string;
  modelName: string;
  protocolCode: string;
  powertrain: PowertrainType;
  description?: string;
  baseTemplateId?: string;
  capabilities?: Partial<Record<CommandCode, CapabilityRule>>;
}

/**
 * 校验响应超时阈值 (3,000 ~ 60,000ms)
 */
export function validateTimeoutMs(ms: number): { valid: boolean; message?: string } {
  if (typeof ms !== 'number' || isNaN(ms) || !Number.isInteger(ms)) {
    return { valid: false, message: '响应超时阈值必须为整数 (3,000 ~ 60,000ms)' };
  }
  if (ms < 3000 || ms > 60000) {
    return { valid: false, message: '响应超时阈值必须在 3,000ms ~ 60,000ms 范围之间' };
  }
  return { valid: true };
}

/**
 * 校验频控冷却限制 (0 ~ 300s)
 */
export function validateFrequencyLimit(sec: number): { valid: boolean; message?: string } {
  if (typeof sec !== 'number' || isNaN(sec) || !Number.isInteger(sec)) {
    return { valid: false, message: '频控限制必须为整数 (0 ~ 300s)' };
  }
  if (sec < 0 || sec > 300) {
    return { valid: false, message: '频控限制必须在 0 ~ 300s 范围之间 (0 表示无冷却)' };
  }
  return { valid: true };
}

/**
 * 参数约束合法性校验
 */
export function validateParamConstraints(
  code: CommandCode,
  constraints?: unknown
): { valid: boolean; message?: string } {
  if (constraints === undefined || constraints === null) {
    return { valid: true };
  }
  if (typeof constraints !== 'object') {
    return { valid: false, message: '参数约束必须为合法对象' };
  }

  const c = constraints as Record<string, any>;

  if (code === CommandCode.CMD_AC_START) {
    if (c.tempMin !== undefined) {
      if (typeof c.tempMin !== 'number' || c.tempMin < 16 || c.tempMin > 32) {
        return { valid: false, message: '最低温度必须在 16℃ ~ 32℃ 之间' };
      }
    }
    if (c.tempMax !== undefined) {
      if (typeof c.tempMax !== 'number' || c.tempMax < 16 || c.tempMax > 32) {
        return { valid: false, message: '最高温度必须在 16℃ ~ 32℃ 之间' };
      }
    }
    if (c.tempMin !== undefined && c.tempMax !== undefined && c.tempMin > c.tempMax) {
      return { valid: false, message: '空调最低温度不能高于最高温度' };
    }
    if (c.allowedWindSpeeds !== undefined) {
      if (!Array.isArray(c.allowedWindSpeeds) || c.allowedWindSpeeds.length === 0) {
        return { valid: false, message: '允许的风速档位列表不能为空' };
      }
      for (const speed of c.allowedWindSpeeds) {
        if (typeof speed !== 'number' || speed < 1 || speed > 7) {
          return { valid: false, message: '风速档位必须在 1 ~ 7 档之间' };
        }
      }
    }
    return { valid: true };
  }

  if (code === CommandCode.CMD_ENGINE_START) {
    if (c.durationMin !== undefined) {
      if (typeof c.durationMin !== 'number' || c.durationMin < 1 || c.durationMin > 60) {
        return { valid: false, message: '点火运行时长下限必须在 1 ~ 60 分钟之间' };
      }
    }
    if (c.durationMax !== undefined) {
      if (typeof c.durationMax !== 'number' || c.durationMax < 1 || c.durationMax > 60) {
        return { valid: false, message: '点火运行时长上限必须在 1 ~ 60 分钟之间' };
      }
    }
    if (c.durationMin !== undefined && c.durationMax !== undefined && c.durationMin > c.durationMax) {
      return { valid: false, message: '点火时长下限不能大于上限' };
    }
    if (c.durationStep !== undefined) {
      if (typeof c.durationStep !== 'number' || c.durationStep < 1 || c.durationStep > 15) {
        return { valid: false, message: '点火时长步长必须在 1 ~ 15 分钟之间' };
      }
    }
    return { valid: true };
  }

  if (code === CommandCode.CMD_SEAT_HEAT) {
    if (c.maxLevels !== undefined) {
      if (typeof c.maxLevels !== 'number' || c.maxLevels < 1 || c.maxLevels > 5) {
        return { valid: false, message: '座椅加热最高档位必须在 1 ~ 5 档之间' };
      }
    }
    if (c.allowedPositions !== undefined) {
      if (!Array.isArray(c.allowedPositions) || c.allowedPositions.length === 0) {
        return { valid: false, message: '座椅加热支持位置列表不能为空' };
      }
    }
    return { valid: true };
  }

  return { valid: true };
}

/**
 * 模板统计概览数据
 */
export interface TemplateStatsDto {
  totalTemplates: number;
  powertrainCounts: Record<PowertrainType, number>;
  averageCoveragePercent: number;
  l2GuardedCount: number;
  customizedRulesCount: number;
}

/**
 * 计算模板统计概览
 */
export function calculateTemplateStats(templates: ModelTemplateDto[]): TemplateStatsDto {
  const total = templates.length;
  const powertrainCounts: Record<PowertrainType, number> = {
    EV: 0,
    PHEV: 0,
    ICE: 0,
    REEV: 0,
  };

  if (total === 0) {
    return {
      totalTemplates: 0,
      powertrainCounts,
      averageCoveragePercent: 0,
      l2GuardedCount: 0,
      customizedRulesCount: 0,
    };
  }

  let totalSupportedAcrossAll = 0;
  let totalL2 = 0;
  let totalCustomized = 0;

  for (const tpl of templates) {
    if (powertrainCounts[tpl.powertrain] !== undefined) {
      powertrainCounts[tpl.powertrain]++;
    }

    let hasCustomParam = false;
    for (const rule of Object.values(tpl.capabilities)) {
      if (rule.supported) {
        totalSupportedAcrossAll++;
      }
      if (rule.securityLevel === SecurityLevel.L2) {
        totalL2++;
      }
      if (rule.paramConstraints && Object.keys(rule.paramConstraints).length > 0) {
        hasCustomParam = true;
      }
    }
    if (hasCustomParam) {
      totalCustomized++;
    }
  }

  const allPossible = total * 13;
  const averageCoveragePercent = Number(((totalSupportedAcrossAll / allPossible) * 100).toFixed(1));

  return {
    totalTemplates: total,
    powertrainCounts,
    averageCoveragePercent,
    l2GuardedCount: totalL2,
    customizedRulesCount: totalCustomized,
  };
}

/**
 * 指令比对明细
 */
export interface CommandDiffItem {
  commandCode: CommandCode;
  baseRule: CapabilityRule;
  targetRule: CapabilityRule;
  changes: Array<'supported' | 'securityLevel' | 'timeoutMs' | 'frequencyLimitSeconds' | 'paramConstraints'>;
}

/**
 * 模板比对结果
 */
export interface TemplateDiffResult {
  baseId: string;
  targetId: string;
  baseModelName: string;
  targetModelName: string;
  hasDifferences: boolean;
  totalChanges: number;
  diffs: CommandDiffItem[];
}

/**
 * 比对两个车型模板的能力差异
 */
export function diffCapabilityTemplates(
  base: ModelTemplateDto,
  target: ModelTemplateDto
): TemplateDiffResult {
  const diffs: CommandDiffItem[] = [];

  const allCodes = Object.keys(base.capabilities) as CommandCode[];
  for (const code of allCodes) {
    const baseRule = base.capabilities[code];
    const targetRule = target.capabilities[code];
    if (!baseRule || !targetRule) continue;

    const changes: CommandDiffItem['changes'] = [];

    if (baseRule.supported !== targetRule.supported) {
      changes.push('supported');
    }
    if (baseRule.securityLevel !== targetRule.securityLevel) {
      changes.push('securityLevel');
    }
    if (baseRule.timeoutMs !== targetRule.timeoutMs) {
      changes.push('timeoutMs');
    }
    if (baseRule.frequencyLimitSeconds !== targetRule.frequencyLimitSeconds) {
      changes.push('frequencyLimitSeconds');
    }
    if (
      JSON.stringify(baseRule.paramConstraints ?? {}) !==
      JSON.stringify(targetRule.paramConstraints ?? {})
    ) {
      changes.push('paramConstraints');
    }

    if (changes.length > 0) {
      diffs.push({
        commandCode: code,
        baseRule,
        targetRule,
        changes,
      });
    }
  }

  const totalChanges = diffs.reduce((acc, d) => acc + d.changes.length, 0);

  return {
    baseId: base.id,
    targetId: target.id,
    baseModelName: base.modelName,
    targetModelName: target.modelName,
    hasDifferences: diffs.length > 0,
    totalChanges,
    diffs,
  };
}

/**
 * 内存深度克隆车型能力模板
 */
export function cloneModelTemplate(
  source: ModelTemplateDto,
  targetModelId: string,
  targetModelName: string,
  targetProtocolCode: string,
  targetPowertrain?: PowertrainType
): ModelTemplateDto {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  return {
    id: `tpl-${targetModelId}-${Date.now()}`,
    modelId: targetModelId,
    modelName: targetModelName,
    protocolCode: targetProtocolCode,
    powertrain: targetPowertrain ?? source.powertrain,
    description: `克隆自 ${source.modelName} (${source.protocolCode})`,
    updatedAt: now,
    updatedBy: 'operator-admin',
    capabilities: JSON.parse(JSON.stringify(source.capabilities)),
  };
}

/**
 * 默认全量基础能力生成工具
 */
export function createDefaultCapabilities(): Record<CommandCode, CapabilityRule> {
  return {
    [CommandCode.CMD_LOCK]: {
      supported: true,
      securityLevel: SecurityLevel.L0,
      timeoutMs: 10000,
      frequencyLimitSeconds: 3,
      description: '全车中控门锁闭锁',
    },
    [CommandCode.CMD_UNLOCK]: {
      supported: true,
      securityLevel: SecurityLevel.L1,
      timeoutMs: 10000,
      frequencyLimitSeconds: 3,
      description: '全车中控门锁解锁',
    },
    [CommandCode.CMD_TRUNK_OPEN]: {
      supported: true,
      securityLevel: SecurityLevel.L1,
      timeoutMs: 10000,
      frequencyLimitSeconds: 5,
      description: '后备箱尾门解锁弹开',
    },
    [CommandCode.CMD_TRUNK_CLOSE]: {
      supported: true,
      securityLevel: SecurityLevel.L1,
      timeoutMs: 10000,
      frequencyLimitSeconds: 5,
      description: '电动尾门电动关闭',
    },
    [CommandCode.CMD_FIND_VEHICLE]: {
      supported: true,
      securityLevel: SecurityLevel.L0,
      timeoutMs: 10000,
      frequencyLimitSeconds: 5,
      description: '双闪鸣笛寻车',
    },
    [CommandCode.CMD_ENGINE_START]: {
      supported: true,
      securityLevel: SecurityLevel.L2,
      timeoutMs: 15000,
      frequencyLimitSeconds: 15,
      paramConstraints: {
        durationMin: 5,
        durationMax: 45,
        durationStep: 5,
      },
      description: '远程点火/高压上电起动',
    },
    [CommandCode.CMD_ENGINE_STOP]: {
      supported: true,
      securityLevel: SecurityLevel.L2,
      timeoutMs: 15000,
      frequencyLimitSeconds: 15,
      description: '远程熄火/高压切断',
    },
    [CommandCode.CMD_AC_START]: {
      supported: true,
      securityLevel: SecurityLevel.L1,
      timeoutMs: 15000,
      frequencyLimitSeconds: 10,
      paramConstraints: {
        tempMin: 16,
        tempMax: 30,
        allowedModes: ['AUTO', 'COOL', 'HEAT', 'VENT'],
        allowedWindSpeeds: [1, 2, 3, 4, 5],
      },
      description: '座舱空调开启与温控设定',
    },
    [CommandCode.CMD_AC_STOP]: {
      supported: true,
      securityLevel: SecurityLevel.L0,
      timeoutMs: 10000,
      frequencyLimitSeconds: 5,
      description: '座舱空调快速关闭',
    },
    [CommandCode.CMD_SEAT_HEAT]: {
      supported: true,
      securityLevel: SecurityLevel.L1,
      timeoutMs: 10000,
      frequencyLimitSeconds: 5,
      paramConstraints: {
        maxLevels: 3,
        allowedPositions: ['DRIVER', 'PASSENGER'],
      },
      description: '主副驾座椅加热档位调节',
    },
    [CommandCode.CMD_WINDOW_OPEN]: {
      supported: true,
      securityLevel: SecurityLevel.L1,
      timeoutMs: 10000,
      frequencyLimitSeconds: 5,
      description: '四门车窗一键降下通风',
    },
    [CommandCode.CMD_WINDOW_CLOSE]: {
      supported: true,
      securityLevel: SecurityLevel.L1,
      timeoutMs: 10000,
      frequencyLimitSeconds: 5,
      description: '四门车窗一键升起关闭',
    },
    [CommandCode.CMD_SUNROOF_CONTROL]: {
      supported: true,
      securityLevel: SecurityLevel.L1,
      timeoutMs: 10000,
      frequencyLimitSeconds: 5,
      description: '车顶全景天窗与遮阳帘控制',
    },
  };
}

/**
 * 生产级高保真 3 大典型车型能力模板种子
 */
export const SEED_CAPABILITY_TEMPLATES: ModelTemplateDto[] = [
  // 1. 纯电旗舰 (EV, 13/13 全量支持)
  {
    id: 'tpl-ev-flagship',
    modelId: 'model-ev-flagship',
    modelName: '极光 01 纯电旗舰',
    protocolCode: '0x0001',
    powertrain: 'EV',
    description: '纯电高端智能旗舰车型全量能力模板 (13项全量支持，多档温控与座椅加热)',
    updatedAt: '2026-02-01 10:00:00',
    updatedBy: 'system-admin',
    capabilities: createDefaultCapabilities(),
  },
  // 2. 经济燃油 (ICE, 9/13 支持，无天窗/无座椅加热/无电尾门/无一键关窗，点火为 L2)
  {
    id: 'tpl-ice-economy',
    modelId: 'model-ice-economy',
    modelName: '凌风 03 燃油经济版',
    protocolCode: '0x0002',
    powertrain: 'ICE',
    description: '经济型传统燃油乘用车能力模板 (9项支持，无天窗/座椅加热/电尾门)',
    updatedAt: '2026-02-02 11:30:00',
    updatedBy: 'system-admin',
    capabilities: {
      ...createDefaultCapabilities(),
      [CommandCode.CMD_TRUNK_CLOSE]: {
        supported: false,
        securityLevel: SecurityLevel.L1,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
        description: '该车型未配备电动尾门硬件',
      },
      [CommandCode.CMD_ENGINE_START]: {
        supported: true,
        securityLevel: SecurityLevel.L2,
        timeoutMs: 20000,
        frequencyLimitSeconds: 30,
        paramConstraints: {
          durationMin: 5,
          durationMax: 30,
          durationStep: 5,
        },
        description: '传统发动机远程起动预热，严格防盗安全校验',
      },
      [CommandCode.CMD_ENGINE_STOP]: {
        supported: true,
        securityLevel: SecurityLevel.L2,
        timeoutMs: 20000,
        frequencyLimitSeconds: 30,
        description: '传统燃油发动机远程熄火',
      },
      [CommandCode.CMD_AC_START]: {
        supported: true,
        securityLevel: SecurityLevel.L1,
        timeoutMs: 15000,
        frequencyLimitSeconds: 15,
        paramConstraints: {
          tempMin: 18,
          tempMax: 28,
          allowedModes: ['AUTO', 'COOL', 'HEAT'],
          allowedWindSpeeds: [1, 2, 3],
        },
        description: '燃油空调远程启动',
      },
      [CommandCode.CMD_SEAT_HEAT]: {
        supported: false,
        securityLevel: SecurityLevel.L1,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
        description: '该车型无座椅电加热硬件',
      },
      [CommandCode.CMD_WINDOW_CLOSE]: {
        supported: false,
        securityLevel: SecurityLevel.L1,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
        description: '该车型未配备四门一键防夹升窗模块',
      },
      [CommandCode.CMD_SUNROOF_CONTROL]: {
        supported: false,
        securityLevel: SecurityLevel.L1,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
        description: '该车型无天窗硬件',
      },
    },
  },
  // 3. 插混 SUV (PHEV, 12/13 支持，除座椅加热外全支持)
  {
    id: 'tpl-phev-suv',
    modelId: 'model-phev-suv',
    modelName: '远航 05 混动越野',
    protocolCode: '0x0003',
    powertrain: 'PHEV',
    description: '插电式混动越野 SUV 能力模板 (12项支持，无座椅加热)',
    updatedAt: '2026-02-03 14:20:00',
    updatedBy: 'system-admin',
    capabilities: {
      ...createDefaultCapabilities(),
      [CommandCode.CMD_SEAT_HEAT]: {
        supported: false,
        securityLevel: SecurityLevel.L1,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
        description: '越野版未选配座椅加热舒适包',
      },
    },
  },
];
