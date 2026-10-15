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

export interface BrandDto {
  id: string;
  name: string;
  code: string;
  country?: string;
  logoUrl?: string;
  modelCount?: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface CreateBrandDto {
  name: string;
  code: string;
  country?: string;
  logoUrl?: string;
}

export interface ModelDto {
  id: string;
  brandId: string;
  brandName?: string;
  name: string;
  code: string;
  powertrain?: string;
  capabilityTemplateId?: string;
  capabilityTemplateName?: string;
  vehicleCount?: number;
  template?: Record<string, unknown>;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface CreateModelDto {
  brandId: string;
  name: string;
  code: string;
  powertrain?: string;
  capabilityTemplateId?: string;
  capabilityTemplateName?: string;
  template?: Record<string, unknown>;
}

