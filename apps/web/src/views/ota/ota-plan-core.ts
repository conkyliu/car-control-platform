import {
  FirmwareType,
  FirmwareStatus,
  type FirmwarePackageDto,
  SEED_FIRMWARE_PACKAGES,
} from './firmware-core.ts';
import { type VehicleDto } from '../vehicle/vehicle-core.ts';

/**
 * 升级模式 (静默升级 vs 车主确认)
 */
export const UpgradeMode = {
  SILENT: 'SILENT',
  USER_CONFIRM: 'USER_CONFIRM',
} as const;

export type UpgradeMode = (typeof UpgradeMode)[keyof typeof UpgradeMode];

export interface UpgradeModeMeta {
  mode: UpgradeMode;
  label: string;
  tagColor: string;
  description: string;
  recommendedScenario: string;
}

export const UPGRADE_MODE_METADATA: Record<UpgradeMode, UpgradeModeMeta> = {
  [UpgradeMode.SILENT]: {
    mode: UpgradeMode.SILENT,
    label: '静默无感升级',
    tagColor: 'purple',
    description: '静默无感夜间升级，无需车主干预，车辆驻车锁止时后台自动刷写',
    recommendedScenario: '深夜 02:00~05:00 驻车低谷期、紧急安全补丁修复',
  },
  [UpgradeMode.USER_CONFIRM]: {
    mode: UpgradeMode.USER_CONFIRM,
    label: '车主大屏确认',
    tagColor: 'blue',
    description: '车机大屏弹窗提示，展示版本新特性与耗时，需车主点击确认后执行',
    recommendedScenario: '重大功能迭代升级、需车主预留用车时间的系统更新',
  },
};

/**
 * 下发调度类型 (立即启动 vs 定时预约)
 */
export const ScheduleType = {
  IMMEDIATE: 'IMMEDIATE',
  SCHEDULED: 'SCHEDULED',
} as const;

export type ScheduleType = (typeof ScheduleType)[keyof typeof ScheduleType];

export interface ScheduleTypeMeta {
  type: ScheduleType;
  label: string;
  description: string;
}

export const SCHEDULE_TYPE_METADATA: Record<ScheduleType, ScheduleTypeMeta> = {
  [ScheduleType.IMMEDIATE]: {
    type: ScheduleType.IMMEDIATE,
    label: '立即启动下发',
    description: '计划审批通过后立即向目标车辆推送升级指令',
  },
  [ScheduleType.SCHEDULED]: {
    type: ScheduleType.SCHEDULED,
    label: '定时预约执行',
    description: '在设定的时间窗口内，向符合安全条件的车辆分批推送升级',
  },
};

/**
 * OTA 计划生命周期状态
 */
export const OtaPlanStatus = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  ABORTED: 'ABORTED',
} as const;

export type OtaPlanStatus = (typeof OtaPlanStatus)[keyof typeof OtaPlanStatus];

export interface OtaPlanStatusMeta {
  status: OtaPlanStatus;
  label: string;
  badgeStatus: 'default' | 'processing' | 'success' | 'warning' | 'error';
  color: string;
  tagColor: string;
  description: string;
}

export const OTA_PLAN_STATUS_METADATA: Record<OtaPlanStatus, OtaPlanStatusMeta> = {
  [OtaPlanStatus.DRAFT]: {
    status: OtaPlanStatus.DRAFT,
    label: '草稿待定',
    badgeStatus: 'default',
    color: '#8c8c8c',
    tagColor: 'default',
    description: '计划已创建未下发，可编辑修改或删除',
  },
  [OtaPlanStatus.SCHEDULED]: {
    status: OtaPlanStatus.SCHEDULED,
    label: '定时等待中',
    badgeStatus: 'warning',
    color: '#faad14',
    tagColor: 'warning',
    description: '计划已排期，等待预约窗口到达自动触发',
  },
  [OtaPlanStatus.RUNNING]: {
    status: OtaPlanStatus.RUNNING,
    label: '升级执行中',
    badgeStatus: 'processing',
    color: '#1677ff',
    tagColor: 'processing',
    description: '批次升级正在下发与烧录，实时监控进度与熔断指标',
  },
  [OtaPlanStatus.PAUSED]: {
    status: OtaPlanStatus.PAUSED,
    label: '已暂停挂起',
    badgeStatus: 'warning',
    color: '#fa8c16',
    tagColor: 'orange',
    description: '运维人员手动暂停或触发前置异常排查，可恢复执行',
  },
  [OtaPlanStatus.COMPLETED]: {
    status: OtaPlanStatus.COMPLETED,
    label: '已完成结束',
    badgeStatus: 'success',
    color: '#52c41a',
    tagColor: 'success',
    description: '批次升级已全部执行完毕，处于终态不可再流转',
  },
  [OtaPlanStatus.ABORTED]: {
    status: OtaPlanStatus.ABORTED,
    label: '已终止熔断',
    badgeStatus: 'error',
    color: '#ff4d4f',
    tagColor: 'error',
    description: '因失败率超标触发自动熔断或被管理员手动紧急终止，处于终态',
  },
};

/**
 * 安全前置门禁规范
 */
export interface OtaSafetyPreconditions {
  /** 动力电池最低荷电状态 SoC (20% ~ 80%，默认 >= 30%) */
  minBatterySoc: number;
  /** 车辆必须处于静止 P 档状态 (强制为 true，杜绝行驶中刷写) */
  requireStationary: boolean;
  /** 必须处于非充电中 (可选) */
  requireNotCharging?: boolean;
}

/**
 * OTA 执行与容错参数配置
 */
export interface OtaExecutionConfig {
  /** 下载超时时间 (分钟，5~120) */
  downloadTimeoutMin: number;
  /** 安装/烧录超时时间 (分钟，5~180) */
  installTimeoutMin: number;
  /** 失败自动重试次数 (0~3 次) */
  maxRetries: number;
  /** 批次失败率自动熔断阈值百分比 (1%~20%，默认 5%) */
  failureThresholdPercent: number;
}

/**
 * OTA 计划数据传输对象
 */
export interface OtaPlanDto {
  id: string;
  name: string;
  firmwareId: string;
  firmwareName: string;
  firmwareVersion: string;
  firmwareType: FirmwareType;
  status: OtaPlanStatus;
  upgradeMode: UpgradeMode;
  scheduleType: ScheduleType;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  safetyPreconditions: OtaSafetyPreconditions;
  executionConfig: OtaExecutionConfig;
  targetVehicleIds: string[];
  targetVehicleCount: number;
  successCount?: number;
  failedCount?: number;
  runningCount?: number;
  pendingCount?: number;
  progressPercent?: number;
  failureRatePercent?: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  tenantId?: string;
  abortReason?: string;
}

/**
 * 创建 OTA 计划入参
 */
export interface CreateOtaPlanInput {
  name: string;
  firmwareId: string;
  upgradeMode: UpgradeMode;
  scheduleType: ScheduleType;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  safetyPreconditions: OtaSafetyPreconditions;
  executionConfig: OtaExecutionConfig;
  targetVehicleIds: string[];
  tenantId?: string;
  createdBy?: string;
}

/**
 * 升级计划检索过滤入参
 */
export interface OtaPlanQueryParams {
  keyword?: string;
  status?: OtaPlanStatus | string;
  firmwareType?: FirmwareType | string;
  tenantId?: string;
}

/**
 * 校验计划基础信息与固件包发布状态
 */
export function validatePlanBasicInfo(info: {
  name?: string;
  firmware?: FirmwarePackageDto | { id?: string; status?: FirmwareStatus | string } | null;
}): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (!info.name || typeof info.name !== 'string' || info.name.trim().length === 0) {
    errors.name = '请输入升级计划名称';
  } else {
    const trimmed = info.name.trim();
    if (trimmed.length < 2 || trimmed.length > 50) {
      errors.name =
        trimmed.length < 2
          ? '升级计划名称长度必须在 2 到 50 个字符之间'
          : '升级计划名称长度不能超过 50 个字符';
    }
  }

  if (!info.firmware || !info.firmware.id) {
    errors.firmware = '必须指定目标固件包';
  } else if (info.firmware.status !== FirmwareStatus.PUBLISHED) {
    errors.firmware = `目标固件包必须处于已发布 (PUBLISHED) 状态，当前状态为 [${info.firmware.status}]`;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * 校验安全前置门禁参数
 */
export function validateSafetyPreconditions(pre: OtaSafetyPreconditions): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  if (
    pre.minBatterySoc === undefined ||
    pre.minBatterySoc === null ||
    typeof pre.minBatterySoc !== 'number' ||
    pre.minBatterySoc < 20 ||
    pre.minBatterySoc > 80
  ) {
    errors.minBatterySoc = '最低电量安全门禁阈值必须设定在 20% 到 80% 之间';
  }

  if (pre.requireStationary !== true) {
    errors.requireStationary =
      '为了行驶安全，车辆静止与P档条件必须强制开启（杜绝行车中OTA）';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * 校验执行超时与熔断配置参数
 */
export function validateExecutionConfig(cfg: OtaExecutionConfig): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  if (
    cfg.downloadTimeoutMin === undefined ||
    typeof cfg.downloadTimeoutMin !== 'number' ||
    cfg.downloadTimeoutMin <= 0 ||
    cfg.downloadTimeoutMin > 120
  ) {
    errors.downloadTimeoutMin = '下载超时时间必须大于 0 且不超过 120 分钟';
  }

  if (
    cfg.installTimeoutMin === undefined ||
    typeof cfg.installTimeoutMin !== 'number' ||
    cfg.installTimeoutMin <= 0 ||
    cfg.installTimeoutMin > 180
  ) {
    errors.installTimeoutMin = '安装超时时间必须大于 0 且不超过 180 分钟';
  }

  if (
    cfg.maxRetries === undefined ||
    typeof cfg.maxRetries !== 'number' ||
    !Number.isInteger(cfg.maxRetries) ||
    cfg.maxRetries < 0 ||
    cfg.maxRetries > 3
  ) {
    errors.maxRetries = '重试次数必须为 0 到 3 之间的整数';
  }

  if (
    cfg.failureThresholdPercent === undefined ||
    typeof cfg.failureThresholdPercent !== 'number' ||
    cfg.failureThresholdPercent < 1 ||
    cfg.failureThresholdPercent > 20
  ) {
    errors.failureThresholdPercent = '失败率熔断阈值必须设定在 1% 到 20% 之间';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * 判断指定车辆车型是否与目标固件包适用范围兼容
 */
export function isVehicleModelCompatible(
  vehicle: { modelId?: string; modelName?: string },
  firmware: { applicableModelIds?: string[]; applicableModelNames?: string[] }
): boolean {
  const modelIds = firmware.applicableModelIds || [];
  const modelNames = firmware.applicableModelNames || [];

  // 如果适用车型为空，视为通用全兼容固件
  if (modelIds.length === 0 && modelNames.length === 0) {
    return true;
  }

  if (vehicle.modelId && modelIds.includes(vehicle.modelId)) {
    return true;
  }

  if (vehicle.modelName && modelNames.includes(vehicle.modelName)) {
    return true;
  }

  return false;
}

/**
 * 依据固件适配车型及扩展查询条件，过滤符合条件的可用车辆列表
 */
export function filterEligibleVehicles(
  vehicles: VehicleDto[],
  firmware: FirmwarePackageDto,
  filters?: {
    projectId?: string;
    modelId?: string;
    keyword?: string;
    onlyOnline?: boolean;
  }
): VehicleDto[] {
  const kw = filters?.keyword ? filters.keyword.trim().toLowerCase() : '';
  const proj = filters?.projectId && filters.projectId !== 'ALL' ? filters.projectId : null;
  const mod = filters?.modelId && filters.modelId !== 'ALL' ? filters.modelId : null;
  const onlineOnly = filters?.onlyOnline ?? false;

  return vehicles.filter((v) => {
    // 1. 固件车型兼容性门禁
    if (!isVehicleModelCompatible(v, firmware)) {
      return false;
    }

    // 2. 项目过滤
    if (proj && v.projectId !== proj) {
      return false;
    }

    // 3. 车型过滤
    if (mod && v.modelId !== mod) {
      return false;
    }

    // 4. 在线状态过滤
    if (onlineOnly && v.deviceOnlineStatus !== 'ONLINE') {
      return false;
    }

    // 5. 关键词匹配 (车牌、VIN、车主姓名)
    if (kw) {
      const matchPlate = v.plateNumber?.toLowerCase().includes(kw);
      const matchVin = v.vin?.toLowerCase().includes(kw);
      const matchOwner = v.ownerName?.toLowerCase().includes(kw);
      if (!matchPlate && !matchVin && !matchOwner) {
        return false;
      }
    }

    return true;
  });
}

/**
 * OTA 计划状态流转合法性守卫
 */
export function isValidPlanStatusTransition(
  from: OtaPlanStatus,
  to: OtaPlanStatus
): boolean {
  if (from === to) {
    return false;
  }

  // 终态不可流转
  if (from === OtaPlanStatus.COMPLETED || from === OtaPlanStatus.ABORTED) {
    return false;
  }

  if (from === OtaPlanStatus.DRAFT) {
    return (
      to === OtaPlanStatus.SCHEDULED ||
      to === OtaPlanStatus.RUNNING ||
      to === OtaPlanStatus.ABORTED
    );
  }

  if (from === OtaPlanStatus.SCHEDULED) {
    return to === OtaPlanStatus.RUNNING || to === OtaPlanStatus.ABORTED;
  }

  if (from === OtaPlanStatus.RUNNING) {
    return (
      to === OtaPlanStatus.PAUSED ||
      to === OtaPlanStatus.COMPLETED ||
      to === OtaPlanStatus.ABORTED
    );
  }

  if (from === OtaPlanStatus.PAUSED) {
    return to === OtaPlanStatus.RUNNING || to === OtaPlanStatus.ABORTED;
  }

  return false;
}

/**
 * 判断计划是否处于终态
 */
export function isTerminalPlanStatus(status: OtaPlanStatus): boolean {
  return status === OtaPlanStatus.COMPLETED || status === OtaPlanStatus.ABORTED;
}

/**
 * 多维过滤检索计划列表
 */
export function filterOtaPlans(
  plans: OtaPlanDto[],
  query?: OtaPlanQueryParams
): OtaPlanDto[] {
  if (!query) {
    return plans;
  }

  const { keyword, status, firmwareType, tenantId } = query;
  const kw = keyword ? keyword.trim().toLowerCase() : '';

  return plans.filter((plan) => {
    if (kw) {
      const matchName = plan.name.toLowerCase().includes(kw);
      const matchFwName = plan.firmwareName.toLowerCase().includes(kw);
      const matchFwVer = plan.firmwareVersion.toLowerCase().includes(kw);
      if (!matchName && !matchFwName && !matchFwVer) {
        return false;
      }
    }

    if (status && status !== 'ALL' && plan.status !== status) {
      return false;
    }

    if (firmwareType && firmwareType !== 'ALL' && plan.firmwareType !== firmwareType) {
      return false;
    }

    if (tenantId && plan.tenantId && plan.tenantId !== tenantId) {
      return false;
    }

    return true;
  });
}

/**
 * 4+ 真实生产环境 OTA 计划种子数据
 */
export const SEED_OTA_PLANS: OtaPlanDto[] = [
  {
    id: 'plan-tbox-202610-01',
    name: 'T-Box 5G双频高精定位全网分批升级',
    firmwareId: 'fw-tbox-241',
    firmwareName: 'T-Box 5G双频高精定位通信终端固件',
    firmwareVersion: 'v2.4.1',
    firmwareType: FirmwareType.TBOX,
    status: OtaPlanStatus.RUNNING,
    upgradeMode: UpgradeMode.SILENT,
    scheduleType: ScheduleType.IMMEDIATE,
    safetyPreconditions: {
      minBatterySoc: 30,
      requireStationary: true,
      requireNotCharging: true,
    },
    executionConfig: {
      downloadTimeoutMin: 30,
      installTimeoutMin: 45,
      maxRetries: 2,
      failureThresholdPercent: 5,
    },
    targetVehicleIds: ['veh-001', 'veh-002', 'veh-003'],
    targetVehicleCount: 3,
    successCount: 2,
    runningCount: 1,
    failedCount: 0,
    pendingCount: 0,
    progressPercent: 66,
    failureRatePercent: 0,
    createdAt: '2026-10-15 08:30:00',
    updatedAt: '2026-10-15 09:45:00',
    createdBy: '系统架构师_王工',
  },
  {
    id: 'plan-bcm-202610-02',
    name: 'BCM 车身舒适域蓝牙无感闭锁夜间升级',
    firmwareId: 'fw-bcm-180',
    firmwareName: 'BCM 智能车身舒适域控主固件',
    firmwareVersion: 'v1.8.0',
    firmwareType: FirmwareType.BCM,
    status: OtaPlanStatus.SCHEDULED,
    upgradeMode: UpgradeMode.SILENT,
    scheduleType: ScheduleType.SCHEDULED,
    scheduledStartTime: '2026-10-18 02:00:00',
    scheduledEndTime: '2026-10-18 05:00:00',
    safetyPreconditions: {
      minBatterySoc: 35,
      requireStationary: true,
      requireNotCharging: false,
    },
    executionConfig: {
      downloadTimeoutMin: 30,
      installTimeoutMin: 40,
      maxRetries: 2,
      failureThresholdPercent: 5,
    },
    targetVehicleIds: ['veh-001', 'veh-002', 'veh-003', 'veh-004', 'veh-005'],
    targetVehicleCount: 5,
    successCount: 0,
    runningCount: 0,
    failedCount: 0,
    pendingCount: 5,
    progressPercent: 0,
    failureRatePercent: 0,
    createdAt: '2026-10-14 16:00:00',
    updatedAt: '2026-10-14 16:00:00',
    createdBy: '车身域组长_赵工',
  },
  {
    id: 'plan-mcu-202609-03',
    name: 'MCU 底盘矢量扭矩控制专项调优',
    firmwareId: 'fw-mcu-320',
    firmwareName: 'MCU 动力底盘双核控制器固件',
    firmwareVersion: 'v3.2.0',
    firmwareType: FirmwareType.MCU,
    status: OtaPlanStatus.COMPLETED,
    upgradeMode: UpgradeMode.USER_CONFIRM,
    scheduleType: ScheduleType.IMMEDIATE,
    safetyPreconditions: {
      minBatterySoc: 40,
      requireStationary: true,
      requireNotCharging: true,
    },
    executionConfig: {
      downloadTimeoutMin: 20,
      installTimeoutMin: 35,
      maxRetries: 1,
      failureThresholdPercent: 5,
    },
    targetVehicleIds: ['veh-001', 'veh-002', 'veh-004', 'veh-006'],
    targetVehicleCount: 4,
    successCount: 4,
    runningCount: 0,
    failedCount: 0,
    pendingCount: 0,
    progressPercent: 100,
    failureRatePercent: 0,
    createdAt: '2026-09-25 10:00:00',
    updatedAt: '2026-09-25 14:30:00',
    createdBy: '控制算法_张工',
  },
  {
    id: 'plan-bms-202609-04',
    name: 'BMS 800V高压快充低温预研升级 (熔断样例)',
    firmwareId: 'fw-bms-410',
    firmwareName: 'BMS 800V高压动力电池管理系统固件',
    firmwareVersion: 'v4.1.0',
    firmwareType: FirmwareType.BMS,
    status: OtaPlanStatus.ABORTED,
    upgradeMode: UpgradeMode.SILENT,
    scheduleType: ScheduleType.IMMEDIATE,
    safetyPreconditions: {
      minBatterySoc: 45,
      requireStationary: true,
      requireNotCharging: true,
    },
    executionConfig: {
      downloadTimeoutMin: 30,
      installTimeoutMin: 45,
      maxRetries: 2,
      failureThresholdPercent: 5,
    },
    targetVehicleIds: ['veh-001', 'veh-003', 'veh-005'],
    targetVehicleCount: 3,
    successCount: 1,
    runningCount: 0,
    failedCount: 1,
    pendingCount: 1,
    progressPercent: 33,
    failureRatePercent: 33.3,
    abortReason:
      '执行过程中失败率达到 33.3%，触发设定的 5% 失败熔断保护，系统自动熔断终止剩余车辆下发',
    createdAt: '2026-09-28 11:20:00',
    updatedAt: '2026-09-28 12:15:00',
    createdBy: '三电安全总监_陈工',
  },
];
