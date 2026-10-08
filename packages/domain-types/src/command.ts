import { CommandCode, CommandStatus, SecurityLevel } from '@car-control/contracts';

export interface CommandRecord {
  id: string;
  tenantId: string;
  projectId: string;
  vehicleId: string;
  deviceId: string;
  deviceNo: string;
  commandCode: CommandCode;
  status: CommandStatus;
  securityLevel: SecurityLevel;
  idempotencyKey: string;
  traceId: string;
  requestId: string;
  params?: Record<string, unknown>;
  sentAt?: Date;
  ackedAt?: Date;
  finishedAt?: Date;
  errorCode?: string;
  errorMessage?: string;
  operatorId: string;
  createdAt: Date;
  updatedAt: Date;
}
