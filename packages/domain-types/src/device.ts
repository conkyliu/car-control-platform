export enum DeviceOnlineStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
}

export interface Device {
  id: string;
  tenantId: string;
  projectId?: string;
  deviceNo: string;
  imei: string;
  productKey: string;
  status: 'ACTIVE' | 'INACTIVE' | 'DECOMMISSIONED';
  onlineStatus: DeviceOnlineStatus;
  lastHeartbeatAt?: Date;
  firmwareVersion?: string;
  createdAt: Date;
  updatedAt: Date;
}
