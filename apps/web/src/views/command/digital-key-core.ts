import { CommandCode } from '@car-control/contracts';

export type DigitalKeyType = 'BLE' | 'CLOUD' | 'NFC';
export type DigitalKeyStatus = 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'REVOKED';

export interface DigitalKeyDto {
  id: string;
  keyNumber: string; // 唯一序列号如 KEY-202610-001
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

export interface DigitalKeyQueryParams {
  keyword?: string; // 车牌/VIN/接收人/手机/序列号/车主
  keyType?: DigitalKeyType;
  status?: DigitalKeyStatus;
  vehicleId?: string;
  startDate?: string;
  endDate?: string;
}

export interface CreateDigitalKeyInput {
  vehicleId: string;
  plateNumber?: string;
  vin?: string;
  ownerName?: string;
  ownerPhone?: string;
  recipientName: string;
  recipientPhone: string;
  keyType: DigitalKeyType;
  startTime: string;
  endTime: string;
  maxUsageCount?: number;
  permissions: CommandCode[];
}

export interface DigitalKeyStats {
  totalCount: number;
  activeCount: number;
  expiredCount: number;
  revokedCount: number;
  pendingCount: number;
  typeDistribution: Record<DigitalKeyType, number>;
  totalUsageCount: number;
}

/**
 * 钥匙介质类型元数据字典
 */
export const DIGITAL_KEY_TYPE_META: Record<
  DigitalKeyType,
  { label: string; tagColor: string; iconName: string; description: string }
> = {
  BLE: {
    label: 'BLE 蓝牙钥匙',
    tagColor: 'blue',
    iconName: 'CompassOutlined',
    description: '地库无网络场景下近场离线加密通信与 PKE 迎宾感应',
  },
  CLOUD: {
    label: 'Cloud 云端钥匙',
    tagColor: 'cyan',
    iconName: 'CloudOutlined',
    description: '基于 MQTT/HTTPS 远程网关指令鉴权与权限校验',
  },
  NFC: {
    label: 'NFC 实体卡片',
    tagColor: 'purple',
    iconName: 'CreditCardOutlined',
    description: '基于 B 柱近场刷卡感应加密通信与高频离线认证',
  },
};

/**
 * 钥匙状态元数据字典
 */
export const DIGITAL_KEY_STATUS_META: Record<
  DigitalKeyStatus,
  { label: string; badgeStatus: 'success' | 'warning' | 'error' | 'default'; tagColor: string }
> = {
  ACTIVE: {
    label: '生效中',
    badgeStatus: 'success',
    tagColor: 'success',
  },
  PENDING: {
    label: '待激活',
    badgeStatus: 'default',
    tagColor: 'default',
  },
  EXPIRED: {
    label: '已过期',
    badgeStatus: 'warning',
    tagColor: 'warning',
  },
  REVOKED: {
    label: '已作废',
    badgeStatus: 'error',
    tagColor: 'error',
  },
};

/**
 * 手机号校验纯函数
 * 正则严格匹配大陆 11 位手机号: /^1[3-9]\d{9}$/
 */
export function validateRecipientPhone(phone: string): { valid: boolean; message?: string } {
  if (!phone || typeof phone !== 'string' || phone.trim() === '') {
    return {
      valid: false,
      message: '请输入接收人手机号码',
    };
  }

  const trimmed = phone.trim();
  if (!/^1[3-9]\d{9}$/.test(trimmed)) {
    return {
      valid: false,
      message: '请输入有效的大陆11位手机号码',
    };
  }

  return { valid: true };
}

/**
 * 手机号码脱敏纯函数 (保留前3后4，中间4位为 ****)
 */
export function maskPhone(phone?: string): string {
  if (!phone || typeof phone !== 'string') return '-';
  const trimmed = phone.trim();
  if (/^1[3-9]\d{9}$/.test(trimmed)) {
    return `${trimmed.slice(0, 3)}****${trimmed.slice(7)}`;
  }
  return trimmed || '-';
}

/**
 * 钥匙有效性实时判定纯函数
 * 需同时满足：状态为 ACTIVE、当前时间在起止区间内、若限制次数则已用次数小于最大可用次数
 */
export function isKeyCurrentlyValid(key: DigitalKeyDto, now: Date = new Date()): boolean {
  if (key.status !== 'ACTIVE') {
    return false;
  }

  const currentTime = now.getTime();
  const startTime = new Date(key.startTime).getTime();
  const endTime = new Date(key.endTime).getTime();

  if (currentTime < startTime || currentTime > endTime) {
    return false;
  }

  if (typeof key.maxUsageCount === 'number' && key.maxUsageCount > 0) {
    if (key.usedCount >= key.maxUsageCount) {
      return false;
    }
  }

  return true;
}

/**
 * 钥匙状态机流转守卫纯函数
 * REVOKED 与 EXPIRED 为不可逆终态，不可再流转到其他状态
 */
export function isValidKeyStatusTransition(from: DigitalKeyStatus, to: DigitalKeyStatus): boolean {
  if (from === 'REVOKED' || from === 'EXPIRED') {
    return false; // 终态保护，不可逆转且不可重复流转
  }

  if (from === to) {
    return true; // 幂等自流转
  }

  if (from === 'PENDING') {
    return to === 'ACTIVE' || to === 'REVOKED' || to === 'EXPIRED';
  }

  if (from === 'ACTIVE') {
    return to === 'EXPIRED' || to === 'REVOKED';
  }

  return false;
}

/**
 * 统计指标核算纯函数
 */
export function calculateDigitalKeyStats(keys: DigitalKeyDto[]): DigitalKeyStats {
  const stats: DigitalKeyStats = {
    totalCount: keys.length,
    activeCount: 0,
    expiredCount: 0,
    revokedCount: 0,
    pendingCount: 0,
    typeDistribution: {
      BLE: 0,
      CLOUD: 0,
      NFC: 0,
    },
    totalUsageCount: 0,
  };

  for (const k of keys) {
    if (k.status === 'ACTIVE') stats.activeCount++;
    else if (k.status === 'EXPIRED') stats.expiredCount++;
    else if (k.status === 'REVOKED') stats.revokedCount++;
    else if (k.status === 'PENDING') stats.pendingCount++;

    if (stats.typeDistribution[k.keyType] !== undefined) {
      stats.typeDistribution[k.keyType]++;
    }

    stats.totalUsageCount += k.usedCount || 0;
  }

  return stats;
}

/**
 * 多维过滤流水线纯函数
 */
export function filterDigitalKeys(
  keys: DigitalKeyDto[],
  query?: DigitalKeyQueryParams
): DigitalKeyDto[] {
  if (!query) return [...keys];

  return keys.filter((key) => {
    // 关键字搜索 (车牌/VIN/接收人/接收人手机/钥匙编号/车主姓名/车主手机)
    if (query.keyword && query.keyword.trim() !== '') {
      const kw = query.keyword.trim().toLowerCase();
      const match =
        key.keyNumber.toLowerCase().includes(kw) ||
        key.plateNumber.toLowerCase().includes(kw) ||
        key.vin.toLowerCase().includes(kw) ||
        key.recipientName.toLowerCase().includes(kw) ||
        key.recipientPhone.includes(kw) ||
        key.ownerName.toLowerCase().includes(kw) ||
        key.ownerPhone.includes(kw);

      if (!match) return false;
    }

    // 钥匙介质类型
    if (query.keyType && key.keyType !== query.keyType) {
      return false;
    }

    // 钥匙状态
    if (query.status && key.status !== query.status) {
      return false;
    }

    // 关联车辆 ID
    if (query.vehicleId && key.vehicleId !== query.vehicleId) {
      return false;
    }

    // 创建时间或生效时段过滤
    if (query.startDate) {
      const queryStart = new Date(query.startDate).getTime();
      const keyCreated = new Date(key.createdAt).getTime();
      if (keyCreated < queryStart) return false;
    }

    if (query.endDate) {
      const queryEnd = new Date(query.endDate).getTime();
      const keyCreated = new Date(key.createdAt).getTime();
      if (keyCreated > queryEnd) return false;
    }

    return true;
  });
}

/**
 * 判断钥匙是否即将过期 (默认阈值 24 小时)
 */
export function isKeyExpiringSoon(
  key: DigitalKeyDto,
  thresholdHours = 24,
  now: Date = new Date()
): boolean {
  if (key.status !== 'ACTIVE') return false;
  const currentMs = now.getTime();
  const endMs = new Date(key.endTime).getTime();
  if (endMs <= currentMs) return false;
  const remainingHours = (endMs - currentMs) / (1000 * 3600);
  return remainingHours <= thresholdHours;
}

/**
 * 计算距离到期剩余小时数
 */
export function calculateRemainingHours(endTime: string, now: Date = new Date()): number {
  const currentMs = now.getTime();
  const endMs = new Date(endTime).getTime();
  if (endMs <= currentMs) return 0;
  return Math.max(0, Math.round((endMs - currentMs) / (1000 * 3600)));
}

/**
 * 生成拟真数字证书 SHA-256 指纹 (格式如 SHA256: 7F:9A:3C:...)
 */
export function generateSimulatedCertificateFingerprint(keyNumber: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < keyNumber.length; i++) {
    hash ^= keyNumber.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }

  const parts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const val = (hash ^ (i * 0x5a1f2b3c)) >>> (i % 8);
    const hex = (val & 0xff).toString(16).toUpperCase().padStart(2, '0');
    parts.push(hex);
  }

  return `SHA256: ${parts.join(':')}`;
}

/**
 * 高保真数字钥匙生产种子数据 (覆盖 BLE/CLOUD/NFC 及各生命周期状态)
 */
export const SEED_DIGITAL_KEYS: DigitalKeyDto[] = [
  {
    id: 'key-seed-001',
    keyNumber: 'KEY-202610-001',
    vehicleId: 'veh-001',
    plateNumber: '粤B·88888',
    vin: 'LSVAA4188P1002341',
    ownerName: '张建国',
    ownerPhone: '13800138000',
    recipientName: '李思源',
    recipientPhone: '13912345678',
    keyType: 'BLE',
    status: 'ACTIVE',
    startTime: '2026-10-01 00:00:00',
    endTime: '2026-10-31 23:59:59',
    maxUsageCount: 10,
    usedCount: 3,
    permissions: [
      CommandCode.CMD_LOCK,
      CommandCode.CMD_UNLOCK,
      CommandCode.CMD_TRUNK_OPEN,
      CommandCode.CMD_TRUNK_CLOSE,
      CommandCode.CMD_AC_START,
      CommandCode.CMD_AC_STOP,
    ],
    createdAt: '2026-10-01 08:30:00',
  },
  {
    id: 'key-seed-002',
    keyNumber: 'KEY-202610-002',
    vehicleId: 'veh-002',
    plateNumber: '粤B·66666',
    vin: 'LFPH2E023N1000678',
    ownerName: '王志远',
    ownerPhone: '13700137000',
    recipientName: '赵晓敏',
    recipientPhone: '15088889999',
    keyType: 'CLOUD',
    status: 'ACTIVE',
    startTime: '2026-10-05 09:00:00',
    endTime: '2026-12-31 23:59:59',
    maxUsageCount: undefined, // 不限次数
    usedCount: 25,
    permissions: [
      CommandCode.CMD_LOCK,
      CommandCode.CMD_UNLOCK,
      CommandCode.CMD_FIND_VEHICLE,
      CommandCode.CMD_WINDOW_OPEN,
      CommandCode.CMD_WINDOW_CLOSE,
    ],
    createdAt: '2026-10-05 09:00:00',
  },
  {
    id: 'key-seed-003',
    keyNumber: 'KEY-202610-003',
    vehicleId: 'veh-003',
    plateNumber: '京A·99999',
    vin: 'LSVAR4183M1004512',
    ownerName: '陈伟东',
    ownerPhone: '18600186000',
    recipientName: '孙海峰',
    recipientPhone: '17700001111',
    keyType: 'BLE',
    status: 'EXPIRED',
    startTime: '2026-09-01 00:00:00',
    endTime: '2026-10-01 00:00:00',
    maxUsageCount: 10,
    usedCount: 10,
    permissions: [
      CommandCode.CMD_LOCK,
      CommandCode.CMD_UNLOCK,
      CommandCode.CMD_FIND_VEHICLE,
    ],
    createdAt: '2026-09-01 00:00:00',
  },
  {
    id: 'key-seed-004',
    keyNumber: 'KEY-202610-004',
    vehicleId: 'veh-001',
    plateNumber: '粤B·88888',
    vin: 'LSVAA4188P1002341',
    ownerName: '张建国',
    ownerPhone: '13800138000',
    recipientName: '刘婷婷',
    recipientPhone: '18666667777',
    keyType: 'CLOUD',
    status: 'REVOKED',
    startTime: '2026-10-02 12:00:00',
    endTime: '2026-10-20 23:59:59',
    maxUsageCount: 5,
    usedCount: 2,
    permissions: [
      CommandCode.CMD_LOCK,
      CommandCode.CMD_UNLOCK,
      CommandCode.CMD_ENGINE_START,
      CommandCode.CMD_ENGINE_STOP,
    ],
    revokedAt: '2026-10-08 14:20:00',
    revokedReason: '手机设备遗失紧急挂失，车端CRL吊销名单已同步生效',
    createdAt: '2026-10-02 12:00:00',
  },
  {
    id: 'key-seed-005',
    keyNumber: 'KEY-202610-005',
    vehicleId: 'veh-004',
    plateNumber: '沪A·12345',
    vin: 'LFPH3A021K1007890',
    ownerName: '周浩然',
    ownerPhone: '13900139000',
    recipientName: '周浩然(备用)',
    recipientPhone: '13900139000',
    keyType: 'NFC',
    status: 'PENDING',
    startTime: '2026-10-14 00:00:00',
    endTime: '2027-10-14 23:59:59',
    maxUsageCount: undefined,
    usedCount: 0,
    permissions: [
      CommandCode.CMD_LOCK,
      CommandCode.CMD_UNLOCK,
    ],
    createdAt: '2026-10-14 09:00:00',
  },
  {
    id: 'key-seed-006',
    keyNumber: 'KEY-202610-006',
    vehicleId: 'veh-002',
    plateNumber: '粤B·66666',
    vin: 'LFPH2E023N1000678',
    ownerName: '王志远',
    ownerPhone: '13700137000',
    recipientName: '黄立仁',
    recipientPhone: '19912345678',
    keyType: 'BLE',
    status: 'ACTIVE',
    startTime: '2026-10-10 00:00:00',
    // 设定即将到期 (供前端倒计时 Tag 展示)
    endTime: '2026-10-15 18:00:00',
    maxUsageCount: 8,
    usedCount: 4,
    permissions: [
      CommandCode.CMD_LOCK,
      CommandCode.CMD_UNLOCK,
      CommandCode.CMD_TRUNK_OPEN,
      CommandCode.CMD_AC_START,
    ],
    createdAt: '2026-10-10 10:15:00',
  },
  {
    id: 'key-seed-007',
    keyNumber: 'KEY-202610-007',
    vehicleId: 'veh-004',
    plateNumber: '沪A·12345',
    vin: 'LFPH3A021K1007890',
    ownerName: '周浩然',
    ownerPhone: '13900139000',
    recipientName: '物流车队调度中心',
    recipientPhone: '15912345678',
    keyType: 'CLOUD',
    status: 'ACTIVE',
    startTime: '2026-10-01 00:00:00',
    endTime: '2027-01-01 00:00:00',
    maxUsageCount: undefined,
    usedCount: 88,
    permissions: [
      CommandCode.CMD_LOCK,
      CommandCode.CMD_UNLOCK,
      CommandCode.CMD_FIND_VEHICLE,
      CommandCode.CMD_TRUNK_OPEN,
      CommandCode.CMD_TRUNK_CLOSE,
      CommandCode.CMD_AC_START,
      CommandCode.CMD_AC_STOP,
    ],
    createdAt: '2026-10-01 00:00:00',
  },
];
