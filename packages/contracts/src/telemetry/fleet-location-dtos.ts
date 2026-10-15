/**
 * 车队全局遥测定位与监控数据传输契约
 */

export type VehicleOnlineStatus = 'ONLINE' | 'OFFLINE' | 'ALARM';

export interface VehicleLocationDto {
  vehicleId: string;
  plateNumber: string;
  vin: string;
  brand: string;
  modelName: string;
  deviceNo: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  altitude?: number;
  speed?: number; // km/h
  heading?: number; // degrees 0..360
  satellites?: number;
  gpsValid: boolean;
  timestamp: number; // unix timestamp ms
  mileage?: number; // km
  voltage?: number; // V
  status: VehicleOnlineStatus;
  alarmCount?: number;
  lastReportTime: string; // ISO 8601
  address?: string;
}

export type TelemetryStatusFilter =
  | 'ALL'
  | 'ONLINE'
  | 'MOVING'
  | 'STATIONARY'
  | 'ALARM'
  | 'OFFLINE';

export interface TelemetryFilterQuery {
  keyword?: string;
  status?: TelemetryStatusFilter | string;
  lowVoltageOnly?: boolean;
}
