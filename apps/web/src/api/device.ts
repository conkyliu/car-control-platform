import { http } from './client.ts';
import {
  type DeviceDto,
  type DeviceDetailDto,
  type DeviceConfigInput,
  type BoundVehicleDetail,
  type DeviceQueryParams,
  type DeviceStatsDto,
  type CreateDeviceInput,
  type DeviceLifecycleStatus,
  type OnlineStatus,
  isValidStatusTransition,
  isApiError,
  filterDevices,
  validateHeartbeatInterval,
  validateSecurityCode,
  SEED_DEVICES,
} from '../views/device/device-core.ts';
import {
  type ProjectDto,
  type ProjectStatus,
  type CreateProjectInput,
  type UpdateProjectInput,
  validateProjectCode,
  canArchiveProject,
  allocateDevices,
  SEED_PROJECT_DETAILS,
} from '../views/device/project-core.ts';

export type {
  DeviceDto,
  DeviceDetailDto,
  DeviceConfigInput,
  BoundVehicleDetail,
  DeviceQueryParams,
  DeviceStatsDto,
  ProjectDto,
  ProjectStatus,
  CreateDeviceInput,
  CreateProjectInput,
  UpdateProjectInput,
  DeviceLifecycleStatus,
  OnlineStatus,
};

// 本地内存备份状态池（支持离线环境和开发环境平滑降级）
let inMemoryDevices: DeviceDto[] = [...SEED_DEVICES];
let inMemoryProjects: ProjectDto[] = [...SEED_PROJECT_DETAILS];

export function getInMemoryDevices(): DeviceDto[] {
  return inMemoryDevices;
}

export function setInMemoryDevices(devices: DeviceDto[]): void {
  inMemoryDevices = devices;
}

/**
 * 拉取设备资产列表 API
 * 遵循 isApiError 模式：真实服务端异常抛出中断并提示，离线/开发环境平滑降级至种子数据
 */
export async function fetchDevicesApi(params?: DeviceQueryParams): Promise<DeviceDto[]> {
  try {
    const data = await http.get<DeviceDto[]>('/devices', params);
    if (Array.isArray(data)) {
      return data;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 服务未部署或离线时平滑降级至内存数据并应用过滤
  return filterDevices(inMemoryDevices, params);
}

/**
 * 创建单个设备建档 API
 * 遵循 isApiError 模式：服务端异常抛出，离线时本地建档并存入状态池
 */
export async function createDeviceApi(data: CreateDeviceInput): Promise<DeviceDto> {
  try {
    const result = await http.post<DeviceDto>('/devices', data);
    if (result && result.id) {
      return result;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线/开发环境降级建档
  const matchedProject = inMemoryProjects.find((p) => p.id === data.projectId);
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const newDevice: DeviceDto = {
    id: `dev-${Date.now()}`,
    deviceNo: data.deviceNo,
    imei: data.imei,
    iccid: data.iccid,
    productKey: data.productKey,
    productName: data.productKey === 'TBOX-G5-PRO' ? '5G 高性能车载终端 (旗舰版)' : '4G 智慧车载终端 (标准版)',
    projectId: data.projectId,
    projectName: matchedProject?.name ?? '默认车队项目',
    tenantId: 'tenant-001',
    boundVehiclePlate: null,
    boundVin: null,
    onlineStatus: 'OFFLINE',
    signalRsrp: undefined,
    firmwareVersion: 'v2.1.0',
    status: data.status || 'ACTIVE',
    activatedAt: now,
    lastHeartbeatAt: undefined,
    createdAt: now,
    updatedAt: now,
  };

  inMemoryDevices = [newDevice, ...inMemoryDevices];
  return newDevice;
}

/**
 * 更新设备生命周期状态 API (ACTIVE / INACTIVE / DECOMMISSIONED)
 * 遵循 isApiError 模式
 */
export async function updateDeviceStatusApi(
  id: string,
  status: DeviceLifecycleStatus
): Promise<DeviceDto> {
  try {
    const result = await http.patch<DeviceDto>(`/devices/${encodeURIComponent(id)}/status`, { status });
    if (result && result.id) {
      return result;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线/开发环境本地更新
  const index = inMemoryDevices.findIndex((d) => d.id === id);
  if (index !== -1) {
    const existing = inMemoryDevices[index]!;
    if (!isValidStatusTransition(existing.status, status)) {
      throw new Error(`非法状态流转：当前状态 ${existing.status} 不可变更为 ${status}`);
    }
    const updated: DeviceDto = {
      ...existing,
      status,
      updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    };
    inMemoryDevices[index] = updated;
    return updated;
  }

  throw new Error(`Device not found with id: ${id}`);
}

/**
 * 获取项目列表 API（用于下拉选择项目）
 */
export async function fetchProjectsApi(): Promise<ProjectDto[]> {
  try {
    const data = await http.get<ProjectDto[]>('/projects');
    if (Array.isArray(data)) {
      return data;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  return [...inMemoryProjects];
}

/**
 * 创建新项目 API
 */
export async function createProjectApi(data: CreateProjectInput): Promise<ProjectDto> {
  if (!validateProjectCode(data.code)) {
    throw new Error('项目代号不符合规范，请输入 3~20 位大写英文字母、数字或下划线');
  }

  try {
    const result = await http.post<ProjectDto>('/projects', data);
    if (result && result.id) {
      return result;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const newProject: ProjectDto = {
    id: `proj-${Date.now()}`,
    name: data.name.trim(),
    code: data.code.trim().toUpperCase(),
    orgName: data.orgName?.trim() || '默认运营机构',
    contactName: data.contactName?.trim(),
    contactPhone: data.contactPhone?.trim(),
    description: data.description?.trim(),
    status: data.status || 'ACTIVE',
    deviceCount: 0,
    vehicleCount: 0,
    onlineDeviceCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  inMemoryProjects = [newProject, ...inMemoryProjects];
  return newProject;
}

/**
 * 更新项目基础信息 API
 */
export async function updateProjectApi(
  id: string,
  data: UpdateProjectInput
): Promise<ProjectDto> {
  if (data.code && !validateProjectCode(data.code)) {
    throw new Error('项目代号不符合规范，请输入 3~20 位大写英文字母、数字或下划线');
  }

  try {
    const result = await http.patch<ProjectDto>(`/projects/${encodeURIComponent(id)}`, data);
    if (result && result.id) {
      return result;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  const index = inMemoryProjects.findIndex((p) => p.id === id);
  if (index === -1) {
    throw new Error(`项目 ID "${id}" 未找到`);
  }

  const target = inMemoryProjects[index]!;
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const updated: ProjectDto = {
    ...target,
    ...(data.name ? { name: data.name.trim() } : {}),
    ...(data.code ? { code: data.code.trim().toUpperCase() } : {}),
    ...(data.orgName !== undefined ? { orgName: data.orgName.trim() } : {}),
    ...(data.contactName !== undefined ? { contactName: data.contactName.trim() } : {}),
    ...(data.contactPhone !== undefined ? { contactPhone: data.contactPhone.trim() } : {}),
    ...(data.description !== undefined ? { description: data.description.trim() } : {}),
    ...(data.status ? { status: data.status } : {}),
    updatedAt: now,
  };

  inMemoryProjects[index] = updated;
  return updated;
}

/**
 * 切换项目生命周期状态 API (ACTIVE / PAUSED / ARCHIVED)
 * ARCHIVED 受到 canArchiveProject 安全守卫保护
 */
export async function updateProjectStatusApi(
  id: string,
  status: ProjectStatus
): Promise<ProjectDto> {
  try {
    const result = await http.patch<ProjectDto>(
      `/projects/${encodeURIComponent(id)}/status`,
      { status }
    );
    if (result && result.id) {
      return result;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  const index = inMemoryProjects.findIndex((p) => p.id === id);
  if (index === -1) {
    throw new Error(`项目 ID "${id}" 未找到`);
  }

  const target = inMemoryProjects[index]!;

  if (status === 'ARCHIVED') {
    const onlineCount = inMemoryDevices.filter(
      (d) => d.projectId === id && d.onlineStatus === 'ONLINE'
    ).length;
    const boundVehicles = inMemoryDevices.filter(
      (d) => d.projectId === id && Boolean(d.boundVin || d.boundVehiclePlate)
    ).length;
    const guard = canArchiveProject(
      target,
      onlineCount || target.onlineDeviceCount || 0,
      boundVehicles || target.vehicleCount || 0
    );
    if (!guard.allowed) {
      throw new Error(guard.reason || '项目存在在线设备或绑定车辆，禁止直接归档');
    }
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const updated: ProjectDto = {
    ...target,
    status,
    updatedAt: now,
  };

  inMemoryProjects[index] = updated;
  return updated;
}

/**
 * 批量调配设备至指定项目 API
 */
export async function allocateDevicesToProjectApi(
  projectId: string,
  deviceIds: string[]
): Promise<boolean> {
  try {
    const result = await http.post<{ success: boolean }>(
      `/projects/${encodeURIComponent(projectId)}/allocate-devices`,
      { deviceIds }
    );
    if (result && typeof result.success === 'boolean') {
      return result.success;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  const project = inMemoryProjects.find((p) => p.id === projectId);
  if (!project) {
    throw new Error(`项目 ID "${projectId}" 未找到`);
  }

  inMemoryDevices = allocateDevices(inMemoryDevices, projectId, project.name, deviceIds);

  // 同步刷新各项目的 deviceCount 与 onlineDeviceCount 统计
  for (const p of inMemoryProjects) {
    const pDevices = inMemoryDevices.filter((d) => d.projectId === p.id);
    p.deviceCount = pDevices.length;
    p.onlineDeviceCount = pDevices.filter((d) => d.onlineStatus === 'ONLINE').length;
  }

  return true;
}

export interface BatchImportErrorItem {
  rowNumber?: number;
  deviceNo?: string;
  imei?: string;
  reason: string;
}

export interface BatchImportResultDto {
  total: number;
  successCount: number;
  errors: BatchImportErrorItem[];
}

/**
 * 批量设备导入 API
 * 遵循 isApiError 模式：真实服务端异常抛出，离线/开发环境在内存池中安全批量写入并返回结果
 */
export async function batchImportDevicesApi(
  devices: CreateDeviceInput[]
): Promise<BatchImportResultDto> {
  try {
    const result = await http.post<any>('/devices/batch-import', { devices });
    if (result && typeof result.total === 'number') {
      const normalizedErrors: BatchImportErrorItem[] = Array.isArray(result.errors)
        ? result.errors.map((e: any) => {
            if (typeof e === 'string') {
              const colonIndex = e.indexOf(': ');
              if (colonIndex !== -1) {
                return {
                  deviceNo: e.slice(0, colonIndex).trim(),
                  reason: e.slice(colonIndex + 2).trim(),
                };
              }
              return { reason: e };
            }
            return {
              rowNumber: e.rowNumber,
              deviceNo: e.deviceNo,
              imei: e.imei,
              reason: e.reason || String(e),
            };
          })
        : [];

      return {
        total: result.total,
        successCount: result.successCount ?? 0,
        errors: normalizedErrors,
      };
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线/开发环境平滑降级写入
  const errors: BatchImportErrorItem[] = [];
  let successCount = 0;
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  for (let i = 0; i < devices.length; i++) {
    const item = devices[i]!;
    // 内存池查重拦截
    const existing = inMemoryDevices.find(
      (d) => d.deviceNo === item.deviceNo || d.imei === item.imei
    );
    if (existing) {
      errors.push({
        rowNumber: i + 1,
        deviceNo: item.deviceNo,
        imei: item.imei,
        reason:
          existing.deviceNo === item.deviceNo
            ? `设备编号 ${item.deviceNo} 在系统中已存在`
            : `IMEI ${item.imei} 在系统中已存在`,
      });
      continue;
    }

    const matchedProject = inMemoryProjects.find((p) => p.id === item.projectId);
    const newDevice: DeviceDto = {
      id: `dev-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      deviceNo: item.deviceNo,
      imei: item.imei,
      iccid: item.iccid,
      productKey: item.productKey,
      productName:
        item.productKey === 'TBOX-G5-PRO'
          ? '5G 高性能车载终端 (旗舰版)'
          : item.productKey === 'OBD-II-PLUS'
          ? 'OBD-II 即插即用诊断仪'
          : item.productKey === 'TCU-EV-100'
          ? '新能源双路CAN控制器'
          : '4G 智慧车载终端 (标准版)',
      projectId: item.projectId,
      projectName: matchedProject?.name ?? '默认车队项目',
      tenantId: 'tenant-001',
      boundVehiclePlate: null,
      boundVin: null,
      onlineStatus: 'OFFLINE',
      signalRsrp: undefined,
      firmwareVersion: 'v2.1.0',
      status: item.status || 'ACTIVE',
      activatedAt: now,
      lastHeartbeatAt: undefined,
      createdAt: now,
      updatedAt: now,
    };

    inMemoryDevices = [newDevice, ...inMemoryDevices];
    successCount++;
  }

  return {
    total: devices.length,
    successCount,
    errors,
  };
}

/**
 * 构造设备详情与工况指标对象（用于开发和离线环境降级补全）
 */
function buildDeviceDetail(device: DeviceDto): DeviceDetailDto {
  const signalRsrp = device.signalRsrp;
  const csq =
    device.csq ??
    (signalRsrp !== undefined ? Math.max(5, Math.min(31, Math.round((signalRsrp + 140) / 2.5))) : 18);

  const boundVehicle: BoundVehicleDetail | null =
    device.boundVehicle !== undefined
      ? device.boundVehicle
      : device.boundVehiclePlate
      ? {
          plate: device.boundVehiclePlate,
          vin: device.boundVin || 'LFPH2E023N10001',
          model:
            device.productKey === 'TCU-EV-100'
              ? '比亚迪·汉 EV 2025款'
              : device.productKey === 'TBOX-G5-PRO'
              ? '蔚来·ES8 2025款'
              : '吉利·几何 A Pro',
          ownerName: '张**',
          ownerPhone: '138****8888',
        }
      : null;

  const config: DeviceConfigInput = device.config || {
    heartbeatInterval: 30,
    apn: 'CMNET',
    locationReportEnabled: true,
    locationReportInterval: 30,
    blePkeEnabled: true,
    blePkeSensitivity: 3,
  };

  return {
    ...device,
    orgName: device.orgName || '华南智慧车联网运营部',
    csq,
    gpsCoordinates:
      device.gpsCoordinates ||
      (device.boundVehiclePlate ? '22.543099, 114.057868' : '22.531201, 113.931456'),
    gpsStatus:
      device.gpsStatus ||
      (device.onlineStatus === 'ONLINE'
        ? 'GPS已锁定'
        : device.onlineStatus === 'OFFLINE'
        ? '未定位'
        : '基站定位'),
    satelliteCount:
      device.satelliteCount ??
      (device.onlineStatus === 'ONLINE' ? 14 : device.onlineStatus === 'ALARMING' ? 6 : 0),
    lastHeartbeatLatency:
      device.lastHeartbeatLatency ?? (device.onlineStatus === 'ONLINE' ? 2 : 120),
    boundVehicle,
    config,
  };
}

/**
 * 获取单台设备详情与工况数据 API
 * 遵循 isApiError 模式：真实服务端异常抛出，离线/开发环境在内存池中查找并补全
 */
export async function fetchDeviceDetailApi(id: string): Promise<DeviceDetailDto> {
  try {
    const data = await http.get<DeviceDetailDto>(`/devices/${encodeURIComponent(id)}`);
    if (data && data.id) {
      return data;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线/开发环境降级
  const device = inMemoryDevices.find((d) => d.id === id);
  if (!device) {
    throw new Error(`Device not found with id: ${id}`);
  }

  return buildDeviceDetail(device);
}

/**
 * 远程参数配置下发 API
 * 遵循 isApiError 模式：校验心跳参数区间，真实服务端下发或离线内存池更新
 */
export async function updateDeviceConfigApi(
  id: string,
  config: DeviceConfigInput
): Promise<DeviceDetailDto> {
  if (!validateHeartbeatInterval(config.heartbeatInterval)) {
    throw new Error(`心跳上报周期超出范围 (10~3600秒): ${config.heartbeatInterval}`);
  }

  try {
    const result = await http.patch<DeviceDetailDto>(
      `/devices/${encodeURIComponent(id)}/config`,
      config
    );
    if (result && result.id) {
      return result;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线/开发环境本地更新状态池
  const index = inMemoryDevices.findIndex((d) => d.id === id);
  if (index === -1) {
    throw new Error(`Device not found with id: ${id}`);
  }

  const existing = inMemoryDevices[index]!;
  const updatedDevice: DeviceDto = {
    ...existing,
    config: { ...config },
    updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
  };
  inMemoryDevices[index] = updatedDevice;

  return buildDeviceDetail(updatedDevice);
}

/**
 * 远程设备重启 API (高危操作，严格验证安全确认码 'REBOOT')
 * 遵循 isApiError 模式
 */
export async function rebootDeviceApi(
  id: string,
  securityCode: string
): Promise<{ success: boolean; message: string }> {
  if (!validateSecurityCode(securityCode)) {
    throw new Error('安全确认码错误，请输入严格匹配的 "REBOOT"');
  }

  try {
    const result = await http.post<{ success: boolean; message: string }>(
      `/devices/${encodeURIComponent(id)}/reboot`,
      { securityCode }
    );
    if (result && typeof result.success === 'boolean') {
      return result;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线/开发环境降级
  const device = inMemoryDevices.find((d) => d.id === id);
  if (!device) {
    throw new Error(`Device not found with id: ${id}`);
  }

  return {
    success: true,
    message: `设备 ${device.deviceNo} 远程重启指令已下发，预计 30~60 秒内重启完成`,
  };
}
