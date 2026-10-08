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
}
