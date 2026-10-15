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
  BrandDto,
  CreateBrandDto,
  ModelDto,
  CreateModelDto,
} from '@car-control/contracts';
import { VehicleRepository, DeviceRepository, TenantContext } from '@car-control/database';
import { ProjectService } from '../project/project.service.js';
import { DeviceStatusService } from '../device/device-status.service.js';
import { AuditService } from '../audit/audit.service.js';

const SEED_BRANDS: BrandDto[] = [
  {
    id: 'brand-tesla',
    name: '特斯拉',
    code: 'TESLA',
    country: '外资独资',
    modelCount: 1,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    id: 'brand-byd',
    name: '比亚迪',
    code: 'BYD',
    country: '自主品牌',
    modelCount: 2,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    id: 'brand-nio',
    name: '蔚来汽车',
    code: 'NIO',
    country: '自主新势力',
    modelCount: 1,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    id: 'brand-aion',
    name: '广汽埃安',
    code: 'AION',
    country: '自主品牌',
    modelCount: 1,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    id: 'brand-zeekr',
    name: '吉利极氪',
    code: 'ZEEKR',
    country: '自主新势力',
    modelCount: 1,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  },
];

const SEED_MODELS: ModelDto[] = [
  {
    id: 'model-tesla-modely',
    brandId: 'brand-tesla',
    brandName: '特斯拉',
    name: 'Model Y',
    code: '0x0201',
    powertrain: 'EV',
    capabilityTemplateId: 'tpl-std-ev',
    capabilityTemplateName: '纯电标准控车模板',
    vehicleCount: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    id: 'model-byd-han',
    brandId: 'brand-byd',
    brandName: '比亚迪',
    name: '汉 EV',
    code: '0x0101',
    powertrain: 'EV',
    capabilityTemplateId: 'tpl-perf-ev',
    capabilityTemplateName: '纯电高性能双电机模板',
    vehicleCount: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    id: 'model-byd-tang-dmi',
    brandId: 'brand-byd',
    brandName: '比亚迪',
    name: '唐 DM-i',
    code: '0x0102',
    powertrain: 'PHEV',
    capabilityTemplateId: 'tpl-phev-std',
    capabilityTemplateName: '插电混动旗舰模板',
    vehicleCount: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    id: 'model-nio-es6',
    brandId: 'brand-nio',
    brandName: '蔚来汽车',
    name: 'ES6',
    code: '0x0501',
    powertrain: 'EV',
    capabilityTemplateId: 'tpl-perf-ev',
    capabilityTemplateName: '纯电高性能双电机模板',
    vehicleCount: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    id: 'model-aion-s',
    brandId: 'brand-aion',
    brandName: '广汽埃安',
    name: 'AION S',
    code: '0x0301',
    powertrain: 'EV',
    capabilityTemplateId: 'tpl-std-ev',
    capabilityTemplateName: '纯电标准控车模板',
    vehicleCount: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    id: 'model-zeekr-001',
    brandId: 'brand-zeekr',
    brandName: '吉利极氪',
    name: '极氪 001',
    code: '0x0401',
    powertrain: 'EV',
    capabilityTemplateId: 'tpl-perf-ev',
    capabilityTemplateName: '纯电高性能双电机模板',
    vehicleCount: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  },
];

@Injectable()
export class VehicleService {
  private brands: BrandDto[] = [...SEED_BRANDS.map((b) => ({ ...b }))];
  private models: ModelDto[] = [...SEED_MODELS.map((m) => ({ ...m }))];

  constructor(
    private readonly vehicleRepo: VehicleRepository,
    private readonly deviceRepo: DeviceRepository,
    private readonly projectService: ProjectService,
    private readonly deviceStatusService: DeviceStatusService,
    private readonly auditService: AuditService
  ) {}

  /**
   * 获取所有品牌字典
   */
  async listBrands(): Promise<BrandDto[]> {
    return [...this.brands];
  }

  /**
   * 创建车辆品牌
   */
  async createBrand(dto: CreateBrandDto): Promise<BrandDto> {
    if (!dto.name || !dto.name.trim()) {
      throw new BadRequestException('Brand name is required');
    }
    if (!dto.code || !dto.code.trim()) {
      throw new BadRequestException('Brand code is required');
    }

    const trimmedCode = dto.code.trim().toUpperCase();
    const trimmedName = dto.name.trim();

    if (this.brands.some((b) => b.code.toUpperCase() === trimmedCode || b.name === trimmedName)) {
      throw new ConflictException(`Brand with code ${trimmedCode} or name ${trimmedName} already exists`);
    }

    const brand: BrandDto = {
      id: `brand-${trimmedCode.toLowerCase()}`,
      name: trimmedName,
      code: trimmedCode,
      country: dto.country?.trim() || '自主品牌',
      logoUrl: dto.logoUrl,
      modelCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.brands.push(brand);
    return brand;
  }

  /**
   * 获取所有车型或按品牌过滤
   */
  async listModels(brandId?: string): Promise<ModelDto[]> {
    if (brandId && brandId !== 'ALL') {
      return this.models.filter((m) => m.brandId === brandId);
    }
    return [...this.models];
  }

  /**
   * 创建车型
   */
  async createModel(dto: CreateModelDto): Promise<ModelDto> {
    if (!dto.brandId || !dto.name || !dto.code) {
      throw new BadRequestException('brandId, name, and code are required');
    }

    const brand = this.brands.find((b) => b.id === dto.brandId);
    if (!brand) {
      throw new NotFoundException(`Brand with id ${dto.brandId} not found`);
    }

    const trimmedName = dto.name.trim();
    const trimmedCode = dto.code.trim();

    if (this.models.some((m) => m.brandId === dto.brandId && (m.code === trimmedCode || m.name === trimmedName))) {
      throw new ConflictException(`Model with code ${trimmedCode} or name ${trimmedName} already exists under this brand`);
    }

    const model: ModelDto = {
      id: `model-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      brandId: dto.brandId,
      brandName: brand.name,
      name: trimmedName,
      code: trimmedCode,
      powertrain: dto.powertrain || 'EV',
      capabilityTemplateId: dto.capabilityTemplateId,
      capabilityTemplateName: dto.capabilityTemplateName,
      vehicleCount: 0,
      template: dto.template,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    brand.modelCount = (brand.modelCount || 0) + 1;
    this.models.push(model);
    return model;
  }


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
