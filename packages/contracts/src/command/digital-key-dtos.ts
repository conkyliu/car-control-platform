import { CommandCode } from './command-codes.js';

export type DigitalKeyType = 'BLE' | 'CLOUD' | 'NFC';
export type DigitalKeyStatus = 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'REVOKED';

export interface DigitalKeyDto {
  id: string;
  keyNumber: string; // 唯一序列号如 KEY-202610-001
  tenantId?: string;
  vehicleId: string;
  plateNumber: string;
  vin: string;
  ownerName: string;
  ownerPhone: string;
  recipientName: string;
  recipientPhone: string;
  keyType: DigitalKeyType;
  status: DigitalKeyStatus;
  startTime: string; // YYYY-MM-DD HH:mm:ss 或 ISO
  endTime: string;
  maxUsageCount?: number; // 未设置表示不限次数
  usedCount: number;
  permissions: CommandCode[];
  revokedAt?: string;
  revokedReason?: string;
  createdAt: string;
}

export interface CreateDigitalKeyInput {
  vehicleId: string;
  recipientName: string;
  recipientPhone: string;
  keyType: DigitalKeyType;
  startTime: string;
  endTime: string;
  permissions: CommandCode[];
  plateNumber?: string;
  vin?: string;
  ownerName?: string;
  ownerPhone?: string;
  maxUsageCount?: number;
}

export interface DigitalKeyQueryParams {
  keyword?: string; // 车牌/VIN/接收人/手机/序列号/车主
  keyType?: DigitalKeyType;
  status?: DigitalKeyStatus;
  vehicleId?: string;
  startDate?: string;
  endDate?: string;
}

export interface RevokeDigitalKeyInput {
  reason?: string;
}
