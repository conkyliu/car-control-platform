import { Vehicle } from '@car-control/domain-types';
import { TenantAwareRepository } from './repository.js';

export class VehicleRepository extends TenantAwareRepository<Vehicle> {
  async findByVin(vin: string): Promise<Vehicle | null> {
    const list = await this.findMany((v) => v.vin === vin);
    return list[0] ?? null;
  }

  async findByDeviceId(deviceId: string): Promise<Vehicle | null> {
    const list = await this.findMany((v) => v.deviceId === deviceId);
    return list[0] ?? null;
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
