export type ProjectStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

export interface ProjectDto {
  id: string;
  tenantId?: string;
  name: string;
  code: string;
  orgName?: string;
  contactName?: string;
  contactPhone?: string;
  description?: string;
  status: ProjectStatus;
  deviceCount?: number;
  vehicleCount?: number;
  onlineDeviceCount?: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface CreateProjectInput {
  name: string;
  code: string;
  orgName?: string;
  contactName?: string;
  contactPhone?: string;
  description?: string;
  status?: ProjectStatus;
}

export interface UpdateProjectInput {
  name?: string;
  code?: string;
  orgName?: string;
  contactName?: string;
  contactPhone?: string;
  description?: string;
  status?: ProjectStatus;
}

export interface AllocateDevicesInput {
  deviceIds: string[];
}
