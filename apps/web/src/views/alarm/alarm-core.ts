import {
  AlarmType,
  AlarmLevel,
  AlarmStatus,
  isTerminalAlarmStatus,
  TERMINAL_ALARM_STATUSES,
  VALID_ALARM_STATUS_TRANSITIONS,
  canTransitionAlarmStatus,
  type ProcessAlarmDto,
} from '@car-control/contracts';
import { ApiError } from '../../api/client.ts';

// Re-export contract enums and invariants as domain source of truth
export {
  AlarmType,
  AlarmLevel,
  AlarmStatus,
  isTerminalAlarmStatus,
  TERMINAL_ALARM_STATUSES,
  VALID_ALARM_STATUS_TRANSITIONS,
  canTransitionAlarmStatus,
  type ProcessAlarmDto,
};

/**
 * 告警记录实体模型 (包含车辆资产与工况遥测展示属性)
 */
export interface AlarmRecord {
  id: string;
  tenantId: string;
  projectId: string;
  vehicleId: string;
  plateNumber?: string;
  vin?: string;
  vehicleModel?: string;
  deviceNo: string;
  alarmType: AlarmType;
  alarmLevel: AlarmLevel;
  lat?: number;
  lng?: number;
  speed?: number;
  voltage?: number;
  status: AlarmStatus;
  message?: string;
  triggeredAt: string | Date;
  processedAt?: string | Date;
  processedBy?: string;
  operatorId?: string; // processedBy 的业务别名
  remark?: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

/**
 * 告警多维查询参数接口
 */
export interface AlarmQueryParams {
  keyword?: string;
  alarmType?: AlarmType | string;
  alarmLevel?: AlarmLevel | string;
  status?: AlarmStatus | string;
  startDate?: string | Date;
  endDate?: string | Date;
  tenantId?: string;
  projectId?: string;
  vehicleId?: string;
  deviceNo?: string;
}

/**
 * 校验告警状态转移是否合法 (仅允许 PENDING -> PROCESSED 与 PENDING -> IGNORED)
 */
export function isValidAlarmStatusTransition(from: AlarmStatus, to: AlarmStatus): boolean {
  if (from === to) return false;
  return canTransitionAlarmStatus(from, to);
}

/**
 * 告警类型视觉与业务元数据结构
 */
export interface AlarmTypeMeta {
  type: AlarmType;
  label: string;
  enLabel: string;
  icon: string;
  tagColor: string;
  color: string;
  defaultLevel: AlarmLevel;
  guide: string;
}

/**
 * 8 大告警类型全量语义元数据字典
 */
export const ALARM_TYPE_METADATA: Record<AlarmType, AlarmTypeMeta> = {
  [AlarmType.LOW_BATTERY]: {
    type: AlarmType.LOW_BATTERY,
    label: '蓄电池欠压/低电量',
    enLabel: 'Low Battery',
    icon: 'ThunderboltOutlined',
    tagColor: 'orange',
    color: '#fa8c16',
    defaultLevel: AlarmLevel.WARNING,
    guide: '检查蓄电池供电或T-Box备用电池电量，安排车辆充电或派工检修',
  },
  [AlarmType.VIBRATION]: {
    type: AlarmType.VIBRATION,
    label: '异常震动/防盗触发',
    enLabel: 'Abnormal Vibration',
    icon: 'AlertOutlined',
    tagColor: 'volcano',
    color: '#fa541c',
    defaultLevel: AlarmLevel.WARNING,
    guide: '核对车辆停放监控，联系车主确认车辆是否遭受外力碰撞或非法触碰',
  },
  [AlarmType.OVERSPEED]: {
    type: AlarmType.OVERSPEED,
    label: '超速预警',
    enLabel: 'Overspeed',
    icon: 'DashboardOutlined',
    tagColor: 'gold',
    color: '#faad14',
    defaultLevel: AlarmLevel.INFO,
    guide: '下发合规车速提醒或记录运营超速违章台账',
  },
  [AlarmType.POWER_CUT]: {
    type: AlarmType.POWER_CUT,
    label: '主电源非法剪线',
    enLabel: 'Power Cut',
    icon: 'DisconnectOutlined',
    tagColor: 'red',
    color: '#cf1322',
    defaultLevel: AlarmLevel.CRITICAL,
    guide: '车辆主电源被非法切断，存在重大被盗拆解风险，立即远程锁定或报警',
  },
  [AlarmType.SOS]: {
    type: AlarmType.SOS,
    label: '车主紧急呼救 (SOS)',
    enLabel: 'Emergency SOS',
    icon: 'PhoneOutlined',
    tagColor: 'magenta',
    color: '#eb2f96',
    defaultLevel: AlarmLevel.CRITICAL,
    guide: '车主触发紧急求助按钮，立即电话回拨车主并联动 110/120 紧急救援',
  },
  [AlarmType.TOW_AWAY]: {
    type: AlarmType.TOW_AWAY,
    label: '异常拖车/位移',
    enLabel: 'Tow Away',
    icon: 'CarOutlined',
    tagColor: 'red',
    color: '#f5222d',
    defaultLevel: AlarmLevel.CRITICAL,
    guide: '车辆在熄火设防状态下发生异常位移，核实是否为交警清障或非法盗运',
  },
  [AlarmType.GEOFENCE_IN]: {
    type: AlarmType.GEOFENCE_IN,
    label: '越界驶入围栏',
    enLabel: 'Geofence Entry',
    icon: 'CompassOutlined',
    tagColor: 'purple',
    color: '#722ed1',
    defaultLevel: AlarmLevel.WARNING,
    guide: '车辆非法驶入限行/管控围栏区域，核查派车任务或下发禁行预警',
  },
  [AlarmType.GEOFENCE_OUT]: {
    type: AlarmType.GEOFENCE_OUT,
    label: '越界驶出围栏',
    enLabel: 'Geofence Exit',
    icon: 'AimOutlined',
    tagColor: 'cyan',
    color: '#13c2c2',
    defaultLevel: AlarmLevel.WARNING,
    guide: '车辆驶出规定运营电子围栏，核查还车网点或联系司机',
  },
};

/**
 * 告警严重级别元数据
 */
export const ALARM_LEVEL_METADATA: Record<
  AlarmLevel,
  { label: string; enLabel: string; color: string; tagColor: string; badgeStatus: 'error' | 'warning' | 'processing' | 'default' }
> = {
  [AlarmLevel.CRITICAL]: {
    label: '紧急 P0',
    enLabel: 'Critical',
    color: '#cf1322',
    tagColor: 'error',
    badgeStatus: 'error',
  },
  [AlarmLevel.WARNING]: {
    label: '警告 P1',
    enLabel: 'Warning',
    color: '#fa8c16',
    tagColor: 'warning',
    badgeStatus: 'warning',
  },
  [AlarmLevel.INFO]: {
    label: '提示 P2',
    enLabel: 'Info',
    color: '#1677ff',
    tagColor: 'processing',
    badgeStatus: 'processing',
  },
};

/**
 * 告警生命周期状态元数据
 */
export const ALARM_STATUS_METADATA: Record<
  AlarmStatus,
  { label: string; color: string; tagColor: string; badgeStatus: 'warning' | 'success' | 'default' }
> = {
  [AlarmStatus.PENDING]: {
    label: '待处置',
    color: '#faad14',
    tagColor: 'warning',
    badgeStatus: 'warning',
  },
  [AlarmStatus.PROCESSED]: {
    label: '已处理',
    color: '#52c41a',
    tagColor: 'success',
    badgeStatus: 'success',
  },
  [AlarmStatus.IGNORED]: {
    label: '已忽略',
    color: '#8c8c8c',
    tagColor: 'default',
    badgeStatus: 'default',
  },
};

/**
 * 告警大屏核心 KPI 统计接口
 */
export interface AlarmStatsSummary {
  total: number;
  pending: number;
  processed: number;
  ignored: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  processRate: number; // 0 ~ 100 处置闭环率 %
  todayCount: number;
}

/**
 * 纯算法：统计告警数据指标
 */
export function calculateAlarmStats(alarms: AlarmRecord[]): AlarmStatsSummary {
  if (!alarms || alarms.length === 0) {
    return {
      total: 0,
      pending: 0,
      processed: 0,
      ignored: 0,
      criticalCount: 0,
      warningCount: 0,
      infoCount: 0,
      processRate: 0,
      todayCount: 0,
    };
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayEnd = todayStart + 24 * 60 * 60 * 1000;

  let pending = 0;
  let processed = 0;
  let ignored = 0;
  let criticalCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  let todayCount = 0;

  for (const alarm of alarms) {
    if (alarm.status === AlarmStatus.PENDING) pending++;
    else if (alarm.status === AlarmStatus.PROCESSED) processed++;
    else if (alarm.status === AlarmStatus.IGNORED) ignored++;

    if (alarm.alarmLevel === AlarmLevel.CRITICAL) criticalCount++;
    else if (alarm.alarmLevel === AlarmLevel.WARNING) warningCount++;
    else if (alarm.alarmLevel === AlarmLevel.INFO) infoCount++;

    const triggeredTime = new Date(alarm.triggeredAt).getTime();
    if (triggeredTime >= todayStart && triggeredTime < todayEnd) {
      todayCount++;
    }
  }

  const total = alarms.length;
  const closedCount = processed + ignored;
  const processRate = total === 0 ? 0 : Math.round((closedCount / total) * 1000) / 10;

  return {
    total,
    pending,
    processed,
    ignored,
    criticalCount,
    warningCount,
    infoCount,
    processRate,
    todayCount,
  };
}

/**
 * 纯算法：多维条件过滤告警列表
 */
export function filterAlarms(alarms: AlarmRecord[], query?: AlarmQueryParams): AlarmRecord[] {
  if (!query) return alarms;

  return alarms.filter((item) => {
    if (query.keyword) {
      const kw = query.keyword.trim().toLowerCase();
      const matchPlate = item.plateNumber?.toLowerCase().includes(kw);
      const matchVin = item.vin?.toLowerCase().includes(kw);
      const matchDevice = item.deviceNo?.toLowerCase().includes(kw);
      const matchMsg = item.message?.toLowerCase().includes(kw);
      const matchOperator = item.processedBy?.toLowerCase().includes(kw);
      const matchVehicleId = item.vehicleId?.toLowerCase().includes(kw);
      const matchId = item.id.toLowerCase().includes(kw);

      if (!matchPlate && !matchVin && !matchDevice && !matchMsg && !matchOperator && !matchVehicleId && !matchId) {
        return false;
      }
    }

    if (query.alarmType && query.alarmType !== 'ALL' && item.alarmType !== query.alarmType) {
      return false;
    }

    if (query.alarmLevel && query.alarmLevel !== 'ALL' && item.alarmLevel !== query.alarmLevel) {
      return false;
    }

    if (query.status && query.status !== 'ALL' && item.status !== query.status) {
      return false;
    }

    if (query.startDate) {
      const startTime = new Date(query.startDate).getTime();
      const itemTime = new Date(item.triggeredAt).getTime();
      if (itemTime < startTime) return false;
    }

    if (query.endDate) {
      const endTime = new Date(query.endDate).getTime();
      const itemTime = new Date(item.triggeredAt).getTime();
      if (itemTime > endTime) return false;
    }

    if (query.tenantId && item.tenantId !== query.tenantId) {
      return false;
    }

    if (query.projectId && item.projectId !== query.projectId) {
      return false;
    }

    if (query.vehicleId && item.vehicleId !== query.vehicleId) {
      return false;
    }

    if (query.deviceNo && item.deviceNo !== query.deviceNo) {
      return false;
    }

    return true;
  });
}

/**
 * 14 条高保真种子告警数据 (覆盖全部 8 种类型及 3 种生命周期状态)
 */
export const SEED_ALARMS: AlarmRecord[] = [
  {
    id: 'alm-20261015-001',
    tenantId: 'tenant-001',
    projectId: 'proj-shenzhen-01',
    vehicleId: 'veh-001',
    plateNumber: '粤B·F10293',
    vin: 'LSVAA2180E2034912',
    vehicleModel: '仰望 U8 越野豪华版',
    deviceNo: 'TBOX-SZ-001',
    alarmType: AlarmType.SOS,
    alarmLevel: AlarmLevel.CRITICAL,
    lat: 22.5428,
    lng: 113.9389,
    speed: 0,
    voltage: 12.6,
    status: AlarmStatus.PENDING,
    message: '车机物理 SOS 按键被车主紧急触发，需要立即连线介入',
    triggeredAt: '2026-10-15T08:50:00Z',
    createdAt: '2026-10-15T08:50:00Z',
    updatedAt: '2026-10-15T08:50:00Z',
  },
  {
    id: 'alm-20261015-002',
    tenantId: 'tenant-001',
    projectId: 'proj-shenzhen-01',
    vehicleId: 'veh-002',
    plateNumber: '粤B·98124',
    vin: 'LSVBA2180K2098231',
    vehicleModel: '比亚迪 汉 EV 千山翠',
    deviceNo: 'TBOX-SZ-002',
    alarmType: AlarmType.POWER_CUT,
    alarmLevel: AlarmLevel.CRITICAL,
    lat: 22.5312,
    lng: 113.9451,
    speed: 0,
    voltage: 0.0,
    status: AlarmStatus.PENDING,
    message: 'T-Box 检测到主供电线路异常掉电，当前切换至后备纽扣电池供电',
    triggeredAt: '2026-10-15T08:35:00Z',
    createdAt: '2026-10-15T08:35:00Z',
    updatedAt: '2026-10-15T08:35:00Z',
  },
  {
    id: 'alm-20261015-003',
    tenantId: 'tenant-001',
    projectId: 'proj-shanghai-01',
    vehicleId: 'veh-005',
    plateNumber: '沪A·D58291',
    vin: 'LSVCA3180F3012984',
    vehicleModel: '特斯拉 Model Y 长续航',
    deviceNo: 'TBOX-SH-001',
    alarmType: AlarmType.LOW_BATTERY,
    alarmLevel: AlarmLevel.WARNING,
    lat: 31.2382,
    lng: 121.5015,
    speed: 0,
    voltage: 10.7,
    status: AlarmStatus.PENDING,
    message: '12V 铅酸小蓄电池电压跌落至 10.7V (<11.2V 欠压阈值)',
    triggeredAt: '2026-10-15T07:45:00Z',
    createdAt: '2026-10-15T07:45:00Z',
    updatedAt: '2026-10-15T07:45:00Z',
  },
  {
    id: 'alm-20261015-004',
    tenantId: 'tenant-001',
    projectId: 'proj-beijing-01',
    vehicleId: 'veh-006',
    plateNumber: '京A·88991',
    vin: 'LSVDA4180H4018239',
    vehicleModel: '蔚来 ET7 首发版',
    deviceNo: 'TBOX-BJ-001',
    alarmType: AlarmType.VIBRATION,
    alarmLevel: AlarmLevel.WARNING,
    lat: 39.9142,
    lng: 116.4074,
    speed: 0,
    voltage: 12.8,
    status: AlarmStatus.PENDING,
    message: '停车锁车设防状态下触发三轴加速度计剧烈震动信号',
    triggeredAt: '2026-10-15T06:20:00Z',
    createdAt: '2026-10-15T06:20:00Z',
    updatedAt: '2026-10-15T06:20:00Z',
  },
  {
    id: 'alm-20261015-005',
    tenantId: 'tenant-001',
    projectId: 'proj-chengdu-01',
    vehicleId: 'veh-007',
    plateNumber: '川A·78921',
    vin: 'LSVEA5180J5019823',
    vehicleModel: '极氪 001 YOU 版',
    deviceNo: 'TBOX-CD-001',
    alarmType: AlarmType.TOW_AWAY,
    alarmLevel: AlarmLevel.CRITICAL,
    lat: 30.6586,
    lng: 104.0648,
    speed: 28,
    voltage: 12.5,
    status: AlarmStatus.PENDING,
    message: '车辆处于熄火未解锁状态，检测到位移超 300 米且伴随加速度',
    triggeredAt: '2026-10-15T05:15:00Z',
    createdAt: '2026-10-15T05:15:00Z',
    updatedAt: '2026-10-15T05:15:00Z',
  },
  {
    id: 'alm-20261015-006',
    tenantId: 'tenant-001',
    projectId: 'proj-shanghai-01',
    vehicleId: 'veh-008',
    plateNumber: '沪A·38192',
    vin: 'LSVFA6180M6029812',
    vehicleModel: '理想 L9 Max',
    deviceNo: 'TBOX-SH-002',
    alarmType: AlarmType.GEOFENCE_IN,
    alarmLevel: AlarmLevel.WARNING,
    lat: 31.2462,
    lng: 121.4938,
    speed: 45,
    voltage: 13.9,
    status: AlarmStatus.PENDING,
    message: '车辆驶入【上海陆家嘴金融核心禁入围栏】管控区域',
    triggeredAt: '2026-10-15T04:10:00Z',
    createdAt: '2026-10-15T04:10:00Z',
    updatedAt: '2026-10-15T04:10:00Z',
  },
  {
    id: 'alm-20261014-007',
    tenantId: 'tenant-001',
    projectId: 'proj-shenzhen-01',
    vehicleId: 'veh-003',
    plateNumber: '粤B·33445',
    vin: 'LSVGA7180N7038192',
    vehicleModel: '小鹏 G9 纪念版',
    deviceNo: 'TBOX-SZ-003',
    alarmType: AlarmType.GEOFENCE_OUT,
    alarmLevel: AlarmLevel.WARNING,
    lat: 22.5612,
    lng: 113.9621,
    speed: 62,
    voltage: 13.7,
    status: AlarmStatus.PROCESSED,
    message: '车辆驶出【深圳高新南区核心禁出围栏】限定运营网格',
    triggeredAt: '2026-10-14T16:30:00Z',
    processedAt: '2026-10-14T16:45:00Z',
    processedBy: '李运维 (ops-li)',
    operatorId: 'user-ops-01',
    remark: '已电话核实车辆外出执行售后上门接电服务，登记任务单后放行。',
    createdAt: '2026-10-14T16:30:00Z',
    updatedAt: '2026-10-14T16:45:00Z',
  },
  {
    id: 'alm-20261014-008',
    tenantId: 'tenant-001',
    projectId: 'proj-shenzhen-02',
    vehicleId: 'veh-004',
    plateNumber: '粤B·55667',
    vin: 'LSVHA8180P8047261',
    vehicleModel: '腾势 D9 旗舰型',
    deviceNo: 'TBOX-SZ-004',
    alarmType: AlarmType.OVERSPEED,
    alarmLevel: AlarmLevel.INFO,
    lat: 22.5358,
    lng: 113.9056,
    speed: 128,
    voltage: 14.1,
    status: AlarmStatus.PROCESSED,
    message: '沿海高速路段瞬时车速 128 km/h，超过限定车速 100 km/h',
    triggeredAt: '2026-10-14T14:15:00Z',
    processedAt: '2026-10-14T14:22:00Z',
    processedBy: '张安全 (sec-zhang)',
    operatorId: 'user-sec-01',
    remark: '通过车载中控下发语音防超速合规提示，车速已回落至 95 km/h。',
    createdAt: '2026-10-14T14:15:00Z',
    updatedAt: '2026-10-14T14:22:00Z',
  },
  {
    id: 'alm-20261014-009',
    tenantId: 'tenant-001',
    projectId: 'proj-beijing-01',
    vehicleId: 'veh-009',
    plateNumber: '京A·66778',
    vin: 'LSVJA9180R9056342',
    vehicleModel: '小米 SU7 Max 霞光紫',
    deviceNo: 'TBOX-BJ-002',
    alarmType: AlarmType.SOS,
    alarmLevel: AlarmLevel.CRITICAL,
    lat: 39.9254,
    lng: 116.4218,
    speed: 0,
    voltage: 13.2,
    status: AlarmStatus.PROCESSED,
    message: '紧急呼叫 SOS 触发',
    triggeredAt: '2026-10-14T11:00:00Z',
    processedAt: '2026-10-14T11:05:00Z',
    processedBy: '王调度 (dispatch-wang)',
    operatorId: 'user-disp-01',
    remark: '车主在车内擦拭方向盘误触 SOS，电话确认人车安全无险情。',
    createdAt: '2026-10-14T11:00:00Z',
    updatedAt: '2026-10-14T11:05:00Z',
  },
  {
    id: 'alm-20261013-010',
    tenantId: 'tenant-001',
    projectId: 'proj-shanghai-02',
    vehicleId: 'veh-010',
    plateNumber: '沪A·77889',
    vin: 'LSVKA0180S0065431',
    vehicleModel: '问界 M9 增程版',
    deviceNo: 'TBOX-SH-003',
    alarmType: AlarmType.LOW_BATTERY,
    alarmLevel: AlarmLevel.WARNING,
    lat: 31.2052,
    lng: 121.5954,
    speed: 0,
    voltage: 10.5,
    status: AlarmStatus.PROCESSED,
    message: '电瓶电压严重偏低 (10.5V)',
    triggeredAt: '2026-10-13T18:20:00Z',
    processedAt: '2026-10-13T19:30:00Z',
    processedBy: '赵技师 (tech-zhao)',
    operatorId: 'user-tech-01',
    remark: '维修专员已携带应急电源搭电完成，并更换受损小电瓶。',
    createdAt: '2026-10-13T18:20:00Z',
    updatedAt: '2026-10-13T19:30:00Z',
  },
  {
    id: 'alm-20261013-011',
    tenantId: 'tenant-001',
    projectId: 'proj-chengdu-01',
    vehicleId: 'veh-011',
    plateNumber: '川A·11223',
    vin: 'LSVLA1180T1074529',
    vehicleModel: '比亚迪 唐 DM-p',
    deviceNo: 'TBOX-CD-002',
    alarmType: AlarmType.VIBRATION,
    alarmLevel: AlarmLevel.WARNING,
    lat: 30.6651,
    lng: 104.0722,
    speed: 0,
    voltage: 12.7,
    status: AlarmStatus.IGNORED,
    message: '车辆检测到外力震动信号',
    triggeredAt: '2026-10-13T10:15:00Z',
    processedAt: '2026-10-13T10:30:00Z',
    processedBy: '陈安全 (sec-chen)',
    operatorId: 'user-sec-02',
    remark: '地下车库排风机震动共振引起的防盗感应器误触发，现场核实无恙，判定忽略。',
    createdAt: '2026-10-13T10:15:00Z',
    updatedAt: '2026-10-13T10:30:00Z',
  },
  {
    id: 'alm-20261012-012',
    tenantId: 'tenant-001',
    projectId: 'proj-shenzhen-01',
    vehicleId: 'veh-012',
    plateNumber: '粤B·88990',
    vin: 'LSVMA2180U2083618',
    vehicleModel: '深蓝 SL03 纯电版',
    deviceNo: 'TBOX-SZ-005',
    alarmType: AlarmType.OVERSPEED,
    alarmLevel: AlarmLevel.INFO,
    lat: 22.5489,
    lng: 113.9421,
    speed: 85,
    voltage: 13.8,
    status: AlarmStatus.IGNORED,
    message: '高架桥匝道超速 (85 km/h 限速 80 km/h)',
    triggeredAt: '2026-10-12T15:40:00Z',
    processedAt: '2026-10-12T16:00:00Z',
    processedBy: '李运维 (ops-li)',
    operatorId: 'user-ops-01',
    remark: '瞬时轻微超速 5 km/h，持续时间小于 3 秒，未达到严重违规阈值，标记忽略。',
    createdAt: '2026-10-12T15:40:00Z',
    updatedAt: '2026-10-12T16:00:00Z',
  },
  {
    id: 'alm-20261012-013',
    tenantId: 'tenant-001',
    projectId: 'proj-shanghai-01',
    vehicleId: 'veh-013',
    plateNumber: '沪A·99001',
    vin: 'LSVNA3180V3092707',
    vehicleModel: '阿维塔 12 GT',
    deviceNo: 'TBOX-SH-004',
    alarmType: AlarmType.POWER_CUT,
    alarmLevel: AlarmLevel.CRITICAL,
    lat: 31.2312,
    lng: 121.5089,
    speed: 0,
    voltage: 0.0,
    status: AlarmStatus.PROCESSED,
    message: '主供电线路剪断告警',
    triggeredAt: '2026-10-12T09:20:00Z',
    processedAt: '2026-10-12T10:10:00Z',
    processedBy: '周主管 (lead-zhou)',
    operatorId: 'user-lead-01',
    remark: '4S店售后检修拆卸主保险丝引起的报警，技师已确认施工进度。',
    createdAt: '2026-10-12T09:20:00Z',
    updatedAt: '2026-10-12T10:10:00Z',
  },
  {
    id: 'alm-20261011-014',
    tenantId: 'tenant-001',
    projectId: 'proj-beijing-01',
    vehicleId: 'veh-014',
    plateNumber: '京A·12345',
    vin: 'LSVPA4180W4001896',
    vehicleModel: '极越 01 性能版',
    deviceNo: 'TBOX-BJ-003',
    alarmType: AlarmType.TOW_AWAY,
    alarmLevel: AlarmLevel.CRITICAL,
    lat: 39.9088,
    lng: 116.3975,
    speed: 15,
    voltage: 12.3,
    status: AlarmStatus.IGNORED,
    message: '异常拖车位移',
    triggeredAt: '2026-10-11T14:00:00Z',
    processedAt: '2026-10-11T14:40:00Z',
    processedBy: '王调度 (dispatch-wang)',
    operatorId: 'user-disp-01',
    remark: '交管部门进行道路施工挪车作业，已与交警现场民警确认车况安全。',
    createdAt: '2026-10-11T14:00:00Z',
    updatedAt: '2026-10-11T14:40:00Z',
  },
];

/**
 * 判断是否为 ApiError 异常实例
 */
export function isApiError(err: unknown): err is ApiError {
  return (
    err instanceof ApiError ||
    (typeof err === 'object' &&
      err !== null &&
      'statusCode' in err &&
      'name' in err &&
      (err as any).name === 'ApiError')
  );
}
