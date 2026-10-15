import { CommandCode, SecurityLevel } from '@car-control/contracts';
import { CommandCategory, COMMAND_CATEGORY_MAP } from './capability-core.ts';

export { CommandCode, SecurityLevel, CommandCategory };

/**
 * 协议参数数据类型
 */
export type ProtocolParamType = 'string' | 'number' | 'boolean' | 'enum' | 'object';

/**
 * 协议下行参数详细 Schema 约束
 */
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

/**
 * 指令字典项领域模型
 */
export interface CommandDictionaryItem {
  code: CommandCode;
  name: string;
  category: CommandCategory;
  defaultSecurityLevel: SecurityLevel;
  defaultTimeoutMs: number;
  defaultFrequencyLimitSeconds: number;
  canSignalName: string;
  downlinkOpcode: string; // 格式如 0x02_01
  payloadSchema: Record<string, ProtocolParamSchema>;
  samplePayload: Record<string, unknown>;
  description: string;
  safetyWarning?: string;
}

/**
 * 字典统计 KPI 概览模型
 */
export interface DictionaryStats {
  total: number;
  l0Count: number;
  l1Count: number;
  l2Count: number;
  parametricCount: number;
  averageTimeoutMs: number;
  averageFrequencyLimitSeconds: number;
  categoryCounts: Record<CommandCategory, number>;
}

/**
 * 多维检索过滤条件
 */
export interface DictionaryFilterQuery {
  keyword?: string;
  category?: CommandCategory | 'ALL';
  securityLevel?: SecurityLevel | 'ALL';
}

/**
 * Payload Schema 校验结果
 */
export interface PayloadValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * 全量 13 类标准生产环境控车指令字典种子定义
 */
export const SEED_COMMAND_DICTIONARY: CommandDictionaryItem[] = [
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

/**
 * 计算指令字典整体统计指标
 */
export function calculateDictionaryStats(items: CommandDictionaryItem[]): DictionaryStats {
  const initialCategoryCounts: Record<CommandCategory, number> = {
    [CommandCategory.DOOR_BODY]: 0,
    [CommandCategory.POWER_FIND]: 0,
    [CommandCategory.CABIN_CLIMATE]: 0,
    [CommandCategory.WINDOW_ROOF]: 0,
  };

  if (!items || items.length === 0) {
    return {
      total: 0,
      l0Count: 0,
      l1Count: 0,
      l2Count: 0,
      parametricCount: 0,
      averageTimeoutMs: 0,
      averageFrequencyLimitSeconds: 0,
      categoryCounts: initialCategoryCounts,
    };
  }

  let l0Count = 0;
  let l1Count = 0;
  let l2Count = 0;
  let parametricCount = 0;
  let totalTimeout = 0;
  let totalFreqLimit = 0;
  const categoryCounts = { ...initialCategoryCounts };

  for (const item of items) {
    if (item.defaultSecurityLevel === SecurityLevel.L0) l0Count++;
    else if (item.defaultSecurityLevel === SecurityLevel.L1) l1Count++;
    else if (item.defaultSecurityLevel === SecurityLevel.L2) l2Count++;

    if (item.payloadSchema && Object.keys(item.payloadSchema).length > 0) {
      parametricCount++;
    }

    totalTimeout += item.defaultTimeoutMs;
    totalFreqLimit += item.defaultFrequencyLimitSeconds;

    if (categoryCounts[item.category] !== undefined) {
      categoryCounts[item.category]++;
    }
  }

  const count = items.length;

  return {
    total: count,
    l0Count,
    l1Count,
    l2Count,
    parametricCount,
    averageTimeoutMs: Math.round(totalTimeout / count),
    averageFrequencyLimitSeconds: Math.round((totalFreqLimit / count) * 10) / 10,
    categoryCounts,
  };
}

/**
 * 依据检索条件过滤指令字典列表
 */
export function filterDictionaryItems(
  items: CommandDictionaryItem[],
  query?: DictionaryFilterQuery
): CommandDictionaryItem[] {
  if (!items) return [];
  if (!query) return items;

  const kw = query.keyword ? query.keyword.trim().toLowerCase() : '';
  const cat = query.category;
  const sec = query.securityLevel;

  return items.filter((item) => {
    // 关键字检索
    if (kw) {
      const matchCode = item.code.toLowerCase().includes(kw);
      const matchName = item.name.toLowerCase().includes(kw);
      const matchOpcode = item.downlinkOpcode.toLowerCase().includes(kw);
      const matchCan = item.canSignalName.toLowerCase().includes(kw);
      const matchDesc = item.description.toLowerCase().includes(kw);
      if (!matchCode && !matchName && !matchOpcode && !matchCan && !matchDesc) {
        return false;
      }
    }

    // 分类筛选
    if (cat && cat !== 'ALL') {
      if (item.category !== cat) return false;
    }

    // 安全等级筛选
    if (sec && sec !== 'ALL') {
      if (item.defaultSecurityLevel !== sec) return false;
    }

    return true;
  });
}

/**
 * 校验下行 payload 是否符合指令参数 Schema
 */
export function validatePayloadAgainstSchema(
  schema: Record<string, ProtocolParamSchema>,
  payload: Record<string, unknown>
): PayloadValidationResult {
  const errors: string[] = [];

  for (const [key, paramSchema] of Object.entries(schema)) {
    const val = payload[key];

    // 必填项检查
    if (paramSchema.required) {
      if (val === undefined || val === null || val === '') {
        errors.push(`参数【${paramSchema.paramName}】为必填项`);
        continue;
      }
    }

    if (val === undefined || val === null) {
      continue;
    }

    // 类型检查
    if (paramSchema.type === 'number') {
      if (typeof val !== 'number' || Number.isNaN(val)) {
        errors.push(`参数【${paramSchema.paramName}】必须为数值类型`);
      } else {
        if (paramSchema.minimum !== undefined && val < paramSchema.minimum) {
          errors.push(`参数【${paramSchema.paramName}】不能小于最小值 ${paramSchema.minimum}`);
        }
        if (paramSchema.maximum !== undefined && val > paramSchema.maximum) {
          errors.push(`参数【${paramSchema.paramName}】不能大于最大值 ${paramSchema.maximum}`);
        }
      }
    } else if (paramSchema.type === 'enum') {
      if (paramSchema.allowedValues && !paramSchema.allowedValues.includes(val as string | number)) {
        errors.push(`参数【${paramSchema.paramName}】取值不在允许的枚举集合 [${paramSchema.allowedValues.join(', ')}] 内`);
      }
    } else if (paramSchema.type === 'string') {
      if (typeof val !== 'string') {
        errors.push(`参数【${paramSchema.paramName}】必须为字符串`);
      }
    } else if (paramSchema.type === 'boolean') {
      if (typeof val !== 'boolean') {
        errors.push(`参数【${paramSchema.paramName}】必须为布尔值`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 生成 Markdown 格式的标准控车协议与字典手册
 */
export function generateDictionaryMarkdown(items: CommandDictionaryItem[]): string {
  const stats = calculateDictionaryStats(items);
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

  let md = `# 控车协议参数与指令字典手册\n\n`;
  md += `> **生成时间**：${now}  \n`;
  md += `> **指令总数**：${stats.total} 类标准指令 | **L2 强门禁高危**：${stats.l2Count} 项 | **支持动态参数**：${stats.parametricCount} 项\n\n`;

  md += `## 1. 控车指令总览矩阵\n\n`;
  md += `| 指令代码 | 指令名称 | 业务集群 | 下行 Opcode | 默认安全等级 | 默认超时 | 冷却限制 | CAN 信号代号 |\n`;
  md += `|---|---|---|---|---|---|---|---|\n`;

  for (const item of items) {
    const catLabel = COMMAND_CATEGORY_MAP[item.category]?.label || item.category;
    md += `| \`${item.code}\` | ${item.name} | ${catLabel} | \`${item.downlinkOpcode}\` | ${item.defaultSecurityLevel} | ${item.defaultTimeoutMs}ms | ${item.defaultFrequencyLimitSeconds}s | \`${item.canSignalName}\` |\n`;
  }

  md += `\n---\n\n`;
  md += `## 2. 协议详细报文与下行 Payload 规范\n\n`;

  items.forEach((item, idx) => {
    const catLabel = COMMAND_CATEGORY_MAP[item.category]?.label || item.category;
    md += `### ${idx + 1}. ${item.name} (\`${item.code}\`)\n\n`;
    md += `- **指令代码 (Code)**: \`${item.code}\`\n`;
    md += `- **下行控制字 (Opcode)**: \`${item.downlinkOpcode}\`\n`;
    md += `- **业务功能分类**: ${catLabel}\n`;
    md += `- **默认安全等级**: ${item.defaultSecurityLevel}\n`;
    md += `- **默认超时时间**: ${item.defaultTimeoutMs}ms\n`;
    md += `- **默认冷却频控**: ${item.defaultFrequencyLimitSeconds}s\n`;
    md += `- **CAN 总线信号映射**: \`${item.canSignalName}\`\n`;
    md += `- **功能说明**: ${item.description}\n`;

    if (item.safetyWarning) {
      md += `- **安全提示**: ⚠️ ${item.safetyWarning}\n`;
    }

    const paramEntries = Object.entries(item.payloadSchema || {});
    if (paramEntries.length > 0) {
      md += `\n#### 下行 Payload Schema 约束\n\n`;
      md += `| 参数名 | 类型 | 必填 | 单位 | 默认值 | 允许取值 / 范围 | 说明 | CAN 信号 |\n`;
      md += `|---|---|---|---|---|---|---|---|\n`;
      for (const [key, p] of paramEntries) {
        let rangeStr = '-';
        if (p.allowedValues) {
          rangeStr = `[${p.allowedValues.join(', ')}]`;
        } else if (p.minimum !== undefined || p.maximum !== undefined) {
          rangeStr = `${p.minimum ?? '-'} ~ ${p.maximum ?? '-'}`;
          if (p.step) rangeStr += ` (步长 ${p.step})`;
        }
        md += `| \`${key}\` | \`${p.type}\` | ${p.required ? '**是**' : '否'} | ${p.unit || '-'} | ${p.defaultValue !== undefined ? `\`${p.defaultValue}\`` : '-'} | ${rangeStr} | ${p.description} | \`${p.canSignal || '-'}\` |\n`;
      }
    } else {
      md += `\n*注：该指令为标准固定下行帧，无动态下行参数配置项。*\n`;
    }

    md += `\n#### JSON 示例报文\n\n`;
    md += '```json\n';
    md += JSON.stringify(item.samplePayload, null, 2);
    md += '\n```\n\n';
  });

  return md;
}

/**
 * 单元格防公式注入清洗函数 (CWE-1236 Defense)
 * 若字段以 =, +, -, @, \t, \r 开头，则追加单引号前缀阻断 Excel/Calc 公式执行
 */
export function sanitizeCsvCell(rawVal: unknown): string {
  if (rawVal === null || rawVal === undefined) {
    return '';
  }

  let text = String(rawVal);
  const trimmed = text.trimStart();

  // CWE-1236 Formula Injection 防御
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    text = `'${trimmed}`;
  }

  // RFC 4180 转义：含有逗号、双引号、换行符的字段需加双引号，内部双引号写成两个双引号
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

/**
 * 生成 RFC 4180 标准且具备 UTF-8 BOM 和 CWE-1236 防御的 CSV 字典文档
 */
export function generateDictionaryCsv(items: CommandDictionaryItem[]): string {
  const headers = [
    '指令代码',
    '指令名称',
    '业务集群',
    '下行Opcode',
    '安全等级',
    '默认超时(ms)',
    '频控冷却(s)',
    'CAN信号',
    '参数数量',
    '功能描述',
    '安全提示',
  ];

  const rows: string[] = [headers.join(',')];

  for (const item of items) {
    const catLabel = COMMAND_CATEGORY_MAP[item.category]?.label || item.category;
    const paramCount = Object.keys(item.payloadSchema || {}).length;

    const rowCells = [
      sanitizeCsvCell(item.code),
      sanitizeCsvCell(item.name),
      sanitizeCsvCell(catLabel),
      sanitizeCsvCell(item.downlinkOpcode),
      sanitizeCsvCell(item.defaultSecurityLevel),
      sanitizeCsvCell(item.defaultTimeoutMs),
      sanitizeCsvCell(item.defaultFrequencyLimitSeconds),
      sanitizeCsvCell(item.canSignalName),
      sanitizeCsvCell(paramCount),
      sanitizeCsvCell(item.description),
      sanitizeCsvCell(item.safetyWarning || ''),
    ];

    rows.push(rowCells.join(','));
  }

  // 写入 UTF-8 BOM 标识 \uFEFF，防止中文在 Windows Excel 下出现乱码
  return `\uFEFF${rows.join('\n')}\n`;
}
