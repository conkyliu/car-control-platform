import { randomUUID } from 'node:crypto';
import { FirmwarePackage } from '@car-control/domain-types';
import { FirmwareStatus } from '@car-control/contracts';
import { TenantAwareRepository } from './repository.js';

export type CreateFirmwareInput = Omit<
  FirmwarePackage,
  'id' | 'tenantId' | 'status' | 'createdAt'
> & {
  id?: string;
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
  status?: 'ACTIVE' | 'DEPRECATED' | FirmwareStatus;
};

/**
 * 固件发布包仓储
 * 严格受多租户上下文隔离约束，保障同一租户内同车型的版本唯一性
 */
export class FirmwareRepository extends TenantAwareRepository<FirmwarePackage> {
  /**
   * 创建固件发布包记录
   * 自动生成 UUID、创建时间，并在当前租户内校验 (targetModelId, version) 唯一性冲突
   */
  override async create(pkg: CreateFirmwareInput): Promise<FirmwarePackage> {
    const existing = await this.findByVersion(pkg.version, pkg.targetModelId);
    if (existing) {
      throw new Error(
        `[FirmwareRepository] Firmware package with version ${pkg.version} already exists for targetModelId ${pkg.targetModelId}`
      );
    }

    const id = pkg.id || randomUUID();
    const now = new Date();
    const record: Omit<FirmwarePackage, 'tenantId'> = {
      ...pkg,
      id,
      status: pkg.status ?? FirmwareStatus.ACTIVE,
      createdAt: pkg.createdAt ?? now,
      updatedAt: pkg.updatedAt ?? now,
    };

    return super.create(record);
  }

  /**
   * 按固件版本号与目标车型查询固件包（严格限定当前租户）
   */
  async findByVersion(version: string, targetModelId: string): Promise<FirmwarePackage | null> {
    const list = await this.findMany(
      (item) => item.version === version && item.targetModelId === targetModelId
    );
    return list[0] ?? null;
  }

  /**
   * 列表查询固件包，支持 targetModelId 与 status 条件过滤，按创建时间倒序排列
   */
  async list(filter?: {
    targetModelId?: string;
    status?: FirmwareStatus | string;
  }): Promise<FirmwarePackage[]> {
    const results = await this.findMany((item) => {
      if (!filter) {
        return true;
      }
      if (filter.targetModelId && item.targetModelId !== filter.targetModelId) {
        return false;
      }
      if (filter.status && item.status !== filter.status) {
        return false;
      }
      return true;
    });

    return results.sort((a, b) => {
      const timeA = a.createdAt?.getTime() ?? 0;
      const timeB = b.createdAt?.getTime() ?? 0;
      return timeB - timeA;
    });
  }
}
