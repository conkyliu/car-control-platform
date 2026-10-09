export interface CreateVehicleDto {
  vin: string;
  plateNumber: string;
  brandId: string;
  modelId: string;
  projectId: string;
  deviceId?: string;
}

export interface BindDeviceDto {
  deviceId: string;
}

export interface VehicleFilterDto {
  status?: string;
  projectId?: string;
  keyword?: string; // vin / plateNumber
}

export interface VehicleDetailDto {
  id: string;
  tenantId: string;
  projectId: string;
  vin: string;
  plateNumber: string;
  brandId: string;
  modelId: string;
  deviceId?: string;
  deviceNo?: string;
  onlineStatus?: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}
