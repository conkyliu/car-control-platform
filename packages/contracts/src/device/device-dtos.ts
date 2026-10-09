export interface CreateDeviceDto {
  deviceNo: string;
  imei: string;
  productKey: string;
  projectId?: string;
}

export interface BatchImportDevicesDto {
  devices: CreateDeviceDto[];
}

export interface DeviceFilterDto {
  status?: string;
  onlineStatus?: string;
  keyword?: string; // 模糊搜索 deviceNo / imei
}

export interface DeviceHierarchyDto {
  deviceNo: string;
  imei: string;
  productKey: string;
  status: string;
  onlineStatus: string;
  vehicle?: {
    id: string;
    vin: string;
    plateNumber: string;
  };
  project?: {
    id: string;
    name: string;
  };
  tenant: {
    id: string;
    name: string;
  };
}
