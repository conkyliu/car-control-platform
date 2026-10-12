import type { DeviceDto } from './device-core.ts';

/**
 * 项目代号格式正则表达式 (3~20 位大写字母、数字或下划线)
 */
export const PROJECT_CODE_REGEX = /^[A-Z0-9_]{3,20}$/;

/**
 * 校验项目英文唯一代码格式
 */
export function validateProjectCode(code?: string | null): boolean {
  if (!code || typeof code !== 'string') return false;
  return PROJECT_CODE_REGEX.test(code.trim());
}

/**
 * 项目生命周期状态定义
 * ACTIVE 运营中 / PAUSED 暂停 / ARCHIVED 已归档
 */
export type ProjectStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

export interface ProjectStatusMeta {
  label: string;
  color: string;
  tagColor: string;
  description: string;
}

export const PROJECT_STATUS_MAP: Record<ProjectStatus, ProjectStatusMeta> = {
  ACTIVE: {
    label: '运营中',
    color: '#52c41a',
    tagColor: 'success',
    description: '项目正常承载车辆运营与设备数据汇聚',
  },
  PAUSED: {
    label: '已暂停',
    color: '#faad14',
    tagColor: 'warning',
    description: '项目暂停新增接入，存量设备保持基础通讯',
  },
  ARCHIVED: {
    label: '已归档',
    color: '#8c8c8c',
    tagColor: 'default',
    description: '项目已结项封存，只读归档',
  },
};

export interface ProjectDto {
  id: string;
  name: string;
  code: string;
  orgId?: string;
  orgName?: string;
  contactName?: string;
  contactPhone?: string;
  status?: ProjectStatus;
  deviceCount?: number;
  vehicleCount?: number;
  onlineDeviceCount?: number;
  tenantId?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateProjectInput {
  name: string;
  code: string;
  orgName?: string;
  contactName?: string;
  contactPhone?: string;
  description?: string;
  status?: ProjectStatus;
}

export interface UpdateProjectInput {
  name?: string;
  code?: string;
  orgName?: string;
  contactName?: string;
  contactPhone?: string;
  description?: string;
  status?: ProjectStatus;
}

/**
 * 项目归档安全保护守卫纯函数
 * 若项目下仍存在在线运行设备或挂载车辆，严禁直接归档
 */
export function canArchiveProject(
  project: ProjectDto,
  onlineDeviceCount = 0,
  boundVehicleCount = 0
): { allowed: boolean; reason?: string; message?: string } {
  if (onlineDeviceCount > 0) {
    const msg = `该项目【${project.name}】下存在 ${onlineDeviceCount} 台在线设备，禁止直接归档`;
    return {
      allowed: false,
      reason: msg,
      message: msg,
    };
  }

  if (boundVehicleCount > 0) {
    const msg = `该项目【${project.name}】下仍有关联 ${boundVehicleCount} 辆车辆，禁止直接归档`;
    return {
      allowed: false,
      reason: msg,
      message: msg,
    };
  }

  return { allowed: true };
}

/**
 * 设备跨项目调配纯函数 (不可变数据更新)
 * 将指定 deviceIds 的设备重新分配到目标项目，并更新时间戳
 */
export function allocateDevices(
  devices: DeviceDto[],
  projectId: string,
  projectName: string,
  deviceIds: string[]
): DeviceDto[] {
  const targetSet = new Set(deviceIds);
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  return devices.map((d) => {
    if (targetSet.has(d.id)) {
      return {
        ...d,
        projectId,
        projectName,
        updatedAt: now,
      };
    }
    return d;
  });
}

// ---------------- 种子基础数据 ----------------

export const SEED_PROJECT_DETAILS: ProjectDto[] = [
  {
    id: 'proj-sz-01',
    name: '深圳极速智慧车队',
    code: 'SZ_SPEED_01',
    orgName: '华南智慧车联网运营部',
    contactName: '陈伟强',
    contactPhone: '13812345678',
    status: 'ACTIVE',
    deviceCount: 6,
    vehicleCount: 5,
    onlineDeviceCount: 5,
    description: '面向大湾区特区的高频车联网车队运营',
    createdAt: '2026-01-01 10:00:00',
    updatedAt: '2026-01-01 10:00:00',
  },
  {
    id: 'proj-gz-02',
    name: '广州网约出行运营二期',
    code: 'GZ_RIDE_02',
    orgName: '华南网约车运营部',
    contactName: '李广成',
    contactPhone: '13922334455',
    status: 'ACTIVE',
    deviceCount: 2,
    vehicleCount: 2,
    onlineDeviceCount: 1,
    description: '穗港客运网约出租合规车辆运营项目',
    createdAt: '2026-02-01 10:00:00',
    updatedAt: '2026-02-01 10:00:00',
  },
  {
    id: 'proj-sh-03',
    name: '上海城际新能源干线',
    code: 'SH_LOGIS_03',
    orgName: '华东城际物流事业部',
    contactName: '黄晓明',
    contactPhone: '13700112233',
    status: 'PAUSED',
    deviceCount: 2,
    vehicleCount: 2,
    onlineDeviceCount: 1,
    description: '长三角跨省集卡与重卡调度专线',
    createdAt: '2026-03-01 10:00:00',
    updatedAt: '2026-03-01 10:00:00',
  },
  {
    id: 'proj-bj-04',
    name: '北方冷链特种运输项目',
    code: 'BJ_COLD_04',
    orgName: '华北冷链调度中心',
    contactName: '赵铁生',
    contactPhone: '13699887766',
    status: 'ACTIVE',
    deviceCount: 2,
    vehicleCount: 3,
    onlineDeviceCount: 1,
    description: '药品与生鲜特种高频温湿度监测专车',
    createdAt: '2026-03-15 10:00:00',
    updatedAt: '2026-03-15 10:00:00',
  },
  {
    id: 'proj-cd-05',
    name: '成都智慧景区摆渡专线 (已结项)',
    code: 'CD_PARK_05',
    orgName: '西南智慧旅游事业部',
    contactName: '张建军',
    contactPhone: '13566778899',
    status: 'ARCHIVED',
    deviceCount: 0,
    vehicleCount: 0,
    onlineDeviceCount: 0,
    description: '川西文旅季节性摆渡运营，已平稳完成结项',
    createdAt: '2025-06-01 10:00:00',
    updatedAt: '2025-12-31 18:00:00',
  },
];
