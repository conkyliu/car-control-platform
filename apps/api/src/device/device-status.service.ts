import { Injectable } from '@nestjs/common';
import { DeviceOnlineStatus } from '@car-control/domain-types';

export interface DeviceState {
  deviceNo: string;
  productKey: string;
  vehicleId: string;
  onlineStatus: DeviceOnlineStatus;
  lastHeartbeatAt?: number;
  batteryVoltage?: number;
}

@Injectable()
export class DeviceStatusService {
  private devices: Map<string, DeviceState> = new Map();

  registerDevice(state: DeviceState): void {
    this.devices.set(state.deviceNo, state);
  }

  getDevice(deviceNo: string): DeviceState | undefined {
    return this.devices.get(deviceNo);
  }

  setOnlineStatus(deviceNo: string, online: boolean, voltage?: number): void {
    const dev = this.devices.get(deviceNo);
    if (dev) {
      dev.onlineStatus = online ? DeviceOnlineStatus.ONLINE : DeviceOnlineStatus.OFFLINE;
      if (voltage !== undefined) {
        dev.batteryVoltage = voltage;
      }
    }
  }

  recordHeartbeat(deviceNo: string, timestamp: number): void {
    const dev = this.devices.get(deviceNo);
    if (dev) {
      dev.onlineStatus = DeviceOnlineStatus.ONLINE;
      dev.lastHeartbeatAt = timestamp;
    }
  }

  isOnline(deviceNo: string): boolean {
    const dev = this.devices.get(deviceNo);
    return dev?.onlineStatus === DeviceOnlineStatus.ONLINE;
  }
}
