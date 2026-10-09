import { Vehicle } from '@car-control/domain-types';
import { TenantAwareRepository } from './repository.js';
import { TenantContext } from './tenant-context.js';

export class VehicleRepository extends TenantAwareRepository<Vehicle> {
  override async findById(id: string): Promise<Vehicle | null> {
    const session = TenantContext.getOptional();
    if (session?.tenantId) {
      return super.findById(id);
    }
    return this.items.get(id) ?? null;
  }

  async findByVin(vin: string): Promise<Vehicle | null> {
    const list = await this.findMany((v) => v.vin === vin);
    return list[0] ?? null;
  }

  async findByDeviceId(deviceId: string): Promise<Vehicle | null> {
    const session = TenantContext.getOptional();
    if (session?.tenantId) {
      const list = await this.findMany((v) => v.deviceId === deviceId);
      return list[0] ?? null;
    }
    for (const item of this.items.values()) {
      if (item.deviceId === deviceId) {
        return item;
      }
    }
    return null;
  }

  async updateDeviceId(vehicleId: string, deviceId?: string): Promise<boolean> {
    const vehicle = await this.findById(vehicleId);
    if (!vehicle) return false;
    vehicle.deviceId = deviceId;
    vehicle.updatedAt = new Date();
    return true;
  }

  async updateStatus(vehicleId: string, status: Vehicle['status']): Promise<boolean> {
    const vehicle = await this.findById(vehicleId);
    if (!vehicle) return false;
    vehicle.status = status;
    vehicle.updatedAt = new Date();
    return true;
  }
}
