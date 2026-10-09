import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Vehicle } from '@car-control/domain-types';
import {
  CreateVehicleDto,
  VehicleFilterDto,
  VehicleDetailDto,
} from '@car-control/contracts';
import { VehicleRepository, DeviceRepository, TenantContext } from '@car-control/database';
import { ProjectService } from '../project/project.service.js';
import { DeviceStatusService } from '../device/device-status.service.js';
import { AuditService } from '../audit/audit.service.js';

@Injectable()
export class VehicleService {
  constructor(
    private readonly vehicleRepo: VehicleRepository,
    private readonly deviceRepo: DeviceRepository,
    private readonly projectService: ProjectService,
    private readonly deviceStatusService: DeviceStatusService,
    private readonly auditService: AuditService
  ) {}

  /**
   * 录入车辆
   */
  async createVehicle(dto: CreateVehicleDto): Promise<Vehicle> {
    const tenantId = TenantContext.getTenantId();
    const session = TenantContext.getRequired();

    // 1. VIN 唯一性校验
    const existing = await this.vehicleRepo.findByVin(dto.vin);
    if (existing) {
      throw new ConflictException(`Vehicle with VIN ${dto.vin} already exists`);
    }

    // 2. 所属项目校验
    this.projectService.getProject(dto.projectId);

    // 3. 若入参指定绑定设备，执行绑定前置检查
    if (dto.deviceId) {
      const dev = await this.deviceRepo.findById(dto.deviceId);
      if (!dev) {
        throw new NotFoundException(`Device with id ${dto.deviceId} not found`);
      }
      const occupied = await this.vehicleRepo.findByDeviceId(dto.deviceId);
      if (occupied) {
        throw new BadRequestException(`Device ${dev.deviceNo} is already bound to vehicle ${occupied.vin}`);
      }
    }

    const vehicle = await this.vehicleRepo.create({
      id: `veh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      projectId: dto.projectId,
      vin: dto.vin,
      plateNumber: dto.plateNumber,
      brandId: dto.brandId,
      modelId: dto.modelId,
      deviceId: dto.deviceId,
      status: 'NORMAL',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    this.auditService.logAction({
      tenantId,
      userId: session.userId,
      action: 'VEHICLE_CREATE',
      resourceType: 'VEHICLE',
      resourceId: vehicle.id,
      details: { vin: vehicle.vin, plateNumber: vehicle.plateNumber, deviceId: vehicle.deviceId },
    });

    return vehicle;
  }

  /**
   * 车辆与车载设备绑定
   */
  async bindDevice(vehicleId: string, deviceId: string): Promise<boolean> {
    const session = TenantContext.getRequired();
    const vehicle = await this.vehicleRepo.findById(vehicleId);
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with id ${vehicleId} not found`);
    }

    const device = await this.deviceRepo.findById(deviceId);
    if (!device) {
      throw new NotFoundException(`Device with id ${deviceId} not found in current tenant`);
    }

    // 检查该设备是否已被其他车辆绑定
    const currentOwner = await this.vehicleRepo.findByDeviceId(deviceId);
    if (currentOwner && currentOwner.id !== vehicleId) {
      throw new BadRequestException(`Device ${device.deviceNo} is already bound to vehicle ${currentOwner.vin}`);
    }

    // 绑定更新
    await this.vehicleRepo.updateDeviceId(vehicleId, deviceId);

    // 关联在线状态服务映射
    this.deviceStatusService.registerDevice({
      deviceNo: device.deviceNo,
      productKey: device.productKey,
      vehicleId: vehicle.id,
      onlineStatus: device.onlineStatus,
    });

    this.auditService.logAction({
      tenantId: session.tenantId,
      userId: session.userId,
      action: 'VEHICLE_BIND_DEVICE',
      resourceType: 'VEHICLE',
      resourceId: vehicleId,
      details: { deviceId, deviceNo: device.deviceNo, vin: vehicle.vin },
    });

    return true;
  }

  /**
   * 解绑车载设备
   */
  async unbindDevice(vehicleId: string): Promise<boolean> {
    const session = TenantContext.getRequired();
    const vehicle = await this.vehicleRepo.findById(vehicleId);
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with id ${vehicleId} not found`);
    }

    if (!vehicle.deviceId) {
      return true; // 本身未绑定
    }

    const oldDeviceId = vehicle.deviceId;
    await this.vehicleRepo.updateDeviceId(vehicleId, undefined);

    this.auditService.logAction({
      tenantId: session.tenantId,
      userId: session.userId,
      action: 'VEHICLE_UNBIND_DEVICE',
      resourceType: 'VEHICLE',
      resourceId: vehicleId,
      details: { oldDeviceId, vin: vehicle.vin },
    });

    return true;
  }

  /**
   * 组合筛选车辆并拼接设备在线状态
   */
  async queryVehicles(filter?: VehicleFilterDto): Promise<VehicleDetailDto[]> {
    const list = await this.vehicleRepo.findMany((v) => {
      if (filter?.status && v.status !== filter.status) return false;
      if (filter?.projectId && v.projectId !== filter.projectId) return false;
      if (filter?.keyword) {
        const kw = filter.keyword.toLowerCase();
        const matchVin = v.vin.toLowerCase().includes(kw);
        const matchPlate = v.plateNumber.toLowerCase().includes(kw);
        if (!matchVin && !matchPlate) return false;
      }
      return true;
    });

    const results: VehicleDetailDto[] = [];
    for (const v of list) {
      let deviceNo: string | undefined;
      let onlineStatus: string = 'OFFLINE';

      if (v.deviceId) {
        const dev = await this.deviceRepo.findById(v.deviceId);
        if (dev) {
          deviceNo = dev.deviceNo;
          onlineStatus = this.deviceStatusService.isOnline(dev.deviceNo) ? 'ONLINE' : dev.onlineStatus;
        }
      }

      results.push({
        id: v.id,
        tenantId: v.tenantId,
        projectId: v.projectId,
        vin: v.vin,
        plateNumber: v.plateNumber,
        brandId: v.brandId,
        modelId: v.modelId,
        deviceId: v.deviceId,
        deviceNo,
        onlineStatus,
        status: v.status,
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
      });
    }

    return results;
  }

  /**
   * 获取单车详情
   */
  async getVehicleDetail(vehicleId: string): Promise<VehicleDetailDto> {
    const v = await this.vehicleRepo.findById(vehicleId);
    if (!v) {
      throw new NotFoundException(`Vehicle with id ${vehicleId} not found`);
    }

    let deviceNo: string | undefined;
    let onlineStatus: string = 'OFFLINE';

    if (v.deviceId) {
      const dev = await this.deviceRepo.findById(v.deviceId);
      if (dev) {
        deviceNo = dev.deviceNo;
        onlineStatus = this.deviceStatusService.isOnline(dev.deviceNo) ? 'ONLINE' : dev.onlineStatus;
      }
    }

    return {
      id: v.id,
      tenantId: v.tenantId,
      projectId: v.projectId,
      vin: v.vin,
      plateNumber: v.plateNumber,
      brandId: v.brandId,
      modelId: v.modelId,
      deviceId: v.deviceId,
      deviceNo,
      onlineStatus,
      status: v.status,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    };
  }
}
