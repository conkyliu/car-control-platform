import { Device } from '@car-control/domain-types';
import { TenantAwareRepository } from './repository.js';

export class DeviceRepository extends TenantAwareRepository<Device> {
  async findByDeviceNo(deviceNo: string): Promise<Device | null> {
    const list = await this.findMany((d) => d.deviceNo === deviceNo);
    return list[0] ?? null;
  }

  async findByImei(imei: string): Promise<Device | null> {
    const list = await this.findMany((d) => d.imei === imei);
    return list[0] ?? null;
  }

  async updateOnlineStatus(deviceId: string, onlineStatus: Device['onlineStatus']): Promise<boolean> {
    const dev = await this.findById(deviceId);
    if (!dev) return false;
    dev.onlineStatus = onlineStatus;
    dev.updatedAt = new Date();
    return true;
  }

  async updateStatus(deviceId: string, status: Device['status']): Promise<boolean> {
    const dev = await this.findById(deviceId);
    if (!dev) return false;
    dev.status = status;
    dev.updatedAt = new Date();
    return true;
  }
}
