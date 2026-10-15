import { ApiError } from '../../api/client.ts';
import { RoutePath } from '../../router/routes.ts';

/**
 * 运营全景看板 6 大核心 KPI 汇总模型
 */
export interface OperationsKpiSummary {
  totalVehicles: number;
  onlineVehicles: number;
  offlineVehicles: number;
  onlineRate: number; // 0 ~ 100 % (保留 1 位小数)
  vehicleGrowthRate: number; // 同比增幅 %
  todayCommands: number;
  commandSuccessRate: number; // 0 ~ 100 % (保留 1 位小数)
  commandGrowthRate: number; // 环比增幅 %
  todayAlarms: number;
  alarmProcessRate: number; // 0 ~ 100 % (保留 1 位小数)
  alarmCriticalCount: number;
  activeUsers: number;
  userActiveRate: number; // 0 ~ 100 % (保留 1 位小数)
  activeOtaPlans: number;
  otaUpgradingVehicles: number;
}

/**
 * 24 小时车辆在线与行驶态势时序数据点
 */
export interface HourlyTrendPoint {
  hour: string; // '00' ~ '23'
  onlineCount: number;
  movingCount: number;
  idleCount: number;
  onlineRate: number; // 在线率 %
}

/**
 * 13 类高频车控指令下发排行数据项
 */
export interface CommandRankItem {
  commandCode: string;
  commandName: string;
  category: string;
  categoryLabel: string;
  count: number;
  successCount: number;
  successRate: number; // 成功率 %
  percentage: number; // 占总指令比例 %
}

/**
 * 24 小时告警严重度分布数据项
 */
export interface AlarmHourlyDistribution {
  hour: string; // '00' ~ '23'
  critical: number; // P0 紧急 (深红)
  warning: number; // P1 警告 (橙黄)
  info: number; // P2 提示 (科技蓝)
  total: number;
}

/**
 * 动力构型与固件版本大盘模型
 */
export interface FleetComposition {
  powertrainDistribution: {
    EV: number; // 纯电
    PHEV: number; // 插电式混合动力
    REEV: number; // 增程式电动
    ICE: number; // 燃油动力
  };
  topFirmwareVersions: Array<{
    version: string;
    count: number;
    percentage: number; // 0 ~ 100 %
  }>;
}

/**
 * 实时运营动态流水条目
 */
export type DashboardStreamType = 'COMMAND' | 'ALARM' | 'OTA' | 'VEHICLE';
export type DashboardStreamLevel = 'INFO' | 'WARNING' | 'CRITICAL';

export interface DashboardStreamItem {
  id: string;
  timestamp: string;
  timestampFormatted: string;
  type: DashboardStreamType;
  level: DashboardStreamLevel;
  title: string;
  content: string;
  targetRoute?: string;
}

/**
 * 看板时间跨度
 */
export type DashboardTimeRange = 'TODAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS';

/**
 * 运营全景大屏全量数据传输对象 (DTO)
 */
export interface DashboardSnapshotDto {
  kpi: OperationsKpiSummary;
  hourlyTrend: HourlyTrendPoint[];
  commandRanking: CommandRankItem[];
  alarmDistribution: AlarmHourlyDistribution[];
  fleetComposition: FleetComposition;
  realtimeStream: DashboardStreamItem[];
  timeRange?: DashboardTimeRange;
  updatedAt: string;
}

/**
 * 标准 13 类指令元数据字典映射
 */
export const STANDARD_COMMAND_META: Record<
  string,
  { name: string; category: string; categoryLabel: string; color: string }
> = {
  CMD_LOCK: { name: '车辆上锁', category: 'DOOR_BODY', categoryLabel: '门窗控制', color: '#1677ff' },
  CMD_UNLOCK: { name: '车辆解锁', category: 'DOOR_BODY', categoryLabel: '门窗控制', color: '#1677ff' },
  CMD_TRUNK_OPEN: { name: '开启后备箱', category: 'DOOR_BODY', categoryLabel: '门窗控制', color: '#1677ff' },
  CMD_TRUNK_CLOSE: { name: '关闭后备箱', category: 'DOOR_BODY', categoryLabel: '门窗控制', color: '#1677ff' },
  CMD_AC_START: { name: '开启空调', category: 'CABIN_CLIMATE', categoryLabel: '座舱空调', color: '#13c2c2' },
  CMD_AC_STOP: { name: '关闭空调', category: 'CABIN_CLIMATE', categoryLabel: '座舱空调', color: '#13c2c2' },
  CMD_SEAT_HEAT: { name: '座椅加热', category: 'CABIN_CLIMATE', categoryLabel: '座舱空调', color: '#13c2c2' },
  CMD_FIND_VEHICLE: { name: '鸣笛寻车', category: 'POWER_FIND', categoryLabel: '动力与寻车', color: '#722ed1' },
  CMD_ENGINE_START: { name: '远程点火启动', category: 'POWER_FIND', categoryLabel: '动力与寻车', color: '#722ed1' },
  CMD_ENGINE_STOP: { name: '远程熄火', category: 'POWER_FIND', categoryLabel: '动力与寻车', color: '#722ed1' },
  CMD_WINDOW_OPEN: { name: '一键降窗', category: 'WINDOW_ROOF', categoryLabel: '车窗天窗', color: '#fa8c16' },
  CMD_WINDOW_CLOSE: { name: '一键升窗', category: 'WINDOW_ROOF', categoryLabel: '车窗天窗', color: '#fa8c16' },
  CMD_SUNROOF_CONTROL: { name: '开启/关闭天窗', category: 'WINDOW_ROOF', categoryLabel: '车窗天窗', color: '#fa8c16' },
};

/**
 * KPI 聚合计算输入接口 (支持实体数组或直接数字统计对象)
 */
export interface CalculateKpiInput {
  vehicles?: Array<{ deviceOnlineStatus?: string; status?: string }> | number;
  commands?: Array<{ status?: string }> | number;
  alarms?: Array<{ status?: string; alarmLevel?: string; triggeredAt?: string | Date }> | number;
  otaPlans?: Array<{ status?: string; upgradingVehicles?: number }> | number;
  userStats?: { activeUsers?: number; userActiveRate?: number };
  growthRates?: { vehicleGrowthRate?: number; commandGrowthRate?: number };

  // 直接数值覆盖
  totalVehicles?: number;
  onlineVehicles?: number;
  todayCommands?: number;
  commandSuccessCount?: number;
  todayAlarms?: number;
  alarmProcessedCount?: number;
  alarmCriticalCount?: number;
  activeUsers?: number;
  userActiveRate?: number;
  activeOtaPlans?: number;
  otaUpgradingVehicles?: number;
  vehicleGrowthRate?: number;
  commandGrowthRate?: number;
}

/**
 * 纯数学聚合函数：计算 6 大核心 KPI 指标，具备严格的零除防御与小数位格式化
 */
export function calculateKpiSummary(input: CalculateKpiInput): OperationsKpiSummary {
  // 1. 车辆规模与在线率
  let totalVehicles = 0;
  let onlineVehicles = 0;

  if (typeof input.totalVehicles === 'number') {
    totalVehicles = input.totalVehicles;
    onlineVehicles = input.onlineVehicles ?? 0;
  } else if (Array.isArray(input.vehicles)) {
    totalVehicles = input.vehicles.length;
    onlineVehicles = input.vehicles.filter((v) => v.deviceOnlineStatus === 'ONLINE').length;
  } else if (typeof input.vehicles === 'number') {
    totalVehicles = input.vehicles;
    onlineVehicles = input.onlineVehicles ?? 0;
  }

  const offlineVehicles = Math.max(0, totalVehicles - onlineVehicles);
  const onlineRate =
    totalVehicles === 0 ? 0 : Number(((onlineVehicles / totalVehicles) * 100).toFixed(1));

  // 2. 车控指令吞吐与成功率
  let todayCommands = 0;
  let commandSuccessCount = 0;

  if (typeof input.todayCommands === 'number') {
    todayCommands = input.todayCommands;
    commandSuccessCount = input.commandSuccessCount ?? todayCommands;
  } else if (Array.isArray(input.commands)) {
    todayCommands = input.commands.length;
    commandSuccessCount = input.commands.filter((c) => c.status === 'SUCCESS').length;
  } else if (typeof input.commands === 'number') {
    todayCommands = input.commands;
    commandSuccessCount = input.commandSuccessCount ?? todayCommands;
  }

  const commandSuccessRate =
    todayCommands === 0 ? 0 : Number(((commandSuccessCount / todayCommands) * 100).toFixed(1));

  // 3. 告警总量、处置闭环率与 P0 紧急告警
  let todayAlarms = 0;
  let processedAlarms = 0;
  let alarmCriticalCount = 0;

  if (typeof input.todayAlarms === 'number') {
    todayAlarms = input.todayAlarms;
    processedAlarms = input.alarmProcessedCount ?? 0;
    alarmCriticalCount = input.alarmCriticalCount ?? 0;
  } else if (Array.isArray(input.alarms)) {
    todayAlarms = input.alarms.length;
    processedAlarms = input.alarms.filter(
      (a) => a.status === 'PROCESSED' || a.status === 'IGNORED'
    ).length;
    alarmCriticalCount = input.alarms.filter(
      (a) =>
        a.alarmLevel === 'CRITICAL' ||
        a.alarmLevel === 'P0' ||
        (a as any).severity === 'CRITICAL'
    ).length;
  } else if (typeof input.alarms === 'number') {
    todayAlarms = input.alarms;
    processedAlarms = input.alarmProcessedCount ?? 0;
    alarmCriticalCount = input.alarmCriticalCount ?? 0;
  }

  const alarmProcessRate =
    todayAlarms === 0 ? 0 : Number(((processedAlarms / todayAlarms) * 100).toFixed(1));

  // 4. 用户活跃指标
  const activeUsers = input.userStats?.activeUsers ?? input.activeUsers ?? 0;
  const userActiveRate =
    input.userStats?.userActiveRate ??
    input.userActiveRate ??
    (totalVehicles === 0 ? 0 : Number(((activeUsers / totalVehicles) * 100).toFixed(1)));

  // 5. OTA 升级批次与车辆
  let activeOtaPlans = 0;
  let otaUpgradingVehicles = 0;

  if (typeof input.activeOtaPlans === 'number') {
    activeOtaPlans = input.activeOtaPlans;
    otaUpgradingVehicles = input.otaUpgradingVehicles ?? 0;
  } else if (Array.isArray(input.otaPlans)) {
    activeOtaPlans = input.otaPlans.filter(
      (p) => p.status !== 'COMPLETED' && p.status !== 'CANCELLED'
    ).length;
    otaUpgradingVehicles = input.otaPlans.reduce(
      (sum, p) => sum + (p.upgradingVehicles ?? 0),
      0
    );
  } else if (typeof input.otaPlans === 'number') {
    activeOtaPlans = input.otaPlans;
    otaUpgradingVehicles = input.otaUpgradingVehicles ?? 0;
  }

  // 6. 增幅比率
  const vehicleGrowthRate =
    input.growthRates?.vehicleGrowthRate ?? input.vehicleGrowthRate ?? 0;
  const commandGrowthRate =
    input.growthRates?.commandGrowthRate ?? input.commandGrowthRate ?? 0;

  return {
    totalVehicles,
    onlineVehicles,
    offlineVehicles,
    onlineRate,
    vehicleGrowthRate,
    todayCommands,
    commandSuccessRate,
    commandGrowthRate,
    todayAlarms,
    alarmProcessRate,
    alarmCriticalCount,
    activeUsers,
    userActiveRate,
    activeOtaPlans,
    otaUpgradingVehicles,
  };
}

/**
 * 纯算法：聚合计算车控指令下发排行横向柱状图数据
 */
export function aggregateCommandRanking(
  commands: Array<{
    commandCode: string;
    commandName?: string;
    category?: string;
    categoryLabel?: string;
    status?: string;
  }>
): CommandRankItem[] {
  if (!commands || commands.length === 0) {
    return [];
  }

  const groupMap = new Map<
    string,
    {
      commandCode: string;
      commandName: string;
      category: string;
      categoryLabel: string;
      count: number;
      successCount: number;
    }
  >();

  for (const item of commands) {
    const code = item.commandCode;
    const std = STANDARD_COMMAND_META[code];
    let entry = groupMap.get(code);

    if (!entry) {
      entry = {
        commandCode: code,
        commandName: item.commandName || std?.name || code,
        category: item.category || std?.category || 'OTHER',
        categoryLabel: item.categoryLabel || std?.categoryLabel || '其他车控',
        count: 0,
        successCount: 0,
      };
      groupMap.set(code, entry);
    }

    entry.count++;
    if (item.status === 'SUCCESS') {
      entry.successCount++;
    }
  }

  const totalAllCommands = commands.length;
  const result: CommandRankItem[] = [];

  for (const entry of groupMap.values()) {
    const successRate =
      entry.count === 0 ? 0 : Number(((entry.successCount / entry.count) * 100).toFixed(1));
    const percentage =
      totalAllCommands === 0
        ? 0
        : Number(((entry.count / totalAllCommands) * 100).toFixed(1));

    result.push({
      commandCode: entry.commandCode,
      commandName: entry.commandName,
      category: entry.category,
      categoryLabel: entry.categoryLabel,
      count: entry.count,
      successCount: entry.successCount,
      successRate,
      percentage,
    });
  }

  // 降序排序
  return result.sort((a, b) => b.count - a.count);
}

/**
 * 纯算法：聚合 24 小时告警分布点
 */
export function aggregateAlarmHourlyDistribution(
  alarms: Array<{
    timestamp?: string | number | Date;
    triggeredAt?: string | number | Date;
    createdAt?: string | number | Date;
    alarmLevel?: string;
    severity?: string;
  }>
): AlarmHourlyDistribution[] {
  const distribution: AlarmHourlyDistribution[] = [];

  for (let i = 0; i < 24; i++) {
    distribution.push({
      hour: String(i).padStart(2, '0'),
      critical: 0,
      warning: 0,
      info: 0,
      total: 0,
    });
  }

  if (!alarms || alarms.length === 0) {
    return distribution;
  }

  for (const alarm of alarms) {
    const rawTime = alarm.triggeredAt || alarm.timestamp || alarm.createdAt;
    if (!rawTime) continue;

    const date = new Date(rawTime);
    if (Number.isNaN(date.getTime())) continue;

    const hourIndex = date.getHours();
    if (hourIndex < 0 || hourIndex > 23) continue;

    const slot = distribution[hourIndex]!;
    const level = (alarm.alarmLevel || alarm.severity || '').toUpperCase();

    if (level === 'CRITICAL' || level === 'P0') {
      slot.critical++;
    } else if (level === 'WARNING' || level === 'P1' || level === 'HIGH') {
      slot.warning++;
    } else {
      slot.info++;
    }
    slot.total++;
  }

  return distribution;
}

/**
 * 纯算法：计算动力类型与前 5 大固件版本占比
 */
export function calculateFleetComposition(
  vehicles: Array<{
    powertrain?: string;
    engineType?: string;
    firmwareVersion?: string;
    version?: string;
  }>
): FleetComposition {
  const powertrainDistribution = {
    EV: 0,
    PHEV: 0,
    REEV: 0,
    ICE: 0,
  };

  if (!vehicles || vehicles.length === 0) {
    return {
      powertrainDistribution,
      topFirmwareVersions: [],
    };
  }

  const versionMap = new Map<string, number>();

  for (const v of vehicles) {
    const rawPt = (v.powertrain || v.engineType || 'EV').toUpperCase();
    if (rawPt.includes('PHEV') || rawPt.includes('HYBRID')) {
      powertrainDistribution.PHEV++;
    } else if (rawPt.includes('REEV') || rawPt.includes('EREV') || rawPt.includes('增程')) {
      powertrainDistribution.REEV++;
    } else if (rawPt.includes('ICE') || rawPt.includes('GAS') || rawPt.includes('FUEL') || rawPt.includes('燃油')) {
      powertrainDistribution.ICE++;
    } else {
      powertrainDistribution.EV++;
    }

    const version = v.firmwareVersion || v.version;
    if (version && version.trim()) {
      const vKey = version.trim();
      versionMap.set(vKey, (versionMap.get(vKey) || 0) + 1);
    }
  }

  const sortedVersions = Array.from(versionMap.entries())
    .map(([version, count]) => ({ version, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const totalVersionVehicles = sortedVersions.reduce((sum, v) => sum + v.count, 0);

  const topFirmwareVersions = sortedVersions.map((item) => ({
    version: item.version,
    count: item.count,
    percentage:
      totalVersionVehicles === 0
        ? 0
        : Number(((item.count / totalVersionVehicles) * 100).toFixed(1)),
  }));

  return {
    powertrainDistribution,
    topFirmwareVersions,
  };
}

/**
 * 模拟推流事件模板库
 */
const MOCK_EVENT_TEMPLATES: Array<Omit<DashboardStreamItem, 'id' | 'timestamp' | 'timestampFormatted'>> = [
  {
    type: 'COMMAND',
    level: 'INFO',
    title: '远程车门控制执行成功',
    content: '车辆 粤B·88888 远程开锁指令执行成功 (端到端耗时 1.1s)',
    targetRoute: RoutePath.COMMANDS,
  },
  {
    type: 'ALARM',
    level: 'CRITICAL',
    title: '车辆异常位移拖车告警 (P0)',
    content: '车辆 京A·12345 熄火设防状态下发生 300m 异常位移，已自动锁定车机',
    targetRoute: RoutePath.ALARMS,
  },
  {
    type: 'OTA',
    level: 'INFO',
    title: 'OTA 批次升级进度更新',
    content: '批次 [2026Q4-OTA-01] 推进至 82.5%，已有 280 辆车完成固件烧录',
    targetRoute: RoutePath.OTA,
  },
  {
    type: 'VEHICLE',
    level: 'INFO',
    title: '车辆上线进入行驶状态',
    content: '车辆 川A·78921 心跳报文刷新，当前车速 58 km/h，电量 82%',
    targetRoute: RoutePath.TELEMETRY,
  },
  {
    type: 'ALARM',
    level: 'WARNING',
    title: '蓄电池欠压告警 (P1)',
    content: '车辆 沪A·D58291 检测到 12V 小电瓶电压 10.7V (<11.2V 欠压阈值)',
    targetRoute: RoutePath.ALARMS,
  },
  {
    type: 'COMMAND',
    level: 'INFO',
    title: '远程空调座舱预冷',
    content: '车辆 粤B·D12345 开启座舱空调设定 24℃ AUTO 风速成功',
    targetRoute: RoutePath.COMMANDS,
  },
  {
    type: 'ALARM',
    level: 'CRITICAL',
    title: '物理 SOS 紧急呼救 (P0)',
    content: '车辆 粤B·F10293 车载物理 SOS 按钮被按下，运维调度坐席已电话接入',
    targetRoute: RoutePath.ALARMS,
  },
  {
    type: 'VEHICLE',
    level: 'INFO',
    title: '电子围栏驶出事件',
    content: '车辆 粤B·33445 正常驶出【深圳高新南区围栏】，状态正常',
    targetRoute: RoutePath.GEOFENCE,
  },
];

let streamEventCounter = 1000;

/**
 * 纯算法：生成用于模拟推流的实时运营动态事件
 */
export function generateMockRealtimeEvent(sequence?: number): DashboardStreamItem {
  const idx =
    typeof sequence === 'number'
      ? sequence % MOCK_EVENT_TEMPLATES.length
      : Math.floor(Math.random() * MOCK_EVENT_TEMPLATES.length);

  const tpl = MOCK_EVENT_TEMPLATES[idx]!;
  const now = new Date();
  const id = `stream-${Date.now()}-${++streamEventCounter}`;
  const timestamp = now.toISOString();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const timestampFormatted = `${hours}:${minutes}:${seconds}`;

  return {
    id,
    timestamp,
    timestampFormatted,
    ...tpl,
  };
}

/**
 * 判断捕获的异常是否为 ApiError 实例
 */
export function isApiError(err: unknown): err is ApiError {
  if (err instanceof ApiError) return true;
  if (typeof err === 'object' && err !== null) {
    const candidate = err as Record<string, unknown>;
    return (
      typeof candidate.statusCode === 'number' &&
      candidate.name === 'ApiError' &&
      typeof candidate.message === 'string'
    );
  }
  return false;
}

/**
 * 24 小时高保真生产环境走势种子
 */
const SEED_HOURLY_TREND: HourlyTrendPoint[] = [
  { hour: '00', onlineCount: 9450, movingCount: 420, idleCount: 9030, onlineRate: 73.5 },
  { hour: '01', onlineCount: 9320, movingCount: 280, idleCount: 9040, onlineRate: 72.5 },
  { hour: '02', onlineCount: 9210, movingCount: 190, idleCount: 9020, onlineRate: 71.7 },
  { hour: '03', onlineCount: 9180, movingCount: 160, idleCount: 9020, onlineRate: 71.4 },
  { hour: '04', onlineCount: 9240, movingCount: 230, idleCount: 9010, onlineRate: 71.9 },
  { hour: '05', onlineCount: 9480, movingCount: 520, idleCount: 8960, onlineRate: 73.8 },
  { hour: '06', onlineCount: 9980, movingCount: 1450, idleCount: 8530, onlineRate: 77.7 },
  { hour: '07', onlineCount: 10620, movingCount: 3200, idleCount: 7420, onlineRate: 82.6 },
  { hour: '08', onlineCount: 11250, movingCount: 4890, idleCount: 6360, onlineRate: 87.5 },
  { hour: '09', onlineCount: 10980, movingCount: 3950, idleCount: 7030, onlineRate: 85.4 },
  { hour: '10', onlineCount: 10750, movingCount: 3120, idleCount: 7630, onlineRate: 83.7 },
  { hour: '11', onlineCount: 10680, movingCount: 2980, idleCount: 7700, onlineRate: 83.1 },
  { hour: '12', onlineCount: 10820, movingCount: 3340, idleCount: 7480, onlineRate: 84.2 },
  { hour: '13', onlineCount: 10700, movingCount: 3050, idleCount: 7650, onlineRate: 83.3 },
  { hour: '14', onlineCount: 10620, movingCount: 2890, idleCount: 7730, onlineRate: 82.6 },
  { hour: '15', onlineCount: 10740, movingCount: 3180, idleCount: 7560, onlineRate: 83.6 },
  { hour: '16', onlineCount: 10920, movingCount: 3620, idleCount: 7300, onlineRate: 85.0 },
  { hour: '17', onlineCount: 11450, movingCount: 4780, idleCount: 6670, onlineRate: 89.1 },
  { hour: '18', onlineCount: 11650, movingCount: 5300, idleCount: 6350, onlineRate: 90.7 },
  { hour: '19', onlineCount: 11380, movingCount: 4420, idleCount: 6960, onlineRate: 88.6 },
  { hour: '20', onlineCount: 10850, movingCount: 3150, idleCount: 7700, onlineRate: 84.4 },
  { hour: '21', onlineCount: 10520, movingCount: 2420, idleCount: 8100, onlineRate: 81.9 },
  { hour: '22', onlineCount: 10180, movingCount: 1650, idleCount: 8530, onlineRate: 79.2 },
  { hour: '23', onlineCount: 9750, movingCount: 880, idleCount: 8870, onlineRate: 75.9 },
];

/**
 * 13 类高频车控指令排行榜种子
 */
const SEED_COMMAND_RANKING: CommandRankItem[] = [
  { commandCode: 'CMD_LOCK', commandName: '车辆上锁', category: 'DOOR_BODY', categoryLabel: '门窗控制', count: 14520, successCount: 14462, successRate: 99.6, percentage: 30.1 },
  { commandCode: 'CMD_UNLOCK', commandName: '车辆解锁', category: 'DOOR_BODY', categoryLabel: '门窗控制', count: 11840, successCount: 11769, successRate: 99.4, percentage: 24.5 },
  { commandCode: 'CMD_AC_START', commandName: '开启空调', category: 'CABIN_CLIMATE', categoryLabel: '座舱空调', count: 6890, successCount: 6807, successRate: 98.8, percentage: 14.3 },
  { commandCode: 'CMD_FIND_VEHICLE', commandName: '鸣笛寻车', category: 'POWER_FIND', categoryLabel: '动力与寻车', count: 4210, successCount: 4172, successRate: 99.1, percentage: 8.7 },
  { commandCode: 'CMD_WINDOW_CLOSE', commandName: '一键升窗', category: 'WINDOW_ROOF', categoryLabel: '车窗天窗', count: 2950, successCount: 2921, successRate: 99.0, percentage: 6.1 },
  { commandCode: 'CMD_AC_STOP', commandName: '关闭空调', category: 'CABIN_CLIMATE', categoryLabel: '座舱空调', count: 2420, successCount: 2408, successRate: 99.5, percentage: 5.0 },
  { commandCode: 'CMD_TRUNK_OPEN', commandName: '开启后备箱', category: 'DOOR_BODY', categoryLabel: '门窗控制', count: 1860, successCount: 1836, successRate: 98.7, percentage: 3.9 },
  { commandCode: 'CMD_TRUNK_CLOSE', commandName: '关闭后备箱', category: 'DOOR_BODY', categoryLabel: '门窗控制', count: 1420, successCount: 1404, successRate: 98.9, percentage: 2.9 },
  { commandCode: 'CMD_WINDOW_OPEN', commandName: '一键降窗', category: 'WINDOW_ROOF', categoryLabel: '车窗天窗', count: 980, successCount: 965, successRate: 98.5, percentage: 2.0 },
  { commandCode: 'CMD_SEAT_HEAT', commandName: '座椅加热', category: 'CABIN_CLIMATE', categoryLabel: '座舱空调', count: 620, successCount: 615, successRate: 99.2, percentage: 1.3 },
  { commandCode: 'CMD_SUNROOF_CONTROL', commandName: '开启/关闭天窗', category: 'WINDOW_ROOF', categoryLabel: '车窗天窗', count: 320, successCount: 314, successRate: 98.1, percentage: 0.7 },
  { commandCode: 'CMD_ENGINE_START', commandName: '远程点火启动', category: 'POWER_FIND', categoryLabel: '动力与寻车', count: 140, successCount: 137, successRate: 97.8, percentage: 0.3 },
  { commandCode: 'CMD_ENGINE_STOP', commandName: '远程熄火', category: 'POWER_FIND', categoryLabel: '动力与寻车', count: 90, successCount: 89, successRate: 98.9, percentage: 0.2 },
];

/**
 * 24 小时告警分布种子 (总计 142 起告警，其中 P0 紧急 3 起，P1 警告 45 起，P2 提示 94 起)
 */
const SEED_ALARM_DISTRIBUTION: AlarmHourlyDistribution[] = [
  { hour: '00', critical: 0, warning: 1, info: 2, total: 3 },
  { hour: '01', critical: 0, warning: 1, info: 1, total: 2 },
  { hour: '02', critical: 0, warning: 0, info: 1, total: 1 },
  { hour: '03', critical: 0, warning: 1, info: 1, total: 2 },
  { hour: '04', critical: 0, warning: 1, info: 2, total: 3 },
  { hour: '05', critical: 1, warning: 2, info: 2, total: 5 }, // 05:00 发生1起拖车告警
  { hour: '06', critical: 0, warning: 2, info: 4, total: 6 },
  { hour: '07', critical: 0, warning: 3, info: 6, total: 9 },
  { hour: '08', critical: 2, warning: 4, info: 8, total: 14 }, // 08:00 发生1起剪线与1起SOS
  { hour: '09', critical: 0, warning: 3, info: 7, total: 10 },
  { hour: '10', critical: 0, warning: 2, info: 6, total: 8 },
  { hour: '11', critical: 0, warning: 2, info: 5, total: 7 },
  { hour: '12', critical: 0, warning: 1, info: 4, total: 5 },
  { hour: '13', critical: 0, warning: 2, info: 5, total: 7 },
  { hour: '14', critical: 0, warning: 3, info: 6, total: 9 },
  { hour: '15', critical: 0, warning: 2, info: 6, total: 8 },
  { hour: '16', critical: 0, warning: 3, info: 7, total: 10 },
  { hour: '17', critical: 0, warning: 4, info: 8, total: 12 },
  { hour: '18', critical: 0, warning: 3, info: 5, total: 8 },
  { hour: '19', critical: 0, warning: 2, info: 3, total: 5 },
  { hour: '20', critical: 0, warning: 1, info: 2, total: 3 },
  { hour: '21', critical: 0, warning: 1, info: 1, total: 2 },
  { hour: '22', critical: 0, warning: 1, info: 1, total: 2 },
  { hour: '23', critical: 0, warning: 0, info: 1, total: 1 },
];

/**
 * 实时运营动态流水种子列表
 */
const SEED_REALTIME_STREAM: DashboardStreamItem[] = [
  {
    id: 'stream-1001',
    timestamp: '2026-10-15T10:52:10Z',
    timestampFormatted: '10:52:10',
    type: 'COMMAND',
    level: 'INFO',
    title: '车门远程解锁执行成功',
    content: '粤B·88888 远程开锁指令执行成功 (耗时 1.1s)',
    targetRoute: RoutePath.COMMANDS,
  },
  {
    id: 'stream-1002',
    timestamp: '2026-10-15T10:50:35Z',
    timestampFormatted: '10:50:35',
    type: 'ALARM',
    level: 'CRITICAL',
    title: '车主紧急呼救按键触发 (P0)',
    content: '粤B·F10293 车载物理 SOS 按键被按下，调度专员已响应接入',
    targetRoute: RoutePath.ALARMS,
  },
  {
    id: 'stream-1003',
    timestamp: '2026-10-15T10:48:20Z',
    timestampFormatted: '10:48:20',
    type: 'OTA',
    level: 'INFO',
    title: 'OTA 批次升级推进至 82.5%',
    content: '批次 [2026Q4-OTA-01] 已完成 280 辆车固件烧录与版本生效',
    targetRoute: RoutePath.OTA,
  },
  {
    id: 'stream-1004',
    timestamp: '2026-10-15T10:45:00Z',
    timestampFormatted: '10:45:00',
    type: 'ALARM',
    level: 'WARNING',
    title: '小蓄电池电压偏低告警 (P1)',
    content: '沪A·D58291 蓄电池电压 10.7V (<11.2V 欠压阈值)',
    targetRoute: RoutePath.ALARMS,
  },
  {
    id: 'stream-1005',
    timestamp: '2026-10-15T10:42:15Z',
    timestampFormatted: '10:42:15',
    type: 'VEHICLE',
    level: 'INFO',
    title: '车辆上线并进入高速行驶',
    content: '川A·78921 心跳报文刷新，当前车速 65 km/h，电量 88%',
    targetRoute: RoutePath.TELEMETRY,
  },
  {
    id: 'stream-1006',
    timestamp: '2026-10-15T10:39:50Z',
    timestampFormatted: '10:39:50',
    type: 'COMMAND',
    level: 'INFO',
    title: '远程空调座舱预冷下发成功',
    content: '粤B·D12345 开启座舱空调设定 24℃ AUTO 模式成功',
    targetRoute: RoutePath.COMMANDS,
  },
  {
    id: 'stream-1007',
    timestamp: '2026-10-15T10:35:10Z',
    timestampFormatted: '10:35:10',
    type: 'ALARM',
    level: 'CRITICAL',
    title: '主供电线路非法剪线 (P0)',
    content: '粤B·98124 主供电线路掉电，当前切换至后备纽扣电池供电',
    targetRoute: RoutePath.ALARMS,
  },
  {
    id: 'stream-1008',
    timestamp: '2026-10-15T10:30:00Z',
    timestampFormatted: '10:30:00',
    type: 'ALARM',
    level: 'INFO',
    title: '告警工单人工闭环处置完成',
    content: '粤B·33445 驶出围栏告警经李运维电话确认售后任务放行',
    targetRoute: RoutePath.ALARMS,
  },
];

/**
 * 完整高保真生产全景大屏快照种子数据
 */
export const SEED_DASHBOARD_SNAPSHOT: DashboardSnapshotDto = {
  kpi: {
    totalVehicles: 12850,
    onlineVehicles: 10950,
    offlineVehicles: 1900,
    onlineRate: 85.2,
    vehicleGrowthRate: 1.8,
    todayCommands: 48250,
    commandSuccessRate: 99.2,
    commandGrowthRate: 12.4,
    todayAlarms: 142,
    alarmProcessRate: 94.5,
    alarmCriticalCount: 3,
    activeUsers: 8420,
    userActiveRate: 64.9,
    activeOtaPlans: 4,
    otaUpgradingVehicles: 320,
  },
  hourlyTrend: SEED_HOURLY_TREND,
  commandRanking: SEED_COMMAND_RANKING,
  alarmDistribution: SEED_ALARM_DISTRIBUTION,
  fleetComposition: {
    powertrainDistribution: {
      EV: 6800,
      PHEV: 3200,
      REEV: 1850,
      ICE: 1000,
    },
    topFirmwareVersions: [
      { version: 'v2.4.1', count: 5782, percentage: 45.0 },
      { version: 'v2.4.0', count: 3598, percentage: 28.0 },
      { version: 'v2.3.8', count: 1799, percentage: 14.0 },
      { version: 'v2.3.5', count: 1028, percentage: 8.0 },
      { version: 'v2.2.0', count: 643, percentage: 5.0 },
    ],
  },
  realtimeStream: SEED_REALTIME_STREAM,
  timeRange: 'TODAY',
  updatedAt: '2026-10-15 10:55:00',
};
