import { Injectable, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { FirmwarePackage } from '@car-control/domain-types';
import {
  CreateFirmwareDto,
  FirmwarePackageDto,
  FirmwareStatus,
} from '@car-control/contracts';
import { FirmwareRepository, TenantContext } from '@car-control/database';
import { AuditService } from '../audit/audit.service.js';

export type CreateFirmwareRequestDto = Omit<CreateFirmwareDto, 'status'> & {
  status?: 'ACTIVE' | 'DEPRECATED' | FirmwareStatus;
};

@Injectable()
export class FirmwareService {
  constructor(
    private readonly firmwareRepo: FirmwareRepository,
    private readonly auditService: AuditService
  ) {}

  /**
   * 发布/登记新固件包
   * 严格限定当前租户上下文，防重校验 (targetModelId, version) 冲突
   */
  async createPackage(dto: CreateFirmwareDto | CreateFirmwareRequestDto): Promise<FirmwarePackageDto> {
    const session = TenantContext.getRequired();

    if (!dto.version || !dto.targetModelId || !dto.fileUrl) {
      throw new BadRequestException('version, targetModelId, and fileUrl are required');
    }

    // 版本同租户同车型唯一性检查
    const existing = await this.firmwareRepo.findByVersion(dto.version, dto.targetModelId);
    if (existing) {
      throw new ConflictException(
        `Firmware package with version ${dto.version} already exists for targetModelId ${dto.targetModelId}`
      );
    }

    // SHA-256 校验与默认生成
    let checksumSha256 = dto.checksumSha256;
    if (!checksumSha256) {
      checksumSha256 = createHash('sha256').update(dto.fileUrl + dto.version).digest('hex');
    }

    const pkg = await this.firmwareRepo.create({
      ...dto,
      checksumSha256,
      status: dto.status ?? FirmwareStatus.ACTIVE,
    });

    // 审计日志留痕
    this.auditService.logAction({
      tenantId: session.tenantId,
      userId: session.userId,
      action: 'FIRMWARE_PACKAGE_CREATE',
      resourceType: 'FIRMWARE',
      resourceId: pkg.id,
      details: {
        version: pkg.version,
        targetModelId: pkg.targetModelId,
        fileUrl: pkg.fileUrl,
        checksumSha256: pkg.checksumSha256,
      },
    });

    return pkg;
  }

  /**
   * 按 ID 获取固件详情
   */
  async getById(id: string): Promise<FirmwarePackageDto | null> {
    return this.firmwareRepo.findById(id);
  }

  /**
   * 列表查询当前租户名下固件包
   */
  async list(filter?: {
    targetModelId?: string;
    status?: FirmwareStatus;
  }): Promise<FirmwarePackageDto[]> {
    return this.firmwareRepo.list(filter);
  }
}
