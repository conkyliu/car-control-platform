/**
 * 车辆位置与遥测领域实体
 */
export interface LocationRecord {
  id: string;
  tenantId: string;
  vehicleId: string;
  deviceNo?: string;
  lat: number;
  lng: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  satellites?: number;
  gpsValid: boolean;
  timestamp: number;
  mileage?: number;
  extra?: Record<string, unknown>;
  createdAt: Date;
  recordedAt?: Date;
}
