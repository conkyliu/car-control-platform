import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Device, DeviceOnlineStatus } from '@car-control/domain-types';
import {
  CreateDeviceDto,
  BatchImportDevicesDto,
  DeviceFilterDto,
  DeviceHierarchyDto,
} from '@car-control/contracts';
import { DeviceRepository, VehicleRepository, TenantContext } from '@car-control/database';
import { TenantService } from '../tenant/tenant.service.js';
import { ProjectService } from '../project/project.service.js';
import { DeviceStatusService } from './device-status.service.js';
import { AuditService } from '../audit/audit.service.js';

@Injectable()
export class DeviceService {
  constructor(
    private readonly deviceRepo: DeviceRepository,
    private readonly vehicleRepo: VehicleRepository,
    private readonly tenantService: TenantService,
    private readonly projectService: ProjectService,
    private readonly deviceStatusService: DeviceStatusService,
    private readonly auditService: AuditService
  ) {}

  /**
   * 单台设备建档
   */
  async createDevice(dto: CreateDeviceDto): Promise<Device> {
    const tenantId = TenantContext.getTenantId();
    const session = TenantContext.getRequired();

    // 1. 唯一性校验
    const existingByNo = await this.deviceRepo.findByDeviceNo(dto.deviceNo);
    if (existingByNo) {
      throw new ConflictException(`Device with deviceNo ${dto.deviceNo} already exists`);
    }

    const existingByImei = await this.deviceRepo.findByImei(dto.imei);
    if (existingByImei) {
      throw new ConflictException(`Device with imei ${dto.imei} already exists`);
    }

    // 2. 租户配额硬约束拦截
    const allDevices = await this.deviceRepo.findMany();
    this.tenantService.assertQuotaAvailable(tenantId, allDevices.length);

    // 3. 项目存在性校验 (若有)
    if (dto.projectId) {
      this.projectService.getProject(dto.projectId);
    }

    // 4. 数据写入
    const device = await this.deviceRepo.create({
      id: `dev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      projectId: dto.projectId,
      deviceNo: dto.deviceNo,
      imei: dto.imei,
      productKey: dto.productKey,
      status: 'ACTIVE',
      onlineStatus: DeviceOnlineStatus.OFFLINE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 5. 注册到在线状态管理器
    this.deviceStatusService.registerDevice({
      deviceNo: device.deviceNo,
      productKey: device.productKey,
      vehicleId: '',
      onlineStatus: DeviceOnlineStatus.OFFLINE,
    });

    // 6. 审计日志
    this.auditService.logAction({
      tenantId,
      userId: session.userId,
      action: 'DEVICE_CREATE',
      resourceType: 'DEVICE',
      resourceId: device.id,
      details: { deviceNo: device.deviceNo, imei: device.imei },
    });

    return device;
  }

  /**
   * 批量导入设备
   */
  async batchImportDevices(dto: BatchImportDevicesDto): Promise<{ total: number; successCount: number; errors: string[] }> {
    const tenantId = TenantContext.getTenantId();

    // 1. 批次内部去重校验
    const deviceNoSet = new Set<string>();
    const imeiSet = new Set<string>();
    for (const d of dto.devices) {
      if (deviceNoSet.has(d.deviceNo)) {
        throw new BadRequestException(`Duplicate deviceNo in batch: ${d.deviceNo}`);
      }
      deviceNoSet.add(d.deviceNo);

      if (imeiSet.has(d.imei)) {
        throw new BadRequestException(`Duplicate imei in batch: ${d.imei}`);
      }
      imeiSet.add(d.imei);
    }

    // 2. 租户配额预检
    const currentDevices = await this.deviceRepo.findMany();
    this.tenantService.assertQuotaAvailable(tenantId, currentDevices.length + dto.devices.length - 1);

    const errors: string[] = [];
    let successCount = 0;

    for (const item of dto.devices) {
      try {
        await this.createDevice(item);
        successCount++;
      } catch (err: any) {
        errors.push(`${item.deviceNo}: ${err.message}`);
      }
    }

    return {
      total: dto.devices.length,
      successCount,
      errors,
    };
  }

  /**
   * 多维组合条件筛选设备
   */
  async queryDevices(filter?: DeviceFilterDto): Promise<Device[]> {
    return this.deviceRepo.findMany((device) => {
      if (filter?.status && device.status !== filter.status) return false;
      if (filter?.onlineStatus && device.onlineStatus !== filter.onlineStatus) return false;
      if (filter?.keyword) {
        const kw = filter.keyword.toLowerCase();
        const matchNo = device.deviceNo.toLowerCase().includes(kw);
        const matchImei = device.imei.toLowerCase().includes(kw);
        if (!matchNo && !matchImei) return false;
      }
      return true;
    });
  }

  /**
   * 核心能力：四级反查链路
   * Device -> Vehicle -> Project -> Tenant
   */
  async resolveHierarchy(deviceNo: string): Promise<DeviceHierarchyDto> {
    const tenantId = TenantContext.getTenantId();
    const device = await this.deviceRepo.findByDeviceNo(deviceNo);
    if (!device) {
      throw new NotFoundException(`Device with deviceNo ${deviceNo} not found in current tenant`);
    }

    const tenant = this.tenantService.getTenant(tenantId);
    const vehicle = await this.vehicleRepo.findByDeviceId(device.id);

    let projectInfo: { id: string; name: string } | undefined;
    const targetProjectId = vehicle?.projectId || device.projectId;
    if (targetProjectId) {
      try {
        const p = this.projectService.getProject(targetProjectId);
        projectInfo = { id: p.id, name: p.name };
      } catch {
        // 无项目或已迁移
      }
    }

    return {
      deviceNo: device.deviceNo,
      imei: device.imei,
      productKey: device.productKey,
      status: device.status,
      onlineStatus: device.onlineStatus,
      vehicle: vehicle
        ? {
            id: vehicle.id,
            vin: vehicle.vin,
            plateNumber: vehicle.plateNumber,
          }
        : undefined,
      project: projectInfo,
      tenant: {
        id: tenant.id,
        name: tenant.name,
      },
    };
  }

  /**
   * 激活 / 停用设备
   */
  async updateStatus(deviceId: string, status: 'ACTIVE' | 'INACTIVE' | 'DECOMMISSIONED'): Promise<boolean> {
    const session = TenantContext.getRequired();
    const success = await this.deviceRepo.updateStatus(deviceId, status);
    if (!success) {
      throw new NotFoundException(`Device with id ${deviceId} not found`);
    }

    this.auditService.logAction({
      tenantId: session.tenantId,
      userId: session.userId,
      action: 'DEVICE_UPDATE_STATUS',
      resourceType: 'DEVICE',
      resourceId: deviceId,
      details: { newStatus: status },
    });

    return true;
  }
}
