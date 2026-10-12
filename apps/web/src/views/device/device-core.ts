import { ApiError } from '../../api/client.ts';

/**
 * IMEI 15位纯数字正则表达式
 */
export const IMEI_REGEX = /^\d{15}$/;

/**
 * 校验 IMEI 硬件标识（严格 15 位数字）
 */
export function validateImei(imei: string): boolean {
  if (!imei || typeof imei !== 'string') return false;
  return IMEI_REGEX.test(imei);
}

/**
 * ICCID 19~20 位字母数字正则表达式
 */
export const ICCID_REGEX = /^[a-zA-Z0-9]{19,20}$/;

/**
 * 校验 ICCID SIM卡识别码（19~20位字母数字）
 */
export function validateIccid(iccid: string): boolean {
  if (!iccid || typeof iccid !== 'string') return false;
  return ICCID_REGEX.test(iccid);
}

/**
 * 自动生成唯一规范设备编号（如 DEV_1712891234567_890）
 */
export function generateDeviceNo(prefix = 'DEV_'): string {
  const timestamp = Date.now().toString().slice(-6);
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${timestamp}${randomSuffix}`;
}

export type OnlineStatus = 'ONLINE' | 'OFFLINE' | 'ALARMING' | 'UPGRADING' | 'UNACTIVATED';

export type DeviceLifecycleStatus = 'ACTIVE' | 'INACTIVE' | 'DECOMMISSIONED';

export interface DeviceDto {
  id: string;
  deviceNo: string;
  imei: string;
  iccid?: string;
  productKey: string;
  productName?: string;
  projectId: string;
  projectName?: string;
  tenantId?: string;
  boundVehiclePlate?: string | null;
  boundVin?: string | null;
  onlineStatus: OnlineStatus;
  signalRsrp?: number;
  firmwareVersion: string;
  status: DeviceLifecycleStatus;
  activatedAt?: string;
  lastHeartbeatAt?: string;
  createdAt?: string;
  updatedAt?: string;
  mainVoltage?: number;
  backupBatteryPercent?: number;
  temperature?: number;
}

export interface DeviceQueryParams {
  keyword?: string;
  projectId?: string;
  onlineStatus?: string;
  firmwareVersion?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface DeviceStatsDto {
  totalCount: number;
  onlineCount: number;
  onlineRate: number;
  offlineCount: number;
  alarmingCount: number;
  quotaUsage: number;
  isQuotaWarning: boolean;
  quotaTotal: number;
  quotaUsed: number;
}

export interface ProjectDto {
  id: string;
  name: string;
  code: string;
  tenantId?: string;
  deviceCount?: number;
}

export interface CreateDeviceInput {
  deviceNo: string;
  imei: string;
  productKey: string;
  projectId: string;
  iccid?: string;
  status?: DeviceLifecycleStatus;
}

/**
 * 统计设备核心指标（总数、在线数、在线率%、离线数、告警数、配额占用比%、配额预警标志）
 */
export function calculateDeviceStats(devices: DeviceDto[], quotaTotal = 1000): DeviceStatsDto {
  const totalCount = devices.length;
  const onlineCount = devices.filter((d) => d.onlineStatus === 'ONLINE').length;
  const offlineCount = devices.filter((d) => d.onlineStatus === 'OFFLINE').length;
  const alarmingCount = devices.filter((d) => d.onlineStatus === 'ALARMING').length;

  const onlineRate = totalCount === 0 ? 0 : Number(((onlineCount / totalCount) * 100).toFixed(1));
  const quotaUsage = quotaTotal > 0 ? Number(((totalCount / quotaTotal) * 100).toFixed(1)) : 0;
  const isQuotaWarning = quotaUsage >= 90;

  return {
    totalCount,
    onlineCount,
    onlineRate,
    offlineCount,
    alarmingCount,
    quotaUsage,
    isQuotaWarning,
    quotaTotal,
    quotaUsed: totalCount,
  };
}

/**
 * 多维组合过滤纯函数
 */
export function filterDevices(devices: DeviceDto[], params?: DeviceQueryParams): DeviceDto[] {
  if (!params) return [...devices];

  const { keyword, projectId, onlineStatus, firmwareVersion, status } = params;
  const normalizedKeyword = keyword?.trim().toLowerCase();

  return devices.filter((device) => {
    // 关键字多字段模糊搜索 (deviceNo / imei / iccid / plate / vin)
    if (normalizedKeyword) {
      const matchDeviceNo = device.deviceNo.toLowerCase().includes(normalizedKeyword);
      const matchImei = device.imei.toLowerCase().includes(normalizedKeyword);
      const matchIccid = device.iccid ? device.iccid.toLowerCase().includes(normalizedKeyword) : false;
      const matchPlate = device.boundVehiclePlate
        ? device.boundVehiclePlate.toLowerCase().includes(normalizedKeyword)
        : false;
      const matchVin = device.boundVin ? device.boundVin.toLowerCase().includes(normalizedKeyword) : false;

      if (!matchDeviceNo && !matchImei && !matchIccid && !matchPlate && !matchVin) {
        return false;
      }
    }

    // 项目过滤
    if (projectId && projectId !== 'ALL' && device.projectId !== projectId) {
      return false;
    }

    // 在线状态过滤
    if (onlineStatus && onlineStatus !== 'ALL' && device.onlineStatus !== onlineStatus) {
      return false;
    }

    // 固件版本号过滤
    if (firmwareVersion && firmwareVersion !== 'ALL' && device.firmwareVersion !== firmwareVersion) {
      return false;
    }

    // 生命周期状态过滤
    if (status && status !== 'ALL' && device.status !== status) {
      return false;
    }

    return true;
  });
}

export interface SignalQualityMeta {
  bars: number;
  label: string;
  color: string;
  rsrp: number | null;
}

/**
 * 4G 信号 RSRP 映射 (dBm 阶梯条形指示器)
 * ≥ -85 dBm: 4格 极佳 绿色 (#52c41a)
 * -86 ~ -95 dBm: 3格 良好 蓝色 (#1677ff)
 * -96 ~ -105 dBm: 2格 一般 橙色 (#faad14)
 * < -105 dBm: 1格 极差 红色 (#ff4d4f)
 * 未知 / 空: 0格 无信号 灰色 (#8c8c8c)
 */
export function getSignalQuality(rsrp?: number | null): SignalQualityMeta {
  if (rsrp === undefined || rsrp === null || Number.isNaN(rsrp)) {
    return {
      bars: 0,
      label: '无信号',
      color: '#8c8c8c',
      rsrp: null,
    };
  }

  if (rsrp >= -85) {
    return {
      bars: 4,
      label: '极佳',
      color: '#52c41a',
      rsrp,
    };
  }

  if (rsrp >= -95) {
    return {
      bars: 3,
      label: '良好',
      color: '#1677ff',
      rsrp,
    };
  }

  if (rsrp >= -105) {
    return {
      bars: 2,
      label: '一般',
      color: '#faad14',
      rsrp,
    };
  }

  return {
    bars: 1,
    label: '极差',
    color: '#ff4d4f',
    rsrp,
  };
}

/**
 * 获取在线状态徽标和标签元信息
 */
export function getOnlineStatusMeta(status: string): { label: string; color: string; badgeColor: string } {
  switch (status) {
    case 'ONLINE':
      return { label: '在线', color: 'success', badgeColor: '#52c41a' };
    case 'OFFLINE':
      return { label: '离线', color: 'default', badgeColor: '#8c8c8c' };
    case 'ALARMING':
      return { label: '告警', color: 'error', badgeColor: '#ff4d4f' };
    case 'UPGRADING':
      return { label: '升级中', color: 'processing', badgeColor: '#1677ff' };
    case 'UNACTIVATED':
      return { label: '未激活', color: 'default', badgeColor: '#d9d9d9' };
    default:
      return { label: status, color: 'default', badgeColor: '#8c8c8c' };
  }
}

/**
 * 获取生命周期状态元信息
 */
export function getLifecycleStatusMeta(status: DeviceLifecycleStatus): { label: string; color: string } {
  switch (status) {
    case 'ACTIVE':
      return { label: '正常启用', color: 'green' };
    case 'INACTIVE':
      return { label: '已停用', color: 'warning' };
    case 'DECOMMISSIONED':
      return { label: '已报废', color: 'red' };
    default:
      return { label: status, color: 'default' };
  }
}

/**
 * 校验生命周期状态流转合法性
 * - DECOMMISSIONED 为终态，不可再逆向转换为 ACTIVE 或 INACTIVE
 * - ACTIVE 和 INACTIVE 之间可自由启停
 * - ACTIVE / INACTIVE 均可流转为 DECOMMISSIONED
 */
export function isValidStatusTransition(
  current: DeviceLifecycleStatus,
  next: DeviceLifecycleStatus
): boolean {
  if (current === next) return true;
  if (current === 'DECOMMISSIONED') {
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

/**
 * 预设项目种子数据
 */
export const SEED_PROJECTS: ProjectDto[] = [
  { id: 'proj-sz-01', name: '深圳极速智慧车队', code: 'SZ_SPEED_01', deviceCount: 520 },
  { id: 'proj-gz-02', name: '广州网约出行运营二期', code: 'GZ_RIDE_02', deviceCount: 310 },
  { id: 'proj-sh-03', name: '上海城际新能源干线', code: 'SH_LOGIS_03', deviceCount: 280 },
  { id: 'proj-bj-04', name: '北方冷链特种运输项目', code: 'BJ_COLD_04', deviceCount: 150 },
];

/**
 * 预设产品型号字典
 */
export const PRODUCT_KEY_OPTIONS = [
  { label: '4G 智慧车载终端 (标准版) - TBOX-G4-STD', value: 'TBOX-G4-STD' },
  { label: '5G 高性能车载终端 (旗舰版) - TBOX-G5-PRO', value: 'TBOX-G5-PRO' },
  { label: 'OBD-II 即插即用诊断仪 - OBD-II-PLUS', value: 'OBD-II-PLUS' },
  { label: '新能源双路CAN控制器 - TCU-EV-100', value: 'TCU-EV-100' },
];

/**
 * 真实多样化的设备台账种子数据
 */
export const SEED_DEVICES: DeviceDto[] = [
  {
    id: 'dev-10001',
    deviceNo: 'DEV_10001',
    imei: '868123045678901',
    iccid: '89860401123456789012',
    productKey: 'TBOX-G4-STD',
    productName: '4G 智慧车载终端 (标准版)',
    projectId: 'proj-sz-01',
    projectName: '深圳极速智慧车队',
    tenantId: 'tenant-001',
    boundVehiclePlate: '粤B·88888',
    boundVin: 'LFPH2E023N10001',
    onlineStatus: 'ONLINE',
    signalRsrp: -76,
    firmwareVersion: 'v2.1.0',
    status: 'ACTIVE',
    activatedAt: '2026-03-01 10:00:00',
    lastHeartbeatAt: '2026-10-12 10:45:00',
    createdAt: '2026-03-01 09:00:00',
    mainVoltage: 13.8,
    backupBatteryPercent: 95,
    temperature: 32,
  },
  {
    id: 'dev-10002',
    deviceNo: 'DEV_10002',
    imei: '868123045678902',
    iccid: '89860401123456789013',
    productKey: 'TBOX-G5-PRO',
    productName: '5G 高性能车载终端 (旗舰版)',
    projectId: 'proj-sz-01',
    projectName: '深圳极速智慧车队',
    tenantId: 'tenant-001',
    boundVehiclePlate: '粤B·66666',
    boundVin: 'LFPH2E023N10002',
    onlineStatus: 'ONLINE',
    signalRsrp: -82,
    firmwareVersion: 'v2.1.0',
    status: 'ACTIVE',
    activatedAt: '2026-03-02 11:00:00',
    lastHeartbeatAt: '2026-10-12 10:44:30',
    createdAt: '2026-03-02 09:30:00',
    mainVoltage: 14.1,
    backupBatteryPercent: 98,
    temperature: 34,
  },
  {
    id: 'dev-10003',
    deviceNo: 'DEV_10003',
    imei: '868123045678903',
    iccid: '89860401123456789014',
    productKey: 'OBD-II-PLUS',
    productName: 'OBD-II 即插即用诊断仪',
    projectId: 'proj-sz-01',
    projectName: '深圳极速智慧车队',
    tenantId: 'tenant-001',
    boundVehiclePlate: null,
    boundVin: null,
    onlineStatus: 'OFFLINE',
    signalRsrp: undefined,
    firmwareVersion: 'v2.0.8',
    status: 'ACTIVE',
    activatedAt: '2026-03-05 14:00:00',
    lastHeartbeatAt: '2026-10-11 18:20:00',
    createdAt: '2026-03-05 13:00:00',
    mainVoltage: 12.2,
    backupBatteryPercent: 60,
    temperature: 26,
  },
  {
    id: 'dev-10004',
    deviceNo: 'DEV_10004',
    imei: '868123045678904',
    iccid: '89860401123456789015',
    productKey: 'TBOX-G4-STD',
    productName: '4G 智慧车载终端 (标准版)',
    projectId: 'proj-gz-02',
    projectName: '广州网约出行运营二期',
    tenantId: 'tenant-001',
    boundVehiclePlate: '粤A·99887',
    boundVin: 'LFPH2E023N10004',
    onlineStatus: 'ALARMING',
    signalRsrp: -108,
    firmwareVersion: 'v2.0.8',
    status: 'ACTIVE',
    activatedAt: '2026-03-10 09:00:00',
    lastHeartbeatAt: '2026-10-12 10:40:15',
    createdAt: '2026-03-10 08:30:00',
    mainVoltage: 10.8,
    backupBatteryPercent: 15,
    temperature: 48,
  },
  {
    id: 'dev-10005',
    deviceNo: 'DEV_10005',
    imei: '868123045678905',
    iccid: '89860401123456789016',
    productKey: 'TCU-EV-100',
    productName: '新能源双路CAN控制器',
    projectId: 'proj-gz-02',
    projectName: '广州网约出行运营二期',
    tenantId: 'tenant-001',
    boundVehiclePlate: '粤A·12345',
    boundVin: 'LFPH2E023N10005',
    onlineStatus: 'ONLINE',
    signalRsrp: -90,
    firmwareVersion: 'v2.1.0',
    status: 'ACTIVE',
    activatedAt: '2026-03-12 16:30:00',
    lastHeartbeatAt: '2026-10-12 10:46:10',
    createdAt: '2026-03-12 15:00:00',
    mainVoltage: 13.5,
    backupBatteryPercent: 92,
    temperature: 31,
  },
  {
    id: 'dev-10006',
    deviceNo: 'DEV_10006',
    imei: '868123045678906',
    iccid: '89860401123456789017',
    productKey: 'TBOX-G4-STD',
    productName: '4G 智慧车载终端 (标准版)',
    projectId: 'proj-sh-03',
    projectName: '上海城际新能源干线',
    tenantId: 'tenant-001',
    boundVehiclePlate: '沪A·E5678',
    boundVin: 'LFPH2E023N10006',
    onlineStatus: 'ONLINE',
    signalRsrp: -98,
    firmwareVersion: 'v2.1.0',
    status: 'ACTIVE',
    activatedAt: '2026-03-15 10:15:00',
    lastHeartbeatAt: '2026-10-12 10:45:50',
    createdAt: '2026-03-15 09:00:00',
    mainVoltage: 13.9,
    backupBatteryPercent: 90,
    temperature: 30,
  },
  {
    id: 'dev-10007',
    deviceNo: 'DEV_10007',
    imei: '868123045678907',
    iccid: '89860401123456789018',
    productKey: 'TBOX-G5-PRO',
    productName: '5G 高性能车载终端 (旗舰版)',
    projectId: 'proj-sh-03',
    projectName: '上海城际新能源干线',
    tenantId: 'tenant-001',
    boundVehiclePlate: '沪B·87654',
    boundVin: 'LFPH2E023N10007',
    onlineStatus: 'OFFLINE',
    signalRsrp: -112,
    firmwareVersion: 'v2.0.7',
    status: 'INACTIVE',
    activatedAt: '2026-02-18 14:00:00',
    lastHeartbeatAt: '2026-10-09 11:30:00',
    createdAt: '2026-02-18 10:00:00',
    mainVoltage: 11.9,
    backupBatteryPercent: 40,
    temperature: 24,
  },
  {
    id: 'dev-10008',
    deviceNo: 'DEV_10008',
    imei: '868123045678908',
    iccid: '89860401123456789019',
    productKey: 'OBD-II-PLUS',
    productName: 'OBD-II 即插即用诊断仪',
    projectId: 'proj-bj-04',
    projectName: '北方冷链特种运输项目',
    tenantId: 'tenant-001',
    boundVehiclePlate: null,
    boundVin: null,
    onlineStatus: 'OFFLINE',
    signalRsrp: undefined,
    firmwareVersion: 'v2.0.8',
    status: 'INACTIVE',
    activatedAt: '2026-01-20 09:30:00',
    lastHeartbeatAt: '2026-09-30 15:10:00',
    createdAt: '2026-01-20 09:00:00',
    mainVoltage: 12.0,
    backupBatteryPercent: 55,
    temperature: 22,
  },
  {
    id: 'dev-10009',
    deviceNo: 'DEV_10009',
    imei: '868123045678909',
    iccid: '89860401123456789020',
    productKey: 'TCU-EV-100',
    productName: '新能源双路CAN控制器',
    projectId: 'proj-bj-04',
    projectName: '北方冷链特种运输项目',
    tenantId: 'tenant-001',
    boundVehiclePlate: '京A·88888',
    boundVin: 'LFPH2E023N10009',
    onlineStatus: 'ONLINE',
    signalRsrp: -72,
    firmwareVersion: 'v2.1.0',
    status: 'ACTIVE',
    activatedAt: '2026-03-25 10:00:00',
    lastHeartbeatAt: '2026-10-12 10:46:00',
    createdAt: '2026-03-25 09:30:00',
    mainVoltage: 14.2,
    backupBatteryPercent: 99,
    temperature: 28,
  },
  {
    id: 'dev-10010',
    deviceNo: 'DEV_10010',
    imei: '868123045678910',
    iccid: '89860401123456789021',
    productKey: 'TBOX-G4-STD',
    productName: '4G 智慧车载终端 (标准版)',
    projectId: 'proj-sz-01',
    projectName: '深圳极速智慧车队',
    tenantId: 'tenant-001',
    boundVehiclePlate: null,
    boundVin: null,
    onlineStatus: 'OFFLINE',
    signalRsrp: -120,
    firmwareVersion: 'v1.9.0',
    status: 'DECOMMISSIONED',
    activatedAt: '2025-09-01 10:00:00',
    lastHeartbeatAt: '2025-12-31 23:59:00',
    createdAt: '2025-09-01 09:00:00',
    mainVoltage: 0.0,
    backupBatteryPercent: 0,
    temperature: 20,
  },
  {
    id: 'dev-10011',
    deviceNo: 'DEV_10011',
    imei: '868123045678911',
    iccid: '89860401123456789022',
    productKey: 'TBOX-G4-STD',
    productName: '4G 智慧车载终端 (标准版)',
    projectId: 'proj-sz-01',
    projectName: '深圳极速智慧车队',
    tenantId: 'tenant-001',
    boundVehiclePlate: '粤B·11223',
    boundVin: 'LFPH2E023N10011',
    onlineStatus: 'ONLINE',
    signalRsrp: -84,
    firmwareVersion: 'v2.1.0',
    status: 'ACTIVE',
    activatedAt: '2026-04-01 10:00:00',
    lastHeartbeatAt: '2026-10-12 10:44:00',
    createdAt: '2026-04-01 09:30:00',
    mainVoltage: 13.7,
    backupBatteryPercent: 91,
    temperature: 33,
  },
  {
    id: 'dev-10012',
    deviceNo: 'DEV_10012',
    imei: '868123045678912',
    iccid: '89860401123456789023',
    productKey: 'TBOX-G5-PRO',
    productName: '5G 高性能车载终端 (旗舰版)',
    projectId: 'proj-sz-01',
    projectName: '深圳极速智慧车队',
    tenantId: 'tenant-001',
    boundVehiclePlate: '粤B·33445',
    boundVin: 'LFPH2E023N10012',
    onlineStatus: 'ONLINE',
    signalRsrp: -89,
    firmwareVersion: 'v2.1.0',
    status: 'ACTIVE',
    activatedAt: '2026-04-05 11:30:00',
    lastHeartbeatAt: '2026-10-12 10:45:20',
    createdAt: '2026-04-05 10:00:00',
    mainVoltage: 13.9,
    backupBatteryPercent: 94,
    temperature: 31,
  },
];
