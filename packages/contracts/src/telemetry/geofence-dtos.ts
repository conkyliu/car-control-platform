import { AlarmLevel } from '../alarm/alarm-payloads.js';

export type GeofenceType = 'CIRCLE' | 'POLYGON';
export type AlarmTriggerType = 'IN' | 'OUT' | 'IN_OUT';
export type GeofenceStatus = 'ACTIVE' | 'DISABLED';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface GeofenceCircle {
  center: Coordinates;
  radiusMeters: number;
}

export interface GeofencePolygon {
  vertices: Coordinates[];
}

export interface GeofenceDto {
  id: string;
  tenantId: string;
  projectId: string;
  name: string;
  type: GeofenceType;
  circle?: GeofenceCircle;
  polygon?: GeofencePolygon;
  triggerType: AlarmTriggerType;
  alarmLevel: AlarmLevel | 'INFO' | 'WARNING' | 'CRITICAL';
  status: GeofenceStatus;
  boundVehicleCount: number;
  vehicleIds?: string[];
  effectiveDays?: number[]; // 1 = Mon, ..., 7 = Sun
  effectiveTimeRange?: [string, string];
  description?: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CreateGeofenceDto {
  id?: string;
  projectId?: string;
  name: string;
  type: GeofenceType;
  circle?: GeofenceCircle;
  polygon?: GeofencePolygon;
  triggerType?: AlarmTriggerType;
  alarmLevel?: AlarmLevel | 'INFO' | 'WARNING' | 'CRITICAL';
  status?: GeofenceStatus;
  boundVehicleCount?: number;
  vehicleIds?: string[];
  effectiveDays?: number[];
  effectiveTimeRange?: [string, string];
  description?: string;
}

export interface UpdateGeofenceDto {
  name?: string;
  projectId?: string;
  type?: GeofenceType;
  circle?: GeofenceCircle;
  polygon?: GeofencePolygon;
  triggerType?: AlarmTriggerType;
  alarmLevel?: AlarmLevel | 'INFO' | 'WARNING' | 'CRITICAL';
  status?: GeofenceStatus;
  boundVehicleCount?: number;
  vehicleIds?: string[];
  effectiveDays?: number[];
  effectiveTimeRange?: [string, string];
  description?: string;
}

export interface GeofenceFilterQueryDto {
  keyword?: string;
  type?: GeofenceType;
  status?: GeofenceStatus;
  alarmLevel?: AlarmLevel | string;
  projectId?: string;
  tenantId?: string;
}
