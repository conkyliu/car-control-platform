import type { VehicleDto } from './vehicle-core.ts';
import type { DeviceDto } from '../device/device-core.ts';

export interface BindingValidationResult {
  valid: boolean;
  error?: string;
  warning?: string;
}

export type UnbindReason =
  | 'MAINTENANCE'
  | 'HARDWARE_UPGRADE'
  | 'VEHICLE_SCRAPPED'
  | 'OWNERSHIP_TRANSFER'
  | 'OTHER';

export interface UnbindReasonMeta {
  value: UnbindReason;
  label: string;
  description: string;
}

export const UNBIND_REASONS: Record<UnbindReason, { label: string; description: string }> = {
  MAINTENANCE: {
    label: '模组故障拆卸维修',
    description: '车载终端或传感器出现硬件故障，需要拆卸送修或更换零部件',
  },
  HARDWARE_UPGRADE: {
    label: '终端硬件换代升级',
    description: '为车辆升级更高规格车载终端（如从 4G 标准版升级为 5G 旗舰版）',
  },
  VEHICLE_SCRAPPED: {
    label: '车辆到期报废注销',
    description: '整车达到报废年限或残值清算注销，终端设备回库流转',
  },
  OWNERSHIP_TRANSFER: {
    label: '车主变更/过户转让',
    description: '车辆所有权过户或转让给其他组织/车主，需解绑原硬件重置',
  },
  OTHER: {
    label: '其他业务调整',
    description: '车队运营调配、临时解绑测试或其他特定业务场景',
  },
};

export const UNBIND_REASON_OPTIONS: UnbindReasonMeta[] = [
  { value: 'MAINTENANCE', ...UNBIND_REASONS.MAINTENANCE },
  { value: 'HARDWARE_UPGRADE', ...UNBIND_REASONS.HARDWARE_UPGRADE },
  { value: 'VEHICLE_SCRAPPED', ...UNBIND_REASONS.VEHICLE_SCRAPPED },
  { value: 'OWNERSHIP_TRANSFER', ...UNBIND_REASONS.OWNERSHIP_TRANSFER },
  { value: 'OTHER', ...UNBIND_REASONS.OTHER },
];

/**
 * 校验解绑原因是否合法
 */
export function validateUnbindReason(reason?: string | null): boolean {
  if (!reason || typeof reason !== 'string') return false;
  return Object.prototype.hasOwnProperty.call(UNBIND_REASONS, reason);
}

/**
 * 校验软硬件绑定配对前置规则
 * 1. 跨租户严格防御 (vehicle.tenantId === device.tenantId)
 * 2. 车辆状态终态拦截 (vehicle.status !== 'SCRAPPED')
 * 3. 设备状态终态拦截 (device.status !== 'DECOMMISSIONED')
 * 4. 设备占用冲突排他校验 (device 已绑定其他车辆时阻断)
 * 5. 项目归属一致性预警 (vehicle.projectId !== device.projectId 时温和提示)
 */
export function validateBindingPair(
  vehicle: VehicleDto,
  device: DeviceDto
): BindingValidationResult {
  if (!vehicle || !device) {
    return { valid: false, error: '车辆或设备数据不完整，无法进行配对校验' };
  }

  // 1. 租户隔离校验
  if (vehicle.tenantId && device.tenantId && vehicle.tenantId !== device.tenantId) {
    return {
      valid: false,
      error: `跨租户拦截：车辆所属租户【${vehicle.tenantId}】与设备所属租户【${device.tenantId}】不一致，系统严禁跨企业租户绑定设备！`,
    };
  }

  // 2. 车辆生命周期状态校验
  if (vehicle.status === 'SCRAPPED') {
    return {
      valid: false,
      error: '车辆状态异常：已报废车辆为物理终态档案，严禁继续绑定或更换硬件设备。',
    };
  }

  // 3. 设备生命周期状态校验
  if (device.status === 'DECOMMISSIONED') {
    return {
      valid: false,
      error: '设备状态异常：已报废设备（DECOMMISSIONED）不可继续配对绑定车辆。',
    };
  }

  // 4. 设备占用状态冲突校验
  const occupiedPlate = device.boundVehiclePlate || device.boundVehicle?.plate;
  const occupiedVin = device.boundVin || device.boundVehicle?.vin;

  const isOccupiedByOther =
    (occupiedPlate && occupiedPlate !== vehicle.plateNumber) ||
    (occupiedVin && occupiedVin !== vehicle.vin);

  if (isOccupiedByOther) {
    return {
      valid: false,
      error: `设备占用冲突：目标设备【${device.deviceNo}】当前已绑定至车辆 ${occupiedPlate || '未知车牌'} (VIN: ${occupiedVin || '未知VIN'})，请先前往原车辆解除绑定关系！`,
    };
  }

  // 5. 项目一致性友好提示
  let warning: string | undefined;
  if (vehicle.projectId && device.projectId && vehicle.projectId !== device.projectId) {
    const vProj = vehicle.projectName || vehicle.projectId;
    const dProj = device.projectName || device.projectId;
    warning = `项目归属提示：车辆当前归属于【${vProj}】，而该设备归属于【${dProj}】。确认绑定后，该设备将跨项目运行服务。`;
  }

  return {
    valid: true,
    warning,
  };
}

export interface ApplyBindingChangeResult {
  vehicles: VehicleDto[];
  devices: DeviceDto[];
  targetVehicle?: VehicleDto;
  targetDevice?: DeviceDto;
  previousDevice?: DeviceDto;
}

/**
 * 原子更新内存池中的车辆与设备双向配对状态 (不可变更新)
 */
export function applyBindingChange(
  vehicles: VehicleDto[],
  devices: DeviceDto[],
  vehicleId: string,
  newDeviceId?: string | null,
  _reason?: string
): ApplyBindingChangeResult {
  const vehicleIndex = vehicles.findIndex((v) => v.id === vehicleId);
  if (vehicleIndex === -1) {
    throw new Error(`车辆 ID "${vehicleId}" 未找到`);
  }

  const currentVehicle = vehicles[vehicleIndex]!;
  const currentDeviceId = currentVehicle.deviceId;
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  let updatedVehicles = [...vehicles];
  let updatedDevices = [...devices];
  let targetVehicle: VehicleDto;
  let targetDevice: DeviceDto | undefined;
  let previousDevice: DeviceDto | undefined;

  // 场景 1: 解绑模式 (!newDeviceId)
  if (!newDeviceId) {
    targetVehicle = {
      ...currentVehicle,
      deviceId: null,
      deviceNo: null,
      deviceOnlineStatus: undefined,
      updatedAt: now,
    };
    updatedVehicles[vehicleIndex] = targetVehicle;

    if (currentDeviceId) {
      const devIndex = updatedDevices.findIndex((d) => d.id === currentDeviceId);
      if (devIndex !== -1) {
        previousDevice = {
          ...updatedDevices[devIndex]!,
          boundVehiclePlate: null,
          boundVin: null,
          boundVehicle: null,
          updatedAt: now,
        };
        updatedDevices[devIndex] = previousDevice;
      }
    }

    return {
      vehicles: updatedVehicles,
      devices: updatedDevices,
      targetVehicle,
      previousDevice,
    };
  }

  // 场景 2: 绑定或换绑模式 (newDeviceId 存在)
  const newDevIndex = updatedDevices.findIndex((d) => d.id === newDeviceId);
  if (newDevIndex === -1) {
    throw new Error(`设备 ID "${newDeviceId}" 未找到`);
  }

  const rawNewDevice = updatedDevices[newDevIndex]!;

  // 如果原本已绑定了其他设备，先解绑原设备
  if (currentDeviceId && currentDeviceId !== newDeviceId) {
    const oldDevIndex = updatedDevices.findIndex((d) => d.id === currentDeviceId);
    if (oldDevIndex !== -1) {
      previousDevice = {
        ...updatedDevices[oldDevIndex]!,
        boundVehiclePlate: null,
        boundVin: null,
        boundVehicle: null,
        updatedAt: now,
      };
      updatedDevices[oldDevIndex] = previousDevice;
    }
  }

  // 如果新设备此前曾被其他车辆占用，清空该车辆关联
  updatedVehicles = updatedVehicles.map((v) => {
    if (v.id !== vehicleId && v.deviceId === newDeviceId) {
      return {
        ...v,
        deviceId: null,
        deviceNo: null,
        deviceOnlineStatus: undefined,
        updatedAt: now,
      };
    }
    return v;
  });

  // 更新新设备信息
  targetDevice = {
    ...rawNewDevice,
    boundVehiclePlate: currentVehicle.plateNumber,
    boundVin: currentVehicle.vin,
    boundVehicle: {
      plate: currentVehicle.plateNumber,
      vin: currentVehicle.vin,
      model: currentVehicle.modelName || '',
      ownerName: currentVehicle.ownerName || '',
      ownerPhone: currentVehicle.ownerPhone || '',
    },
    updatedAt: now,
  };
  updatedDevices[newDevIndex] = targetDevice;

  // 更新目标车辆信息
  targetVehicle = {
    ...currentVehicle,
    deviceId: targetDevice.id,
    deviceNo: targetDevice.deviceNo,
    deviceOnlineStatus: targetDevice.onlineStatus,
    updatedAt: now,
  };
  const targetVehIndex = updatedVehicles.findIndex((v) => v.id === vehicleId);
  updatedVehicles[targetVehIndex] = targetVehicle;

  return {
    vehicles: updatedVehicles,
    devices: updatedDevices,
    targetVehicle,
    targetDevice,
    previousDevice,
  };
}
