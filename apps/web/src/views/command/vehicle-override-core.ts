import { CommandCode, SecurityLevel } from '@car-control/contracts';
import {
  type ModelTemplateDto,
  type CapabilityRule,
  CommandCategory,
  getCategoryForCommand,
  areConstraintsEqual,
  createDefaultCapabilities,
} from './capability-core.ts';

/**
 * 单车能力覆盖数据传输模型 (DTO)
 * 处于能力继承管道最高优先级 (Global -> Model -> Project -> Vehicle)
 */
export interface VehicleCapabilityOverrideDto {
  id: string;
  vehicleId: string;
  vin: string;
  plateNumber: string;
  modelId: string;
  updatedAt: string;
  updatedBy?: string;
  overrides: Partial<Record<CommandCode, CapabilityRule>>;
}

/**
 * 单车生效指令能力对比项模型
 */
export interface VehicleEffectiveCommandItem {
  commandCode: CommandCode;
  category: CommandCategory;
  isOverridden: boolean; // 是否启用了单车专属覆盖
  effectiveRule: CapabilityRule; // 当前生效的规则 (若覆盖取覆盖值，否则取车型模板值)
  templateRule: CapabilityRule; // 基础车型模板的默认规则
  differsFromTemplate: boolean; // 覆盖值是否与车型模板存在实际属性差异
  overrideReason?: string; // 单车覆盖原因/备注说明
}

/**
 * 单车能力覆盖统计摘要
 */
export interface VehicleOverrideSummaryDto {
  totalCommands: number; // 指令总项数 (通常为 13)
  overriddenCount: number; // 启用专属覆盖的指令数
  differsCount: number; // 实际与车型模板产生差异的指令数
  disabledCount: number; // 当前生效规则下被禁用的指令数
  l2GuardedCount: number; // 当前生效规则下需 L2 高危鉴权的指令数
  hasOverrides: boolean; // 是否存在单车覆盖项
  hasDifferences: boolean; // 是否存在实际差异
}

/**
 * 13 类标准车控指令全量顺序列表
 */
export const ALL_COMMAND_CODES: CommandCode[] = [
  // 门锁与车身
  CommandCode.CMD_LOCK,
  CommandCode.CMD_UNLOCK,
  CommandCode.CMD_TRUNK_OPEN,
  CommandCode.CMD_TRUNK_CLOSE,
  // 动力与寻车
  CommandCode.CMD_FIND_VEHICLE,
  CommandCode.CMD_ENGINE_START,
  CommandCode.CMD_ENGINE_STOP,
  // 座舱温控
  CommandCode.CMD_AC_START,
  CommandCode.CMD_AC_STOP,
  CommandCode.CMD_SEAT_HEAT,
  // 车窗天窗
  CommandCode.CMD_WINDOW_OPEN,
  CommandCode.CMD_WINDOW_CLOSE,
  CommandCode.CMD_SUNROOF_CONTROL,
];

/**
 * 判断两个 CapabilityRule 规则在执行控制层面是否完全一致
 * (比对 supported, securityLevel, timeoutMs, frequencyLimitSeconds 以及 paramConstraints)
 */
export function isRuleEqual(a: CapabilityRule, b: CapabilityRule): boolean {
  if (a === b) return true;
  if (a.supported !== b.supported) return false;
  if (a.securityLevel !== b.securityLevel) return false;
  if (a.timeoutMs !== b.timeoutMs) return false;
  if (a.frequencyLimitSeconds !== b.frequencyLimitSeconds) return false;
  if (!areConstraintsEqual(a.paramConstraints as any, b.paramConstraints as any)) return false;
  return true;
}

/**
 * 计算 13 类指令在单车视角下的最终生效规则与基准模板差异比对
 */
export function resolveVehicleEffectiveList(
  template: ModelTemplateDto,
  override?: VehicleCapabilityOverrideDto | null
): VehicleEffectiveCommandItem[] {
  const defaultCaps = createDefaultCapabilities();
  const result: VehicleEffectiveCommandItem[] = [];

  for (const code of ALL_COMMAND_CODES) {
    const templateRule = template.capabilities[code] || defaultCaps[code];
    const category = getCategoryForCommand(code);
    const isOverridden = Boolean(
      override?.overrides &&
        code in override.overrides &&
        override.overrides[code] !== undefined
    );

    if (isOverridden) {
      const rawEffective = override!.overrides[code]!;
      const effectiveRule: CapabilityRule = {
        supported: rawEffective.supported ?? templateRule.supported,
        securityLevel: rawEffective.securityLevel ?? templateRule.securityLevel,
        timeoutMs: rawEffective.timeoutMs ?? templateRule.timeoutMs,
        frequencyLimitSeconds:
          rawEffective.frequencyLimitSeconds ?? templateRule.frequencyLimitSeconds,
        paramConstraints:
          rawEffective.paramConstraints !== undefined
            ? rawEffective.paramConstraints
            : templateRule.paramConstraints,
        description: rawEffective.description ?? templateRule.description,
      };

      const differsFromTemplate = !isRuleEqual(effectiveRule, templateRule);
      const overrideReason = rawEffective.description || undefined;

      result.push({
        commandCode: code,
        category,
        isOverridden: true,
        effectiveRule,
        templateRule,
        differsFromTemplate,
        overrideReason,
      });
    } else {
      result.push({
        commandCode: code,
        category,
        isOverridden: false,
        effectiveRule: templateRule,
        templateRule,
        differsFromTemplate: false,
        overrideReason: undefined,
      });
    }
  }

  return result;
}

/**
 * 统计单车覆盖项概览核心 KPI 指标
 */
export function calculateOverrideSummary(
  items: VehicleEffectiveCommandItem[]
): VehicleOverrideSummaryDto {
  const totalCommands = items.length;
  let overriddenCount = 0;
  let differsCount = 0;
  let disabledCount = 0;
  let l2GuardedCount = 0;

  for (const item of items) {
    if (item.isOverridden) {
      overriddenCount++;
    }
    if (item.differsFromTemplate) {
      differsCount++;
    }
    if (!item.effectiveRule.supported) {
      disabledCount++;
    }
    if (item.effectiveRule.securityLevel === SecurityLevel.L2) {
      l2GuardedCount++;
    }
  }

  return {
    totalCommands,
    overriddenCount,
    differsCount,
    disabledCount,
    l2GuardedCount,
    hasOverrides: overriddenCount > 0,
    hasDifferences: differsCount > 0,
  };
}

/**
 * 清理与车型基准模板完全一致的冗余覆盖项，优化存储与网络传输载荷
 */
export function cleanRedundantOverrides(
  overrides: Partial<Record<CommandCode, CapabilityRule>>,
  template: ModelTemplateDto
): Partial<Record<CommandCode, CapabilityRule>> {
  const cleaned: Partial<Record<CommandCode, CapabilityRule>> = {};
  for (const [codeStr, rule] of Object.entries(overrides)) {
    if (!rule) continue;
    const code = codeStr as CommandCode;
    const templateRule = template.capabilities[code];
    if (!templateRule) {
      cleaned[code] = rule;
      continue;
    }
    if (!isRuleEqual(rule, templateRule)) {
      cleaned[code] = rule;
    }
  }
  return cleaned;
}

/**
 * 高保真生产级单车能力覆盖种子数据
 */
export const SEED_VEHICLE_OVERRIDES: VehicleCapabilityOverrideDto[] = [
  // 1. 典型测试车辆 (禁用点火与车窗升降，带有明确安全风控覆盖原因)
  {
    id: 'override-veh-001',
    vehicleId: 'veh-001',
    vin: 'LFPH2E023N1000001',
    plateNumber: '粤B·88888',
    modelId: 'model-byd-han',
    updatedAt: '2026-03-01 10:00:00',
    updatedBy: 'system-admin',
    overrides: {
      [CommandCode.CMD_ENGINE_START]: {
        supported: false,
        securityLevel: SecurityLevel.L2,
        timeoutMs: 15000,
        frequencyLimitSeconds: 15,
        description: '测试车辆防盗风控：全场景禁止远程点火启动',
      },
      [CommandCode.CMD_WINDOW_OPEN]: {
        supported: false,
        securityLevel: SecurityLevel.L1,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
        description: '测试车辆安全规范：禁用远程开启车窗',
      },
      [CommandCode.CMD_WINDOW_CLOSE]: {
        supported: false,
        securityLevel: SecurityLevel.L1,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
        description: '测试车辆安全规范：禁用远程关闭车窗',
      },
    },
  },
  // 2. 典型 VIP/应急车辆 (免频控冷却寻车与极速座舱温控保障)
  {
    id: 'override-veh-004',
    vehicleId: 'veh-004',
    vin: 'LFPH2E023N1000004',
    plateNumber: '京A·F66666',
    modelId: 'model-zeekr-001',
    updatedAt: '2026-03-08 09:30:00',
    updatedBy: 'system-admin',
    overrides: {
      [CommandCode.CMD_FIND_VEHICLE]: {
        supported: true,
        securityLevel: SecurityLevel.L0,
        timeoutMs: 10000,
        frequencyLimitSeconds: 0,
        description: 'VIP 专属车队：免冷却快速寻车保障',
      },
      [CommandCode.CMD_AC_START]: {
        supported: true,
        securityLevel: SecurityLevel.L1,
        timeoutMs: 20000,
        frequencyLimitSeconds: 0,
        paramConstraints: {
          tempMin: 16,
          tempMax: 30,
          allowedModes: ['AUTO', 'COOL', 'HEAT', 'VENT'],
          allowedWindSpeeds: [1, 2, 3, 4, 5],
        },
        description: 'VIP 应急座舱温控：零频控极速上电制冷制热',
      },
    },
  },
];
