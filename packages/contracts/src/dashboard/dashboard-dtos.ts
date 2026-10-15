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
  critical: number; // P0 紧急
  warning: number; // P1 警告
  info: number; // P2 提示
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
