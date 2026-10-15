import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  DigitalKeyDto,
  DigitalKeyQueryParams,
  CreateDigitalKeyInput,
  DigitalKeyStatus,
  CommandCode,
} from '@car-control/contracts';
import { TenantContext } from '@car-control/database';

@Injectable()
export class DigitalKeyService {
  private keys: Map<string, DigitalKeyDto> = new Map();

  constructor() {
    this.seedInitialKeys();
  }

  public seedInitialKeys(): void {
    this.keys.clear();

    const seeds: DigitalKeyDto[] = [
      {
        id: 'key-seed-001',
        keyNumber: 'KEY-202610-001',
        tenantId: 'tenant-demo',
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
        tenantId: 'tenant-demo',
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
        tenantId: 'tenant-demo',
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
        tenantId: 'tenant-demo',
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
        tenantId: 'tenant-demo',
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
        usedCount: 0,
        permissions: [CommandCode.CMD_LOCK, CommandCode.CMD_UNLOCK],
        createdAt: '2026-10-14 09:00:00',
      },
      {
        id: 'key-seed-006',
        keyNumber: 'KEY-202610-006',
        tenantId: 'tenant-demo',
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
        tenantId: 'tenant-demo',
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
      // Multi-tenant isolation test seed for tenant-beta
      {
        id: 'key-seed-b01',
        keyNumber: 'KEY-202610-099',
        tenantId: 'tenant-beta',
        vehicleId: 'veh-b-01',
        plateNumber: '粤A·B8888',
        vin: 'LB3775199P2009876',
        ownerName: 'Beta车主',
        ownerPhone: '18800188000',
        recipientName: 'Beta接收人',
        recipientPhone: '18900189000',
        keyType: 'BLE',
        status: 'ACTIVE',
        startTime: '2026-10-01 00:00:00',
        endTime: '2026-12-31 23:59:59',
        usedCount: 1,
        permissions: [CommandCode.CMD_LOCK, CommandCode.CMD_UNLOCK],
        createdAt: '2026-10-01 00:00:00',
      },
    ];

    for (const seed of seeds) {
      this.keys.set(seed.id, seed);
    }
  }

  /**
   * 分页/条件检索数字钥匙列表（强制多租户隔离）
   */
  async listKeys(
    params?: DigitalKeyQueryParams,
    tenantId?: string
  ): Promise<DigitalKeyDto[]> {
    const effectiveTenant = this.resolveTenantId(tenantId);
    let list = Array.from(this.keys.values()).filter(
      (k) => !k.tenantId || k.tenantId === effectiveTenant
    );

    if (params) {
      if (params.keyword && params.keyword.trim() !== '') {
        const kw = params.keyword.trim().toLowerCase();
        list = list.filter((k) => {
          return (
            k.keyNumber.toLowerCase().includes(kw) ||
            k.plateNumber.toLowerCase().includes(kw) ||
            k.vin.toLowerCase().includes(kw) ||
            k.recipientName.toLowerCase().includes(kw) ||
            k.recipientPhone.includes(kw) ||
            k.ownerName.toLowerCase().includes(kw) ||
            k.ownerPhone.includes(kw)
          );
        });
      }

      if (params.keyType) {
        list = list.filter((k) => k.keyType === params.keyType);
      }

      if (params.status) {
        list = list.filter((k) => k.status === params.status);
      }

      if (params.vehicleId) {
        list = list.filter((k) => k.vehicleId === params.vehicleId);
      }

      if (params.startDate) {
        const queryStart = new Date(params.startDate).getTime();
        list = list.filter((k) => new Date(k.createdAt).getTime() >= queryStart);
      }

      if (params.endDate) {
        const queryEnd = new Date(params.endDate).getTime();
        list = list.filter((k) => new Date(k.createdAt).getTime() <= queryEnd);
      }
    }

    return JSON.parse(JSON.stringify(list));
  }

  /**
   * 获取单张数字钥匙详细档案
   */
  async getKeyById(id: string, tenantId?: string): Promise<DigitalKeyDto> {
    const effectiveTenant = this.resolveTenantId(tenantId);
    const key = this.keys.get(id);

    if (!key || (key.tenantId && key.tenantId !== effectiveTenant)) {
      throw new NotFoundException(`未找到指定的数字钥匙: ${id}`);
    }

    return JSON.parse(JSON.stringify(key));
  }

  /**
   * 发放并授权新的数字钥匙
   */
  async createKey(
    input: CreateDigitalKeyInput,
    tenantId?: string
  ): Promise<DigitalKeyDto> {
    const effectiveTenant = this.resolveTenantId(tenantId);

    // 必填项校验
    if (!input.vehicleId || !input.vehicleId.trim()) {
      throw new BadRequestException('关联车辆 ID 不能为空');
    }
    if (!input.recipientName || !input.recipientName.trim()) {
      throw new BadRequestException('接收人姓名不能为空');
    }
    if (!input.recipientPhone || !input.recipientPhone.trim()) {
      throw new BadRequestException('接收人手机号码不能为空');
    }
    if (!input.keyType || !['BLE', 'CLOUD', 'NFC'].includes(input.keyType)) {
      throw new BadRequestException('钥匙介质类型必须为 BLE, CLOUD 或 NFC');
    }
    if (!input.startTime || !input.endTime) {
      throw new BadRequestException('钥匙生效与失效时间范围不能为空');
    }
    const startMs = new Date(input.startTime).getTime();
    const endMs = new Date(input.endTime).getTime();
    if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) {
      throw new BadRequestException('钥匙失效时间必须晚于生效时间');
    }
    if (!Array.isArray(input.permissions) || input.permissions.length === 0) {
      throw new BadRequestException('至少需要为数字钥匙配置一项控车权限');
    }

    const now = new Date();
    const dateStr = now.toISOString().replace('T', ' ').slice(0, 19);
    const monthStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const seq = String(this.keys.size + 1).padStart(3, '0');
    const keyNumber = `KEY-${monthStr}-${seq}`;

    const newKey: DigitalKeyDto = {
      id: `key-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      keyNumber,
      tenantId: effectiveTenant,
      vehicleId: input.vehicleId,
      plateNumber: input.plateNumber || '粤B·88888',
      vin: input.vin || 'LSVAA4188P1002341',
      ownerName: input.ownerName || '平台默认车主',
      ownerPhone: input.ownerPhone || '13800138000',
      recipientName: input.recipientName.trim(),
      recipientPhone: input.recipientPhone.trim(),
      keyType: input.keyType,
      status: 'ACTIVE',
      startTime: input.startTime,
      endTime: input.endTime,
      maxUsageCount: input.maxUsageCount,
      usedCount: 0,
      permissions: input.permissions,
      createdAt: dateStr,
    };

    this.keys.set(newKey.id, newKey);
    return JSON.parse(JSON.stringify(newKey));
  }

  /**
   * 紧急吊销/作废数字钥匙 (终态不可逆)
   */
  async revokeKey(
    id: string,
    reason?: string,
    tenantId?: string
  ): Promise<DigitalKeyDto> {
    const effectiveTenant = this.resolveTenantId(tenantId);
    const existing = this.keys.get(id);

    if (!existing || (existing.tenantId && existing.tenantId !== effectiveTenant)) {
      throw new NotFoundException(`未找到指定的数字钥匙: ${id}`);
    }

    // 终态保护：已作废或已过期的钥匙不可重复作废
    if (existing.status === 'REVOKED' || existing.status === 'EXPIRED') {
      throw new BadRequestException(`该数字钥匙当前状态为【${existing.status}】，不允许作废`);
    }

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    existing.status = 'REVOKED';
    existing.revokedAt = now;
    existing.revokedReason = reason || '管理员手动吊销钥匙权限';

    this.keys.set(id, existing);
    return JSON.parse(JSON.stringify(existing));
  }

  /**
   * 获取指定车辆的历史数字钥匙流转记录
   */
  async getKeysByVehicle(
    vehicleId: string,
    tenantId?: string
  ): Promise<DigitalKeyDto[]> {
    const effectiveTenant = this.resolveTenantId(tenantId);
    const list = Array.from(this.keys.values()).filter(
      (k) => (!k.tenantId || k.tenantId === effectiveTenant) && k.vehicleId === vehicleId
    );
    return JSON.parse(JSON.stringify(list));
  }

  private resolveTenantId(explicitTenantId?: string): string {
    if (explicitTenantId) return explicitTenantId;
    const optional = TenantContext.getOptional();
    if (optional?.tenantId) return optional.tenantId;
    return 'tenant-demo';
  }
}
