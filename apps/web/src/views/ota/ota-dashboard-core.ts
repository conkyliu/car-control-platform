import {
  type OtaPlanDto,
  OtaPlanStatus,
  SEED_OTA_PLANS,
} from './ota-plan-core.ts';

/**
 * 单车 OTA 任务全链路阶段状态
 */
export const OtaVehicleTaskStatus = {
  PENDING: 'PENDING',
  DOWNLOADING: 'DOWNLOADING',
  DOWNLOADED: 'DOWNLOADED',
  UPGRADING: 'UPGRADING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;

export type OtaVehicleTaskStatus =
  (typeof OtaVehicleTaskStatus)[keyof typeof OtaVehicleTaskStatus];

export interface OtaVehicleTaskStatusMeta {
  status: OtaVehicleTaskStatus;
  label: string;
  badgeStatus: 'default' | 'processing' | 'success' | 'warning' | 'error';
  color: string;
  tagColor: string;
  description: string;
  iconName?: string;
}

export const OTA_VEHICLE_TASK_STATUS_METADATA: Record<
  OtaVehicleTaskStatus,
  OtaVehicleTaskStatusMeta
> = {
  [OtaVehicleTaskStatus.PENDING]: {
    status: OtaVehicleTaskStatus.PENDING,
    label: '排队待下发',
    badgeStatus: 'default',
    color: '#8c8c8c',
    tagColor: 'default',
    description: '任务已建档排队，等待安全前置门禁校验与批次调度下发',
    iconName: 'ClockCircleOutlined',
  },
  [OtaVehicleTaskStatus.DOWNLOADING]: {
    status: OtaVehicleTaskStatus.DOWNLOADING,
    label: '固件下载中',
    badgeStatus: 'processing',
    color: '#1677ff',
    tagColor: 'processing',
    description: '车辆车载终端正通过 4G/5G 网络下载分片固件包',
    iconName: 'DownloadOutlined',
  },
  [OtaVehicleTaskStatus.DOWNLOADED]: {
    status: OtaVehicleTaskStatus.DOWNLOADED,
    label: '固件已就绪',
    badgeStatus: 'processing',
    color: '#13c2c2',
    tagColor: 'cyan',
    description: '固件包下载完毕，已通过 SHA-256 哈希校验与完整性检测',
    iconName: 'CheckCircleOutlined',
  },
  [OtaVehicleTaskStatus.UPGRADING]: {
    status: OtaVehicleTaskStatus.UPGRADING,
    label: 'ECU烧录中',
    badgeStatus: 'warning',
    color: '#fa8c16',
    tagColor: 'orange',
    description: '控制器 ECU 正在执行擦除与固件写入，车辆强制处于驻车安全保护',
    iconName: 'SyncOutlined',
  },
  [OtaVehicleTaskStatus.SUCCESS]: {
    status: OtaVehicleTaskStatus.SUCCESS,
    label: '升级成功',
    badgeStatus: 'success',
    color: '#52c41a',
    tagColor: 'success',
    description: '升级刷写完成，自检通过并成功上报新版本号（终态）',
    iconName: 'CheckCircleFilled',
  },
  [OtaVehicleTaskStatus.FAILED]: {
    status: OtaVehicleTaskStatus.FAILED,
    label: '升级失败',
    badgeStatus: 'error',
    color: '#ff4d4f',
    tagColor: 'error',
    description: '刷写过程中断或自检异常，已安全回滚至上一稳定版本',
    iconName: 'CloseCircleFilled',
  },
  [OtaVehicleTaskStatus.CANCELLED]: {
    status: OtaVehicleTaskStatus.CANCELLED,
    label: '已中止取消',
    badgeStatus: 'default',
    color: '#595959',
    tagColor: 'default',
    description: '运维人员手动中止或熔断红线触发，升级已终止（终态）',
    iconName: 'StopOutlined',
  },
};

/**
 * 单车升级执行步骤日志项 (用于抽屉全链路追溯)
 */
export interface OtaTaskLogStep {
  id: string;
  timestamp: string;
  phase: OtaVehicleTaskStatus;
  action: string;
  code?: string;
  description: string;
  level?: 'info' | 'warn' | 'error' | 'success';
}

/**
 * 单车 OTA 任务详情记录
 */
export interface OtaVehicleTaskRecord {
  id: string;
  planId: string;
  vehicleId: string;
  plateNumber: string;
  vin: string;
  modelName: string;
  currentVersion: string;
  targetVersion: string;
  status: OtaVehicleTaskStatus;
  downloadProgress: number; // 0~100
  installProgress: number; // 0~100
  totalProgress: number; // 0~100
  retries: number;
  maxRetries: number;
  errorCode?: string;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  durationSeconds?: number;
  logs?: OtaTaskLogStep[];
}

/**
 * 批次升级计划执行统计概览
 */
export interface OtaPlanSummary {
  totalVehicles: number;
  pendingCount: number;
  downloadingCount: number;
  downloadedCount: number;
  upgradingCount: number;
  successCount: number;
  failedCount: number;
  cancelledCount?: number;
  successRate: number; // 成功率百分比 (0~100，保留1位小数)
  failureRate: number; // 失败率百分比 (0~100，保留1位小数)
  isCircuitBreakerTriggered: boolean; // 是否触达失败熔断红线
  overallProgress: number; // 批次综合总体进度百分比 (0~100)
}

/**
 * 计划执行详情 DTO (包含计划元数据、统计概览、车辆任务列表)
 */
export interface OtaPlanDetailDto {
  plan: OtaPlanDto;
  summary: OtaPlanSummary;
  vehicleTasks: OtaVehicleTaskRecord[];
}

/**
 * 全局跨计划宏观 KPI 统计
 */
export interface GlobalOtaStats {
  activePlansCount: number;
  totalVehiclesCovered: number;
  globalSuccessRate: number;
  circuitBreakerAlertCount: number;
}

/**
 * 车辆任务检索过滤入参
 */
export interface VehicleTaskQueryParams {
  keyword?: string;
  status?: OtaVehicleTaskStatus | string;
  errorCode?: string;
}

/**
 * 状态机守卫：校验单车任务状态流转合法性
 * - SUCCESS 与 CANCELLED 均为终态，不可逆向转移
 * - 正常推进: PENDING -> DOWNLOADING -> DOWNLOADED -> UPGRADING -> SUCCESS
 * - 异常终止: 各阶段均可转为 FAILED 或 CANCELLED
 * - 故障重试: FAILED -> PENDING / DOWNLOADING
 */
export function isValidVehicleTaskStatusTransition(
  from: OtaVehicleTaskStatus,
  to: OtaVehicleTaskStatus
): boolean {
  if (from === to) return true;

  // 终态不可流转
  if (from === OtaVehicleTaskStatus.SUCCESS || from === OtaVehicleTaskStatus.CANCELLED) {
    return false;
  }

  switch (from) {
    case OtaVehicleTaskStatus.PENDING:
      return (
        to === OtaVehicleTaskStatus.DOWNLOADING ||
        to === OtaVehicleTaskStatus.CANCELLED ||
        to === OtaVehicleTaskStatus.FAILED
      );

    case OtaVehicleTaskStatus.DOWNLOADING:
      return (
        to === OtaVehicleTaskStatus.DOWNLOADED ||
        to === OtaVehicleTaskStatus.FAILED ||
        to === OtaVehicleTaskStatus.CANCELLED
      );

    case OtaVehicleTaskStatus.DOWNLOADED:
      return (
        to === OtaVehicleTaskStatus.UPGRADING ||
        to === OtaVehicleTaskStatus.FAILED ||
        to === OtaVehicleTaskStatus.CANCELLED
      );

    case OtaVehicleTaskStatus.UPGRADING:
      return (
        to === OtaVehicleTaskStatus.SUCCESS ||
        to === OtaVehicleTaskStatus.FAILED ||
        to === OtaVehicleTaskStatus.CANCELLED
      );

    case OtaVehicleTaskStatus.FAILED:
      // 允许手动或自动重试回到 PENDING / DOWNLOADING，或标记取消
      return (
        to === OtaVehicleTaskStatus.PENDING ||
        to === OtaVehicleTaskStatus.DOWNLOADING ||
        to === OtaVehicleTaskStatus.CANCELLED
      );

    default:
      return false;
  }
}

/**
 * 纯函数：精准计算批次任务统计概览与熔断红线指标
 * @param tasks 车辆任务数组
 * @param failureThresholdPercent 熔断阈值百分比 (默认 5%)
 */
export function calculatePlanTaskSummary(
  tasks: OtaVehicleTaskRecord[],
  failureThresholdPercent = 5
): OtaPlanSummary {
  const totalVehicles = tasks.length;
  if (totalVehicles === 0) {
    return {
      totalVehicles: 0,
      pendingCount: 0,
      downloadingCount: 0,
      downloadedCount: 0,
      upgradingCount: 0,
      successCount: 0,
      failedCount: 0,
      cancelledCount: 0,
      successRate: 0,
      failureRate: 0,
      isCircuitBreakerTriggered: false,
      overallProgress: 0,
    };
  }

  let pendingCount = 0;
  let downloadingCount = 0;
  let downloadedCount = 0;
  let upgradingCount = 0;
  let successCount = 0;
  let failedCount = 0;
  let cancelledCount = 0;
  let totalProgressSum = 0;

  for (const t of tasks) {
    totalProgressSum += t.totalProgress ?? 0;
    switch (t.status) {
      case OtaVehicleTaskStatus.PENDING:
        pendingCount++;
        break;
      case OtaVehicleTaskStatus.DOWNLOADING:
        downloadingCount++;
        break;
      case OtaVehicleTaskStatus.DOWNLOADED:
        downloadedCount++;
        break;
      case OtaVehicleTaskStatus.UPGRADING:
        upgradingCount++;
        break;
      case OtaVehicleTaskStatus.SUCCESS:
        successCount++;
        break;
      case OtaVehicleTaskStatus.FAILED:
        failedCount++;
        break;
      case OtaVehicleTaskStatus.CANCELLED:
        cancelledCount++;
        break;
    }
  }

  const successRate = Number(((successCount / totalVehicles) * 100).toFixed(1));
  const failureRate = Number(((failedCount / totalVehicles) * 100).toFixed(1));
  const isCircuitBreakerTriggered =
    failedCount > 0 && failureRate >= failureThresholdPercent;
  const overallProgress = Math.min(
    100,
    Math.max(0, Math.round(totalProgressSum / totalVehicles))
  );

  return {
    totalVehicles,
    pendingCount,
    downloadingCount,
    downloadedCount,
    upgradingCount,
    successCount,
    failedCount,
    cancelledCount,
    successRate,
    failureRate,
    isCircuitBreakerTriggered,
    overallProgress,
  };
}

/**
 * 纯函数：跨计划宏观统计 (大屏 4 大 KPI 卡片数据源)
 */
export function calculateGlobalOtaStats(
  plans: OtaPlanDto[],
  allTasks?: Record<string, OtaVehicleTaskRecord[]> | OtaVehicleTaskRecord[]
): GlobalOtaStats {
  const activePlansCount = plans.filter(
    (p) => p.status === OtaPlanStatus.RUNNING
  ).length;

  const totalVehiclesCovered = plans.reduce(
    (acc, p) => acc + (p.targetVehicleCount ?? p.targetVehicleIds?.length ?? 0),
    0
  );

  // 全局成功率计算
  let totalSuccess = 0;
  let totalTarget = 0;

  if (Array.isArray(allTasks)) {
    totalTarget = allTasks.length;
    totalSuccess = allTasks.filter((t) => t.status === OtaVehicleTaskStatus.SUCCESS).length;
  } else if (allTasks && typeof allTasks === 'object') {
    const taskList = Object.values(allTasks).flat();
    totalTarget = taskList.length;
    totalSuccess = taskList.filter((t) => t.status === OtaVehicleTaskStatus.SUCCESS).length;
  } else {
    for (const p of plans) {
      totalTarget += p.targetVehicleCount ?? 0;
      totalSuccess += p.successCount ?? 0;
    }
  }

  const globalSuccessRate =
    totalTarget === 0 ? 0 : Number(((totalSuccess / totalTarget) * 100).toFixed(1));

  // 熔断计划预警数：计划状态为 ABORTED 且存在 abortReason，或者 failureRatePercent >= 5
  const circuitBreakerAlertCount = plans.filter(
    (p) =>
      p.status === OtaPlanStatus.ABORTED ||
      (p.failureRatePercent !== undefined && p.failureRatePercent >= 5.0)
  ).length;

  return {
    activePlansCount,
    totalVehiclesCovered,
    globalSuccessRate,
    circuitBreakerAlertCount,
  };
}

/**
 * 纯函数：多维过滤车辆任务明细
 */
export function filterVehicleTasks(
  tasks: OtaVehicleTaskRecord[],
  query?: VehicleTaskQueryParams
): OtaVehicleTaskRecord[] {
  if (!query) return tasks;
  const { keyword, status, errorCode } = query;

  return tasks.filter((t) => {
    // 关键字搜索 (车牌号 / VIN / 车型)
    if (keyword && keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      const matchPlate = t.plateNumber?.toLowerCase().includes(kw);
      const matchVin = t.vin?.toLowerCase().includes(kw);
      const matchModel = t.modelName?.toLowerCase().includes(kw);
      if (!matchPlate && !matchVin && !matchModel) {
        return false;
      }
    }

    // 状态过滤
    if (status && status !== 'ALL' && t.status !== status) {
      return false;
    }

    // 错误码过滤
    if (errorCode && errorCode.trim()) {
      const ec = errorCode.trim().toLowerCase();
      if (!t.errorCode?.toLowerCase().includes(ec)) {
        return false;
      }
    }

    return true;
  });
}

// ---------------- 种子明细数据集 ----------------

/**
 * 高保真 OTA 升级计划执行详情种子数据集
 * 与 SEED_OTA_PLANS (4 组典型业务场景) 完全一一映射
 */
export const SEED_OTA_PLAN_DETAILS: Record<string, OtaPlanDetailDto> = {
  'plan-tbox-202610-01': {
    plan: SEED_OTA_PLANS[0],
    summary: {
      totalVehicles: 3,
      pendingCount: 0,
      downloadingCount: 0,
      downloadedCount: 0,
      upgradingCount: 1,
      successCount: 2,
      failedCount: 0,
      cancelledCount: 0,
      successRate: 66.7,
      failureRate: 0.0,
      isCircuitBreakerTriggered: false,
      overallProgress: 94,
    },
    vehicleTasks: [
      {
        id: 'task-tbox-001',
        planId: 'plan-tbox-202610-01',
        vehicleId: 'veh-001',
        plateNumber: '粤B·88888',
        vin: 'LFPH2E023N1000001',
        modelName: '汉 EV',
        currentVersion: 'v2.3.0',
        targetVersion: 'v2.4.1',
        status: OtaVehicleTaskStatus.SUCCESS,
        downloadProgress: 100,
        installProgress: 100,
        totalProgress: 100,
        retries: 0,
        maxRetries: 2,
        startedAt: '2026-10-15 08:35:10',
        completedAt: '2026-10-15 08:54:20',
        durationSeconds: 1150,
        logs: [
          {
            id: 'log-001-1',
            timestamp: '2026-10-15 08:35:10',
            phase: OtaVehicleTaskStatus.PENDING,
            action: '前置门禁自检',
            code: 'PRECHECK_PASS',
            description: '动力电池 SoC 85% (门禁要求 >= 30%)，车辆静止处于 P 档，未充电，满足下发条件',
            level: 'info',
          },
          {
            id: 'log-001-2',
            timestamp: '2026-10-15 08:35:25',
            phase: OtaVehicleTaskStatus.DOWNLOADING,
            action: '固件下发与下载',
            code: 'FW_FETCH_OK',
            description: '4G 连接良好，分片下载完成 (128.5 MB, 校验 SHA-256 吻合)',
            level: 'info',
          },
          {
            id: 'log-001-3',
            timestamp: '2026-10-15 08:42:00',
            phase: OtaVehicleTaskStatus.DOWNLOADED,
            action: '包体完整性校验',
            code: 'INTEGRITY_OK',
            description: '硬件安全芯片 HSM 签名校验通过，固件镜像解密就绪',
            level: 'success',
          },
          {
            id: 'log-001-4',
            timestamp: '2026-10-15 08:43:10',
            phase: OtaVehicleTaskStatus.UPGRADING,
            action: 'T-Box Flash 擦写',
            code: 'FLASH_BURNING',
            description: 'T-Box 5G 双频高精基带芯片 Flash 擦写完成并重启握手',
            level: 'info',
          },
          {
            id: 'log-001-5',
            timestamp: '2026-10-15 08:54:20',
            phase: OtaVehicleTaskStatus.SUCCESS,
            action: '升级自检成功',
            code: 'OTA_SUCCESS',
            description: '终端上报最新版本 v2.4.1，双频定位与 5G 模块握手正常，全流程耗时 19分10秒',
            level: 'success',
          },
        ],
      },
      {
        id: 'task-tbox-002',
        planId: 'plan-tbox-202610-01',
        vehicleId: 'veh-002',
        plateNumber: '粤B·66666',
        vin: 'LFPH2E023N1000002',
        modelName: '极氪 001',
        currentVersion: 'v2.3.0',
        targetVersion: 'v2.4.1',
        status: OtaVehicleTaskStatus.SUCCESS,
        downloadProgress: 100,
        installProgress: 100,
        totalProgress: 100,
        retries: 0,
        maxRetries: 2,
        startedAt: '2026-10-15 08:35:12',
        completedAt: '2026-10-15 08:51:30',
        durationSeconds: 978,
        logs: [
          {
            id: 'log-002-1',
            timestamp: '2026-10-15 08:35:12',
            phase: OtaVehicleTaskStatus.PENDING,
            action: '前置门禁自检',
            code: 'PRECHECK_PASS',
            description: '电池 SoC 72%，驻车挡正常，满足刷写门禁',
            level: 'info',
          },
          {
            id: 'log-002-2',
            timestamp: '2026-10-15 08:35:30',
            phase: OtaVehicleTaskStatus.DOWNLOADING,
            action: '高速固件拉取',
            code: 'FW_FETCH_OK',
            description: '下载耗时 6分10秒，数据校验无误',
            level: 'info',
          },
          {
            id: 'log-002-3',
            timestamp: '2026-10-15 08:44:00',
            phase: OtaVehicleTaskStatus.UPGRADING,
            action: '基带固件刷写',
            code: 'FLASH_BURNING',
            description: '写入新镜像并执行回读校验通过',
            level: 'info',
          },
          {
            id: 'log-002-4',
            timestamp: '2026-10-15 08:51:30',
            phase: OtaVehicleTaskStatus.SUCCESS,
            action: '系统激活就绪',
            code: 'OTA_SUCCESS',
            description: '新固件 v2.4.1 生效，心跳恢复正常',
            level: 'success',
          },
        ],
      },
      {
        id: 'task-tbox-003',
        planId: 'plan-tbox-202610-01',
        vehicleId: 'veh-003',
        plateNumber: '粤B·55555',
        vin: 'LFPH2E023N1000003',
        modelName: 'Model Y',
        currentVersion: 'v2.3.0',
        targetVersion: 'v2.4.1',
        status: OtaVehicleTaskStatus.UPGRADING,
        downloadProgress: 100,
        installProgress: 65,
        totalProgress: 82,
        retries: 0,
        maxRetries: 2,
        startedAt: '2026-10-15 08:36:00',
        durationSeconds: 780,
        logs: [
          {
            id: 'log-003-1',
            timestamp: '2026-10-15 08:36:00',
            phase: OtaVehicleTaskStatus.PENDING,
            action: '前置门禁自检',
            code: 'PRECHECK_PASS',
            description: '电池 SoC 60%，驻车条件符合，前置校验通过',
            level: 'info',
          },
          {
            id: 'log-003-2',
            timestamp: '2026-10-15 08:36:20',
            phase: OtaVehicleTaskStatus.DOWNLOADING,
            action: '固件包下载',
            code: 'FW_FETCH_OK',
            description: '固件下载完成，校验和通过',
            level: 'info',
          },
          {
            id: 'log-003-3',
            timestamp: '2026-10-15 08:45:00',
            phase: OtaVehicleTaskStatus.DOWNLOADED,
            action: '准备烧录',
            code: 'PREPARE_UPGRADE',
            description: 'ECU 复位并进入 Bootloader 刷写模式',
            level: 'info',
          },
          {
            id: 'log-003-4',
            timestamp: '2026-10-15 08:46:10',
            phase: OtaVehicleTaskStatus.UPGRADING,
            action: 'ECU 固件扇区烧录',
            code: 'FLASH_SECTOR_65',
            description: '正在烧录第 13/20 扇区 (65%)，车辆保持静止锁止状态',
            level: 'warn',
          },
        ],
      },
    ],
  },

  'plan-bcm-202610-02': {
    plan: SEED_OTA_PLANS[1],
    summary: {
      totalVehicles: 5,
      pendingCount: 5,
      downloadingCount: 0,
      downloadedCount: 0,
      upgradingCount: 0,
      successCount: 0,
      failedCount: 0,
      cancelledCount: 0,
      successRate: 0,
      failureRate: 0,
      isCircuitBreakerTriggered: false,
      overallProgress: 0,
    },
    vehicleTasks: [
      {
        id: 'task-bcm-001',
        planId: 'plan-bcm-202610-02',
        vehicleId: 'veh-001',
        plateNumber: '粤B·88888',
        vin: 'LFPH2E023N1000001',
        modelName: '汉 EV',
        currentVersion: 'v1.7.2',
        targetVersion: 'v1.8.0',
        status: OtaVehicleTaskStatus.PENDING,
        downloadProgress: 0,
        installProgress: 0,
        totalProgress: 0,
        retries: 0,
        maxRetries: 2,
        logs: [
          {
            id: 'log-bcm-001',
            timestamp: '2026-10-14 16:00:00',
            phase: OtaVehicleTaskStatus.PENDING,
            action: '定时任务排期',
            code: 'SCHEDULED_WAITING',
            description: '等待预约窗口 (2026-10-18 02:00:00) 到达后自动下发',
            level: 'info',
          },
        ],
      },
      {
        id: 'task-bcm-002',
        planId: 'plan-bcm-202610-02',
        vehicleId: 'veh-002',
        plateNumber: '粤B·66666',
        vin: 'LFPH2E023N1000002',
        modelName: '极氪 001',
        currentVersion: 'v1.7.2',
        targetVersion: 'v1.8.0',
        status: OtaVehicleTaskStatus.PENDING,
        downloadProgress: 0,
        installProgress: 0,
        totalProgress: 0,
        retries: 0,
        maxRetries: 2,
        logs: [
          {
            id: 'log-bcm-002',
            timestamp: '2026-10-14 16:00:00',
            phase: OtaVehicleTaskStatus.PENDING,
            action: '定时任务排期',
            code: 'SCHEDULED_WAITING',
            description: '等待预约窗口 (2026-10-18 02:00:00) 到达后自动下发',
            level: 'info',
          },
        ],
      },
      {
        id: 'task-bcm-003',
        planId: 'plan-bcm-202610-02',
        vehicleId: 'veh-003',
        plateNumber: '粤B·55555',
        vin: 'LFPH2E023N1000003',
        modelName: 'Model Y',
        currentVersion: 'v1.7.2',
        targetVersion: 'v1.8.0',
        status: OtaVehicleTaskStatus.PENDING,
        downloadProgress: 0,
        installProgress: 0,
        totalProgress: 0,
        retries: 0,
        maxRetries: 2,
        logs: [
          {
            id: 'log-bcm-003',
            timestamp: '2026-10-14 16:00:00',
            phase: OtaVehicleTaskStatus.PENDING,
            action: '定时任务排期',
            code: 'SCHEDULED_WAITING',
            description: '等待预约窗口 (2026-10-18 02:00:00) 到达后自动下发',
            level: 'info',
          },
        ],
      },
      {
        id: 'task-bcm-004',
        planId: 'plan-bcm-202610-02',
        vehicleId: 'veh-004',
        plateNumber: '粤B·44444',
        vin: 'LFPH2E023N1000004',
        modelName: 'AION S',
        currentVersion: 'v1.7.2',
        targetVersion: 'v1.8.0',
        status: OtaVehicleTaskStatus.PENDING,
        downloadProgress: 0,
        installProgress: 0,
        totalProgress: 0,
        retries: 0,
        maxRetries: 2,
        logs: [
          {
            id: 'log-bcm-004',
            timestamp: '2026-10-14 16:00:00',
            phase: OtaVehicleTaskStatus.PENDING,
            action: '定时任务排期',
            code: 'SCHEDULED_WAITING',
            description: '等待预约窗口 (2026-10-18 02:00:00) 到达后自动下发',
            level: 'info',
          },
        ],
      },
      {
        id: 'task-bcm-005',
        planId: 'plan-bcm-202610-02',
        vehicleId: 'veh-005',
        plateNumber: '粤B·33333',
        vin: 'LFPH2E023N1000005',
        modelName: '汉 EV',
        currentVersion: 'v1.7.2',
        targetVersion: 'v1.8.0',
        status: OtaVehicleTaskStatus.PENDING,
        downloadProgress: 0,
        installProgress: 0,
        totalProgress: 0,
        retries: 0,
        maxRetries: 2,
        logs: [
          {
            id: 'log-bcm-005',
            timestamp: '2026-10-14 16:00:00',
            phase: OtaVehicleTaskStatus.PENDING,
            action: '定时任务排期',
            code: 'SCHEDULED_WAITING',
            description: '等待预约窗口 (2026-10-18 02:00:00) 到达后自动下发',
            level: 'info',
          },
        ],
      },
    ],
  },

  'plan-mcu-202609-03': {
    plan: SEED_OTA_PLANS[2],
    summary: {
      totalVehicles: 4,
      pendingCount: 0,
      downloadingCount: 0,
      downloadedCount: 0,
      upgradingCount: 0,
      successCount: 4,
      failedCount: 0,
      cancelledCount: 0,
      successRate: 100,
      failureRate: 0,
      isCircuitBreakerTriggered: false,
      overallProgress: 100,
    },
    vehicleTasks: [
      {
        id: 'task-mcu-001',
        planId: 'plan-mcu-202609-03',
        vehicleId: 'veh-001',
        plateNumber: '粤B·88888',
        vin: 'LFPH2E023N1000001',
        modelName: '汉 EV',
        currentVersion: 'v3.1.0',
        targetVersion: 'v3.2.0',
        status: OtaVehicleTaskStatus.SUCCESS,
        downloadProgress: 100,
        installProgress: 100,
        totalProgress: 100,
        retries: 0,
        maxRetries: 1,
        startedAt: '2026-09-25 10:05:00',
        completedAt: '2026-09-25 10:28:15',
        durationSeconds: 1395,
        logs: [
          {
            id: 'log-mcu-001-1',
            timestamp: '2026-09-25 10:05:00',
            phase: OtaVehicleTaskStatus.PENDING,
            action: '车主大屏确认',
            code: 'USER_CONFIRMED',
            description: '车主在大屏点击【立即升级】，预估耗时 25 分钟',
            level: 'info',
          },
          {
            id: 'log-mcu-001-2',
            timestamp: '2026-09-25 10:28:15',
            phase: OtaVehicleTaskStatus.SUCCESS,
            action: 'MCU 升级完成',
            code: 'OTA_SUCCESS',
            description: '动力底盘控制器成功刷入 v3.2.0，矢量扭矩控制功能就绪',
            level: 'success',
          },
        ],
      },
      {
        id: 'task-mcu-002',
        planId: 'plan-mcu-202609-03',
        vehicleId: 'veh-002',
        plateNumber: '粤B·66666',
        vin: 'LFPH2E023N1000002',
        modelName: '极氪 001',
        currentVersion: 'v3.1.0',
        targetVersion: 'v3.2.0',
        status: OtaVehicleTaskStatus.SUCCESS,
        downloadProgress: 100,
        installProgress: 100,
        totalProgress: 100,
        retries: 0,
        maxRetries: 1,
        startedAt: '2026-09-25 10:06:00',
        completedAt: '2026-09-25 10:29:40',
        durationSeconds: 1420,
        logs: [
          {
            id: 'log-mcu-002-1',
            timestamp: '2026-09-25 10:06:00',
            phase: OtaVehicleTaskStatus.PENDING,
            action: '车主确认升级',
            code: 'USER_CONFIRMED',
            description: '车主大屏确认完毕，开始启动刷写',
            level: 'info',
          },
          {
            id: 'log-mcu-002-2',
            timestamp: '2026-09-25 10:29:40',
            phase: OtaVehicleTaskStatus.SUCCESS,
            action: '升级自检通过',
            code: 'OTA_SUCCESS',
            description: '固件版本校验成功 (v3.2.0)',
            level: 'success',
          },
        ],
      },
      {
        id: 'task-mcu-004',
        planId: 'plan-mcu-202609-03',
        vehicleId: 'veh-004',
        plateNumber: '粤B·44444',
        vin: 'LFPH2E023N1000004',
        modelName: 'AION S',
        currentVersion: 'v3.1.0',
        targetVersion: 'v3.2.0',
        status: OtaVehicleTaskStatus.SUCCESS,
        downloadProgress: 100,
        installProgress: 100,
        totalProgress: 100,
        retries: 0,
        maxRetries: 1,
        startedAt: '2026-09-25 10:10:00',
        completedAt: '2026-09-25 10:32:00',
        durationSeconds: 1320,
        logs: [
          {
            id: 'log-mcu-004-1',
            timestamp: '2026-09-25 10:32:00',
            phase: OtaVehicleTaskStatus.SUCCESS,
            action: '升级成功',
            code: 'OTA_SUCCESS',
            description: '版本自检通过，系统已转为正常就绪',
            level: 'success',
          },
        ],
      },
      {
        id: 'task-mcu-006',
        planId: 'plan-mcu-202609-03',
        vehicleId: 'veh-006',
        plateNumber: '粤B·22222',
        vin: 'LFPH2E023N1000006',
        modelName: '极氪 001',
        currentVersion: 'v3.1.0',
        targetVersion: 'v3.2.0',
        status: OtaVehicleTaskStatus.SUCCESS,
        downloadProgress: 100,
        installProgress: 100,
        totalProgress: 100,
        retries: 0,
        maxRetries: 1,
        startedAt: '2026-09-25 10:15:00',
        completedAt: '2026-09-25 10:38:10',
        durationSeconds: 1390,
        logs: [
          {
            id: 'log-mcu-006-1',
            timestamp: '2026-09-25 10:38:10',
            phase: OtaVehicleTaskStatus.SUCCESS,
            action: '升级成功',
            code: 'OTA_SUCCESS',
            description: '版本自检通过，已上线运营',
            level: 'success',
          },
        ],
      },
    ],
  },

  'plan-bms-202609-04': {
    plan: SEED_OTA_PLANS[3],
    summary: {
      totalVehicles: 3,
      pendingCount: 0,
      downloadingCount: 0,
      downloadedCount: 0,
      upgradingCount: 0,
      successCount: 1,
      failedCount: 1,
      cancelledCount: 1,
      successRate: 33.3,
      failureRate: 33.3,
      isCircuitBreakerTriggered: true,
      overallProgress: 57,
    },
    vehicleTasks: [
      {
        id: 'task-bms-001',
        planId: 'plan-bms-202609-04',
        vehicleId: 'veh-001',
        plateNumber: '粤B·88888',
        vin: 'LFPH2E023N1000001',
        modelName: '汉 EV',
        currentVersion: 'v4.0.0',
        targetVersion: 'v4.1.0',
        status: OtaVehicleTaskStatus.SUCCESS,
        downloadProgress: 100,
        installProgress: 100,
        totalProgress: 100,
        retries: 0,
        maxRetries: 2,
        startedAt: '2026-09-28 11:25:00',
        completedAt: '2026-09-28 11:45:00',
        durationSeconds: 1200,
        logs: [
          {
            id: 'log-bms-001-1',
            timestamp: '2026-09-28 11:25:00',
            phase: OtaVehicleTaskStatus.PENDING,
            action: '前置门禁自检',
            code: 'PRECHECK_PASS',
            description: '电池 SoC 88%，驻车就绪',
            level: 'info',
          },
          {
            id: 'log-bms-001-2',
            timestamp: '2026-09-28 11:45:00',
            phase: OtaVehicleTaskStatus.SUCCESS,
            action: 'BMS 固件更新成功',
            code: 'OTA_SUCCESS',
            description: '低温快充协议固件生效，BMS 电芯采样通信正常',
            level: 'success',
          },
        ],
      },
      {
        id: 'task-bms-003',
        planId: 'plan-bms-202609-04',
        vehicleId: 'veh-003',
        plateNumber: '粤B·55555',
        vin: 'LFPH2E023N1000003',
        modelName: 'Model Y',
        currentVersion: 'v4.0.0',
        targetVersion: 'v4.1.0',
        status: OtaVehicleTaskStatus.FAILED,
        downloadProgress: 100,
        installProgress: 42,
        totalProgress: 71,
        retries: 2,
        maxRetries: 2,
        errorCode: 'ERR_ECU_FLASH_CRC',
        errorMessage: 'BMS 高压主控从节点 Flash 擦写校验失败，CRC32 校验和不匹配',
        startedAt: '2026-09-28 11:26:00',
        completedAt: '2026-09-28 11:40:15',
        durationSeconds: 855,
        logs: [
          {
            id: 'log-bms-003-1',
            timestamp: '2026-09-28 11:26:00',
            phase: OtaVehicleTaskStatus.PENDING,
            action: '前置门禁自检',
            code: 'PRECHECK_PASS',
            description: '前置校验通过，启动下载',
            level: 'info',
          },
          {
            id: 'log-bms-003-2',
            timestamp: '2026-09-28 11:32:00',
            phase: OtaVehicleTaskStatus.DOWNLOADING,
            action: '固件包下载',
            code: 'FW_FETCH_OK',
            description: '固件包下载完成 (94.2 MB)',
            level: 'info',
          },
          {
            id: 'log-bms-003-3',
            timestamp: '2026-09-28 11:36:20',
            phase: OtaVehicleTaskStatus.UPGRADING,
            action: 'BMS 从节点 Flash 刷写',
            code: 'FLASH_BURNING',
            description: '正在擦写高压采集板固件',
            level: 'warn',
          },
          {
            id: 'log-bms-003-4',
            timestamp: '2026-09-28 11:40:15',
            phase: OtaVehicleTaskStatus.FAILED,
            action: '刷写异常终止与安全回滚',
            code: 'ERR_ECU_FLASH_CRC',
            description: 'CRC32 校验失败 (预期: 0x8A73E41F, 实际: 0x8A730000)，安全回滚至 v4.0.0',
            level: 'error',
          },
        ],
      },
      {
        id: 'task-bms-005',
        planId: 'plan-bms-202609-04',
        vehicleId: 'veh-005',
        plateNumber: '粤B·33333',
        vin: 'LFPH2E023N1000005',
        modelName: '汉 EV',
        currentVersion: 'v4.0.0',
        targetVersion: 'v4.1.0',
        status: OtaVehicleTaskStatus.CANCELLED,
        downloadProgress: 0,
        installProgress: 0,
        totalProgress: 0,
        retries: 0,
        maxRetries: 2,
        errorMessage: '批次失败率达到 33.3%，触发设定的 5% 失败熔断红线防御，系统已紧急中止未下发任务',
        logs: [
          {
            id: 'log-bms-005-1',
            timestamp: '2026-09-28 11:20:00',
            phase: OtaVehicleTaskStatus.PENDING,
            action: '创建任务排队',
            code: 'TASK_QUEUED',
            description: '等待批次调度下发',
            level: 'info',
          },
          {
            id: 'log-bms-005-2',
            timestamp: '2026-09-28 11:41:00',
            phase: OtaVehicleTaskStatus.CANCELLED,
            action: '熔断红线防御中止',
            code: 'CIRCUIT_BREAKER_ABORTED',
            description: '因计划内失败率超标触发熔断保护，为防止大面积故障扩大，系统自动中止任务下发',
            level: 'error',
          },
        ],
      },
    ],
  },
};
