import { ApiError } from '../../api/client.ts';

/**
 * ISO 3779 17位车架号 (VIN) 正则表达式 (严格排除英文字母 I, O, Q)
 */
export const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

/**
 * 大陆标准车牌正则表达式 (支持燃油车7位与新能源8位绿牌，兼容中点符)
 */
export const PLATE_REGEX =
  /^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领][A-Z][·.]?[A-HJ-NP-Z0-9]{4,5}[A-HJ-NP-Z0-9挂学警港澳]$/;

/**
 * 校验 17 位标准车架号 (VIN)
 * 自动转大写并去除首尾空格，依据 ISO 3779 排除 I/O/Q
 */
export function validateVin(vin: string): boolean {
  if (!vin || typeof vin !== 'string') return false;
  const normalized = vin.trim().toUpperCase();
  return VIN_REGEX.test(normalized);
}

/**
 * 校验中国大陆车牌号码 (燃油车7位 / 新能源8位绿牌)
 */
export function validatePlateNumber(plate: string): boolean {
  if (!plate || typeof plate !== 'string') return false;
  const normalized = plate.trim().toUpperCase();
  return PLATE_REGEX.test(normalized);
}

/**
 * 快速生成符合 ISO 3779 标准的 17 位示例 VIN (用于录入模态框示例填充)
 */
export function generateSampleVin(prefix = 'LFPH2E'): string {
  const allowedChars = '0123456789ABCDEFGHJKLMNPRSTUVWXYZ';
  let randomSuffix = '';
  for (let i = 0; i < 11; i++) {
    randomSuffix += allowedChars.charAt(Math.floor(Math.random() * allowedChars.length));
  }
  return `${prefix}${randomSuffix}`;
}

/**
 * 掩码脱敏大陆手机号码 (保留前3后4，中间4位为 ****)
 */
export function maskPhone(phone?: string): string {
  if (!phone || typeof phone !== 'string') return '-';
  const trimmed = phone.trim();
  if (/^1[3-9]\d{9}$/.test(trimmed)) {
    return `${trimmed.slice(0, 3)}****${trimmed.slice(7)}`;
  }
  return trimmed || '-';
}

export type VoltageHealth = 'NORMAL' | 'LOW' | 'OVERVOLTAGE' | 'UNKNOWN';

export interface VoltageMeta {
  text: string;
  color: string;
  isWarning: boolean;
  status: VoltageHealth;
}

/**
 * 格式化电瓶电压并进行色彩告警标注 (<11.5V 低压预警，>14.8V 过压预警)
 */
export function formatVoltage(voltage?: number): VoltageMeta {
  if (voltage === undefined || voltage === null || Number.isNaN(voltage)) {
    return { text: '-', color: '#8c8c8c', isWarning: false, status: 'UNKNOWN' };
  }
  if (voltage < 11.5) {
    return {
      text: `${voltage.toFixed(1)}V`,
      color: '#fa8c16',
      isWarning: true,
      status: 'LOW',
    };
  }
  if (voltage > 14.8) {
    return {
      text: `${voltage.toFixed(1)}V`,
      color: '#ff4d4f',
      isWarning: true,
      status: 'OVERVOLTAGE',
    };
  }
  return {
    text: `${voltage.toFixed(1)}V`,
    color: '#52c41a',
    isWarning: false,
    status: 'NORMAL',
  };
}

export type VehicleStatus = 'NORMAL' | 'MAINTENANCE' | 'LOCKED' | 'SCRAPPED';

export interface VehicleTelemetryDto {
  doorLocked?: boolean;
  trunkLocked?: boolean;
  engineStarted?: boolean;
  batteryVoltage?: number;
  mileage?: number;
  speed?: number;
  fuelOrBatteryLevel?: number;
  location?: string;
  lastReportedAt?: string;
}

export interface VehicleDto {
  id: string;
  vin: string;
  plateNumber: string;
  tenantId?: string;
  projectId: string;
  projectName?: string;
  brandId: string;
  brandName?: string;
  modelId: string;
  modelName?: string;
  deviceId?: string | null;
  deviceNo?: string | null;
  deviceOnlineStatus?: 'ONLINE' | 'OFFLINE' | 'ALARMING' | 'UPGRADING' | 'UNACTIVATED';
  status: VehicleStatus;
  telemetry?: VehicleTelemetryDto;
  ownerName?: string;
  ownerPhone?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface BrandDto {
  id: string;
  name: string;
  code: string;
  logoUrl?: string;
}

export interface ModelDto {
  id: string;
  brandId: string;
  name: string;
  code: string;
  template?: Record<string, unknown>;
}

export interface VehicleQueryParams {
  keyword?: string;
  projectId?: string;
  brandId?: string;
  modelId?: string;
  status?: string;
  bindStatus?: string;
  onlineStatus?: string;
  page?: number;
  pageSize?: number;
}

export interface VehicleStatsDto {
  total: number;
  totalCount: number;
  normalCount: number;
  maintenanceCount: number;
  lockedCount: number;
  scrappedCount: number;
  boundCount: number;
  boundRate: number;
  onlineCount: number;
  onlineRate: number;
  quotaTotal: number;
  quotaUsed: number;
  quotaUsage: number;
  isQuotaWarning: boolean;
}

/**
 * 计算车辆档案关键统计指标 (总数、状态细分、设备绑定率%、在线率%、配额占用比与预警标志)
 */
export function calculateVehicleStats(vehicles: VehicleDto[], quotaTotal = 1000): VehicleStatsDto {
  const total = vehicles.length;
  const normalCount = vehicles.filter((v) => v.status === 'NORMAL').length;
  const maintenanceCount = vehicles.filter((v) => v.status === 'MAINTENANCE').length;
  const lockedCount = vehicles.filter((v) => v.status === 'LOCKED').length;
  const scrappedCount = vehicles.filter((v) => v.status === 'SCRAPPED').length;

  const boundCount = vehicles.filter((v) => Boolean(v.deviceId || v.deviceNo)).length;
  const onlineCount = vehicles.filter(
    (v) => Boolean(v.deviceId || v.deviceNo) && v.deviceOnlineStatus === 'ONLINE'
  ).length;

  const boundRate = total === 0 ? 0 : Number(((boundCount / total) * 100).toFixed(1));
  const onlineRate = total === 0 ? 0 : Number(((onlineCount / total) * 100).toFixed(1));
  const quotaUsage = quotaTotal > 0 ? Number(((total / quotaTotal) * 100).toFixed(1)) : 0;
  const isQuotaWarning = quotaUsage >= 90;

  return {
    total,
    totalCount: total,
    normalCount,
    maintenanceCount,
    lockedCount,
    scrappedCount,
    boundCount,
    boundRate,
    onlineCount,
    onlineRate,
    quotaTotal,
    quotaUsed: total,
    quotaUsage,
    isQuotaWarning,
  };
}

/**
 * 纯函数：多维组合过滤车辆列表
 */
export function filterVehicles(vehicles: VehicleDto[], query?: VehicleQueryParams): VehicleDto[] {
  if (!query) return vehicles;
  const {
    keyword,
    projectId,
    brandId,
    modelId,
    status,
    bindStatus,
    onlineStatus,
  } = query;

  return vehicles.filter((v) => {
    // 关键字搜索 (车牌号 / VIN / 车载设备号 / 车主姓名 / 车主电话 / 品牌 / 车型)
    if (keyword && keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      const matchesPlate = v.plateNumber?.toLowerCase().includes(kw);
      const matchesVin = v.vin?.toLowerCase().includes(kw);
      const matchesDevice = v.deviceNo?.toLowerCase().includes(kw);
      const matchesOwner = v.ownerName?.toLowerCase().includes(kw);
      const matchesPhone = v.ownerPhone?.toLowerCase().includes(kw);
      const matchesBrand = v.brandName?.toLowerCase().includes(kw);
      const matchesModel = v.modelName?.toLowerCase().includes(kw);
      if (
        !matchesPlate &&
        !matchesVin &&
        !matchesDevice &&
        !matchesOwner &&
        !matchesPhone &&
        !matchesBrand &&
        !matchesModel
      ) {
        return false;
      }
    }

    // 项目过滤
    if (projectId && projectId !== 'ALL' && v.projectId !== projectId) {
      return false;
    }

    // 品牌过滤
    if (brandId && brandId !== 'ALL' && v.brandId !== brandId) {
      return false;
    }

    // 车型过滤
    if (modelId && modelId !== 'ALL' && v.modelId !== modelId) {
      return false;
    }

    // 状态过滤
    if (status && status !== 'ALL' && v.status !== status) {
      return false;
    }

    // 绑定状态过滤
    if (bindStatus && bindStatus !== 'ALL') {
      const isBound = Boolean(v.deviceId || v.deviceNo);
      if (bindStatus === 'BOUND' && !isBound) return false;
      if (bindStatus === 'UNBOUND' && isBound) return false;
    }

    // 在线状态过滤
    if (onlineStatus && onlineStatus !== 'ALL') {
      const isOnline = v.deviceOnlineStatus === 'ONLINE';
      if (onlineStatus === 'ONLINE' && !isOnline) return false;
      if (onlineStatus === 'OFFLINE' && isOnline) return false;
    }

    return true;
  });
}

/**
 * 获取车辆生命周期状态元信息与规范配色
 */
export function getVehicleStatusMeta(status: VehicleStatus): {
  label: string;
  color: string;
  tagColor: string;
} {
  switch (status) {
    case 'NORMAL':
      return { label: '正常运营', color: '#52c41a', tagColor: 'success' };
    case 'MAINTENANCE':
      return { label: '维保检修', color: '#fa8c16', tagColor: 'warning' };
    case 'LOCKED':
      return { label: '风控锁死', color: '#722ed1', tagColor: 'purple' };
    case 'SCRAPPED':
      return { label: '已报废', color: '#8c8c8c', tagColor: 'default' };
    default:
      return { label: status, color: '#8c8c8c', tagColor: 'default' };
  }
}

/**
 * 校验车辆生命周期状态转换合法性
 * - SCRAPPED (已报废) 为物理终态，不可逆向流转回 NORMAL/MAINTENANCE/LOCKED
 * - 其余各状态之间允许合理流转
 */
export function isValidVehicleStatusTransition(from: VehicleStatus, to: VehicleStatus): boolean {
  if (from === to) return true;
  if (from === 'SCRAPPED') {
    return false;
  }
  return true;
}

/**
 * 判断捕获的异常是否为带有 HTTP 状态码的后端业务 ApiError
 */
export function isApiError(err: unknown): err is ApiError {
  if (err instanceof ApiError) return true;
  if (typeof err === 'object' && err !== null) {
    const candidate = err as Record<string, unknown>;
    return typeof candidate.statusCode === 'number' && typeof candidate.message === 'string';
  }
  return false;
}

// ---------------- 种子基础数据 ----------------

export const SEED_BRANDS: BrandDto[] = [
  { id: 'brand-byd', name: '比亚迪', code: 'BYD' },
  { id: 'brand-tesla', name: '特斯拉', code: 'Tesla' },
  { id: 'brand-aion', name: '广汽埃安', code: 'AION' },
  { id: 'brand-zeekr', name: '吉利极氪', code: 'ZEEKR' },
];

export const SEED_MODELS: ModelDto[] = [
  { id: 'model-byd-han', brandId: 'brand-byd', name: '汉 EV', code: '0x0101' },
  { id: 'model-tesla-modely', brandId: 'brand-tesla', name: 'Model Y', code: '0x0201' },
  { id: 'model-aion-s', brandId: 'brand-aion', name: 'AION S', code: '0x0301' },
  { id: 'model-zeekr-001', brandId: 'brand-zeekr', name: '极氪 001', code: '0x0401' },
];

export const SEED_VEHICLES: VehicleDto[] = [
  {
    id: 'veh-001',
    vin: 'LFPH2E023N1000001',
    plateNumber: '粤B·88888',
    tenantId: 'tenant-001',
    projectId: 'proj-sz-01',
    projectName: '深圳极速智慧车队',
    brandId: 'brand-byd',
    brandName: '比亚迪',
    modelId: 'model-byd-han',
    modelName: '汉 EV',
    deviceId: 'dev-001',
    deviceNo: 'DEV_1001',
    deviceOnlineStatus: 'ONLINE',
    status: 'NORMAL',
    telemetry: {
      doorLocked: true,
      trunkLocked: true,
      engineStarted: false,
      batteryVoltage: 12.6,
      mileage: 15200,
      speed: 0,
      fuelOrBatteryLevel: 85,
      location: '深圳市南山区科技园南区',
      lastReportedAt: '2026-10-12 10:00:00',
    },
    ownerName: '张伟',
    ownerPhone: '13800138888',
    createdAt: '2026-03-01 10:00:00',
    updatedAt: '2026-10-12 10:00:00',
  },
  {
    id: 'veh-002',
    vin: 'LFPH2E023N1000002',
    plateNumber: '粤B·D12345',
    tenantId: 'tenant-001',
    projectId: 'proj-sz-01',
    projectName: '深圳极速智慧车队',
    brandId: 'brand-tesla',
    brandName: '特斯拉',
    modelId: 'model-tesla-modely',
    modelName: 'Model Y',
    deviceId: 'dev-002',
    deviceNo: 'DEV_1002',
    deviceOnlineStatus: 'ONLINE',
    status: 'NORMAL',
    telemetry: {
      doorLocked: true,
      trunkLocked: true,
      engineStarted: true,
      batteryVoltage: 13.8,
      mileage: 8920,
      speed: 45,
      fuelOrBatteryLevel: 72,
      location: '深圳市福田区深南大道',
      lastReportedAt: '2026-10-12 10:02:00',
    },
    ownerName: '李敏',
    ownerPhone: '13912345678',
    createdAt: '2026-03-02 11:00:00',
    updatedAt: '2026-10-12 10:02:00',
  },
  {
    id: 'veh-003',
    vin: 'LFPH2E023N1000003',
    plateNumber: '粤A·99887',
    tenantId: 'tenant-001',
    projectId: 'proj-gz-02',
    projectName: '广州网约出行运营二期',
    brandId: 'brand-aion',
    brandName: '广汽埃安',
    modelId: 'model-aion-s',
    modelName: 'AION S',
    deviceId: 'dev-003',
    deviceNo: 'DEV_1003',
    deviceOnlineStatus: 'OFFLINE',
    status: 'MAINTENANCE',
    telemetry: {
      doorLocked: false,
      trunkLocked: true,
      engineStarted: false,
      batteryVoltage: 11.2,
      mileage: 42100,
      speed: 0,
      fuelOrBatteryLevel: 30,
      location: '广州市天河区车陂检修厂',
      lastReportedAt: '2026-10-11 18:30:00',
    },
    ownerName: '王强',
    ownerPhone: '13788889988',
    createdAt: '2026-03-05 14:00:00',
    updatedAt: '2026-10-11 18:30:00',
  },
  {
    id: 'veh-004',
    vin: 'LFPH2E023N1000004',
    plateNumber: '京A·F66666',
    tenantId: 'tenant-001',
    projectId: 'proj-bj-04',
    projectName: '北京高端政企车队',
    brandId: 'brand-zeekr',
    brandName: '吉利极氪',
    modelId: 'model-zeekr-001',
    modelName: '极氪 001',
    deviceId: 'dev-004',
    deviceNo: 'DEV_1004',
    deviceOnlineStatus: 'ONLINE',
    status: 'NORMAL',
    telemetry: {
      doorLocked: true,
      trunkLocked: true,
      engineStarted: false,
      batteryVoltage: 12.8,
      mileage: 5600,
      speed: 0,
      fuelOrBatteryLevel: 92,
      location: '北京市朝阳区建国门外大街',
      lastReportedAt: '2026-10-12 09:58:00',
    },
    ownerName: '刘洋',
    ownerPhone: '13666666666',
    createdAt: '2026-03-08 09:00:00',
    updatedAt: '2026-10-12 09:58:00',
  },
  {
    id: 'veh-005',
    vin: 'LFPH2E023N1000005',
    plateNumber: '沪A·12345',
    tenantId: 'tenant-001',
    projectId: 'proj-sh-03',
    projectName: '华东城际物流专线',
    brandId: 'brand-byd',
    brandName: '比亚迪',
    modelId: 'model-byd-han',
    modelName: '汉 EV',
    deviceId: 'dev-005',
    deviceNo: 'DEV_1005',
    deviceOnlineStatus: 'ONLINE',
    status: 'LOCKED',
    telemetry: {
      doorLocked: true,
      trunkLocked: true,
      engineStarted: false,
      batteryVoltage: 12.4,
      mileage: 31200,
      speed: 0,
      fuelOrBatteryLevel: 45,
      location: '上海市浦东新区张江高科园区',
      lastReportedAt: '2026-10-12 09:50:00',
    },
    ownerName: '陈晨',
    ownerPhone: '13500004321',
    createdAt: '2026-03-10 09:00:00',
    updatedAt: '2026-10-12 09:50:00',
  },
  {
    id: 'veh-006',
    vin: 'LFPH2E023N1000006',
    plateNumber: '粤B·77665',
    tenantId: 'tenant-001',
    projectId: 'proj-sz-01',
    projectName: '深圳极速智慧车队',
    brandId: 'brand-aion',
    brandName: '广汽埃安',
    modelId: 'model-aion-s',
    modelName: 'AION S',
    deviceId: 'dev-006',
    deviceNo: 'DEV_1006',
    deviceOnlineStatus: 'ONLINE',
    status: 'NORMAL',
    telemetry: {
      doorLocked: false,
      trunkLocked: true,
      engineStarted: true,
      batteryVoltage: 14.1,
      mileage: 19800,
      speed: 62,
      fuelOrBatteryLevel: 68,
      location: '深圳市宝安区宝安大道',
      lastReportedAt: '2026-10-12 10:04:00',
    },
    ownerName: '赵敏',
    ownerPhone: '13888887766',
    createdAt: '2026-03-15 11:30:00',
    updatedAt: '2026-10-12 10:04:00',
  },
  {
    id: 'veh-007',
    vin: 'LFPH2E023N1000007',
    plateNumber: '京A·88990',
    tenantId: 'tenant-001',
    projectId: 'proj-bj-04',
    projectName: '北京高端政企车队',
    brandId: 'brand-tesla',
    brandName: '特斯拉',
    modelId: 'model-tesla-modely',
    modelName: 'Model Y',
    deviceId: null,
    deviceNo: null,
    deviceOnlineStatus: undefined,
    status: 'SCRAPPED',
    telemetry: undefined,
    ownerName: '孙权',
    ownerPhone: '13900008890',
    createdAt: '2026-01-15 10:00:00',
    updatedAt: '2026-09-01 10:00:00',
  },
  {
    id: 'veh-008',
    vin: 'LFPH2E023N1000008',
    plateNumber: '粤B·55443',
    tenantId: 'tenant-001',
    projectId: 'proj-sz-01',
    projectName: '深圳极速智慧车队',
    brandId: 'brand-zeekr',
    brandName: '吉利极氪',
    modelId: 'model-zeekr-001',
    modelName: '极氪 001',
    deviceId: null,
    deviceNo: null,
    deviceOnlineStatus: undefined,
    status: 'NORMAL',
    telemetry: {
      doorLocked: true,
      trunkLocked: true,
      engineStarted: false,
      batteryVoltage: 12.5,
      mileage: 1200,
      speed: 0,
      fuelOrBatteryLevel: 90,
      location: '深圳市龙华区清湖整车仓储',
      lastReportedAt: '2026-10-12 08:00:00',
    },
    ownerName: '周杰',
    ownerPhone: '13700005544',
    createdAt: '2026-04-01 15:00:00',
    updatedAt: '2026-10-12 08:00:00',
  },
  {
    id: 'veh-009',
    vin: 'LFPH2E023N1000009',
    plateNumber: '沪A·99001',
    tenantId: 'tenant-001',
    projectId: 'proj-sh-03',
    projectName: '华东城际物流专线',
    brandId: 'brand-byd',
    brandName: '比亚迪',
    modelId: 'model-byd-han',
    modelName: '汉 EV',
    deviceId: 'dev-007',
    deviceNo: 'DEV_1007',
    deviceOnlineStatus: 'ONLINE',
    status: 'NORMAL',
    telemetry: {
      doorLocked: true,
      trunkLocked: true,
      engineStarted: false,
      batteryVoltage: 12.7,
      mileage: 16500,
      speed: 0,
      fuelOrBatteryLevel: 78,
      location: '上海市虹桥商务区',
      lastReportedAt: '2026-10-12 09:30:00',
    },
    ownerName: '吴磊',
    ownerPhone: '13600009901',
    createdAt: '2026-04-10 10:20:00',
    updatedAt: '2026-10-12 09:30:00',
  },
  {
    id: 'veh-010',
    vin: 'LFPH2E023N1000010',
    plateNumber: '粤A·66778',
    tenantId: 'tenant-001',
    projectId: 'proj-gz-02',
    projectName: '广州网约出行运营二期',
    brandId: 'brand-aion',
    brandName: '广汽埃安',
    modelId: 'model-aion-s',
    modelName: 'AION S',
    deviceId: null,
    deviceNo: null,
    deviceOnlineStatus: undefined,
    status: 'NORMAL',
    telemetry: {
      doorLocked: false,
      trunkLocked: false,
      engineStarted: false,
      batteryVoltage: 12.3,
      mileage: 28400,
      speed: 0,
      fuelOrBatteryLevel: 55,
      location: '广州市海珠区新港中路',
      lastReportedAt: '2026-10-12 07:15:00',
    },
    ownerName: '郑恺',
    ownerPhone: '13500006677',
    createdAt: '2026-04-15 16:40:00',
    updatedAt: '2026-10-12 07:15:00',
  },
  {
    id: 'veh-011',
    vin: 'LFPH2E023N1000011',
    plateNumber: '京A·33221',
    tenantId: 'tenant-001',
    projectId: 'proj-bj-04',
    projectName: '北京高端政企车队',
    brandId: 'brand-tesla',
    brandName: '特斯拉',
    modelId: 'model-tesla-modely',
    modelName: 'Model Y',
    deviceId: 'dev-008',
    deviceNo: 'DEV_1008',
    deviceOnlineStatus: 'OFFLINE',
    status: 'MAINTENANCE',
    telemetry: {
      doorLocked: true,
      trunkLocked: true,
      engineStarted: false,
      batteryVoltage: 11.4,
      mileage: 51200,
      speed: 0,
      fuelOrBatteryLevel: 22,
      location: '北京市大兴区亦庄开发区',
      lastReportedAt: '2026-10-11 21:00:00',
    },
    ownerName: '冯绍',
    ownerPhone: '13800003322',
    createdAt: '2026-04-20 13:10:00',
    updatedAt: '2026-10-11 21:00:00',
  },
  {
    id: 'veh-012',
    vin: 'LFPH2E023N1000012',
    plateNumber: '粤B·11223',
    tenantId: 'tenant-001',
    projectId: 'proj-sz-01',
    projectName: '深圳极速智慧车队',
    brandId: 'brand-zeekr',
    brandName: '吉利极氪',
    modelId: 'model-zeekr-001',
    modelName: '极氪 001',
    deviceId: 'dev-009',
    deviceNo: 'DEV_1009',
    deviceOnlineStatus: 'ONLINE',
    status: 'NORMAL',
    telemetry: {
      doorLocked: true,
      trunkLocked: true,
      engineStarted: true,
      batteryVoltage: 13.9,
      mileage: 7300,
      speed: 38,
      fuelOrBatteryLevel: 88,
      location: '深圳市南山区后海滨路',
      lastReportedAt: '2026-10-12 10:05:00',
    },
    ownerName: '韩雪',
    ownerPhone: '13900001122',
    createdAt: '2026-05-01 09:30:00',
    updatedAt: '2026-10-12 10:05:00',
  },
];
