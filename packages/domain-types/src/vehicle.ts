export interface Vehicle {
  id: string;
  tenantId: string;
  projectId: string;
  vin: string;
  plateNumber: string;
  brandId: string;
  modelId: string;
  deviceId?: string;
  status: 'NORMAL' | 'MAINTENANCE' | 'LOCKED' | 'SCRAPPED';
  createdAt: Date;
  updatedAt: Date;
}
