import { randomUUID } from 'node:crypto';
import { CommunicationLog } from '@car-control/domain-types';
import { CommunicationLogDto, CommunicationLogFilterDto } from '@car-control/contracts';
import { TenantAwareRepository } from './repository.js';

export type CreateCommunicationLogInput = Omit<CommunicationLogDto, 'id' | 'tenantId' | 'createdAt'> & {
  id?: string;
  tenantId?: string;
  createdAt?: Date;
};

/**
 * 设备通讯报文日志仓储
 * 记录设备上下行通讯报文（MQTT / TCP / HTTP），支持基于车辆、设备号与 traceId 的多维追溯，严格限定租户上下文
 */
export class CommunicationLogRepository extends TenantAwareRepository<CommunicationLog> {
  /**
   * 记录一条通讯报文日志
   * 自动补齐 UUID 主键及创建时间戳，由租户仓储基类自动绑定 tenantId
   */
  async log(entry: CreateCommunicationLogInput): Promise<CommunicationLog> {
    const id = entry.id || randomUUID();
    const createdAt = entry.createdAt ?? new Date();

    return this.create({
      ...entry,
      id,
      createdAt,
    });
  }

  /**
   * 多维条件检索通讯报文日志
   * 支持 vehicleId, deviceNo, traceId, requestId, direction, channel, topic, 时间范围精确匹配，严格限定在当前租户下，按时间倒序排列
   */
  async query(filter?: CommunicationLogFilterDto | {
    vehicleId?: string;
    deviceNo?: string;
    traceId?: string;
  }): Promise<CommunicationLog[]> {
    const results = await this.findMany((item) => {
      if (!filter) {
        return true;
      }
      if (filter.vehicleId && item.vehicleId !== filter.vehicleId) {
        return false;
      }
      if (filter.deviceNo && item.deviceNo !== filter.deviceNo) {
        return false;
      }
      if (filter.traceId && item.traceId !== filter.traceId) {
        return false;
      }
      if ('requestId' in filter && filter.requestId && item.requestId !== filter.requestId) {
        return false;
      }
      if ('direction' in filter && filter.direction && item.direction !== filter.direction) {
        return false;
      }
      if ('channel' in filter && filter.channel && item.channel !== filter.channel) {
        return false;
      }
      if ('topic' in filter && filter.topic && item.topic !== filter.topic) {
        return false;
      }
      if ('startTime' in filter && filter.startTime) {
        const start = new Date(filter.startTime);
        if (item.createdAt < start) return false;
      }
      if ('endTime' in filter && filter.endTime) {
        const end = new Date(filter.endTime);
        if (item.createdAt > end) return false;
      }
      return true;
    });

    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}
