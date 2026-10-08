import { TenantContext } from './tenant-context.js';

export interface BaseEntity {
  id: string;
  tenantId: string;
}

export abstract class TenantAwareRepository<T extends BaseEntity> {
  protected items: Map<string, T> = new Map();

  /**
   * 按 ID 查询单条记录，强制限定必须属于当前上下文 tenantId
   */
  async findById(id: string): Promise<T | null> {
    const tenantId = TenantContext.getTenantId();
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) {
      return null;
    }
    return item;
  }

  /**
   * 列表查询，强制限定必须属于当前上下文 tenantId
   */
  async findMany(predicate?: (item: T) => boolean): Promise<T[]> {
    const tenantId = TenantContext.getTenantId();
    const results: T[] = [];
    for (const item of this.items.values()) {
      if (item.tenantId === tenantId) {
        if (!predicate || predicate(item)) {
          results.push(item);
        }
      }
    }
    return results;
  }

  /**
   * 插入记录，强制注入当前上下文 tenantId
   */
  async create(data: Omit<T, 'tenantId'>): Promise<T> {
    const tenantId = TenantContext.getTenantId();
    const record = {
      ...data,
      tenantId,
    } as unknown as T;

    this.items.set(record.id, record);
    return record;
  }

  /**
   * 删除记录，强制限定必须属于当前上下文 tenantId
   */
  async delete(id: string): Promise<boolean> {
    const tenantId = TenantContext.getTenantId();
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) {
      return false;
    }
    return this.items.delete(id);
  }
}
