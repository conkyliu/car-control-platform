import { AlarmType, AlarmLevel, AlarmStatus } from '@car-control/contracts';

/**
 * 车辆告警领域实体接口
 */
export interface AlarmRecord {
  id: string;
  tenantId: string;
  projectId: string;
  vehicleId: string;
  deviceNo: string;
  alarmType: AlarmType;
  alarmLevel: AlarmLevel;
  lat?: number;
  lng?: number;
  speed?: number;
  status: AlarmStatus;
  message?: string;
  triggeredAt: Date;
  processedAt?: Date;
  processedBy?: string;
  operatorId?: string; // processedBy 的业务别名
  remark?: string;
  createdAt: Date;
  updatedAt: Date;
}
