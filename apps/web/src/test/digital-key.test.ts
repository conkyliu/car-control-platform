import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CommandCode } from '@car-control/contracts';
import {
  type DigitalKeyDto,
  type DigitalKeyType,
  type DigitalKeyStatus,
  type DigitalKeyQueryParams,
  type CreateDigitalKeyInput,
  validateRecipientPhone,
  maskPhone,
  isKeyCurrentlyValid,
  isValidKeyStatusTransition,
  calculateDigitalKeyStats,
  filterDigitalKeys,
  isKeyExpiringSoon,
  calculateRemainingHours,
  generateSimulatedCertificateFingerprint,
  SEED_DIGITAL_KEYS,
  DIGITAL_KEY_TYPE_META,
  DIGITAL_KEY_STATUS_META,
} from '../views/command/digital-key-core.ts';
import {
  fetchDigitalKeysApi,
  fetchDigitalKeyDetailApi,
  createDigitalKeyApi,
  revokeDigitalKeyApi,
  fetchVehicleKeyHistoryApi,
  getInMemoryDigitalKeys,
  setInMemoryDigitalKeys,
  resetInMemoryDigitalKeys,
} from '../api/digital-key.ts';
import { ApiError } from '../api/client.ts';

describe('Digital Key Management Core & TDD Test Suite', () => {
  beforeEach(() => {
    resetInMemoryDigitalKeys();
  });

  describe('1. Phone Number Validation (validateRecipientPhone)', () => {
    it('accepts valid 11-digit Chinese mobile phone numbers', () => {
      const validNumbers = [
        '13800138000',
        '13912345678',
        '15088889999',
        '17700001111',
        '18666667777',
        '19912345678',
      ];
      for (const phone of validNumbers) {
        const result = validateRecipientPhone(phone);
        assert.equal(result.valid, true, `Expected ${phone} to be valid`);
        assert.equal(result.message, undefined);
      }
    });

    it('rejects invalid mobile numbers with clear reason', () => {
      const invalidCases = [
        { phone: '', expectedMsg: '请输入接收人手机号码' },
        { phone: '   ', expectedMsg: '请输入接收人手机号码' },
        { phone: '12345678901', expectedMsg: '请输入有效的大陆11位手机号码' }, // starts with 12
        { phone: '1380013800', expectedMsg: '请输入有效的大陆11位手机号码' }, // 10 digits
        { phone: '138001380000', expectedMsg: '请输入有效的大陆11位手机号码' }, // 12 digits
        { phone: '138abcd8888', expectedMsg: '请输入有效的大陆11位手机号码' },
        { phone: 'abcdefghijk', expectedMsg: '请输入有效的大陆11位手机号码' },
      ];
      for (const { phone, expectedMsg } of invalidCases) {
        const result = validateRecipientPhone(phone);
        assert.equal(result.valid, false);
        assert.equal(result.message, expectedMsg);
      }
    });

    it('automatically trims whitespace around phone number', () => {
      const result = validateRecipientPhone('  13812345678  ');
      assert.equal(result.valid, true);
    });
  });

  describe('2. Phone Masking Utility (maskPhone)', () => {
    it('masks the middle 4 digits of 11-digit phone numbers', () => {
      assert.equal(maskPhone('13812345678'), '138****5678');
      assert.equal(maskPhone('18987654321'), '189****4321');
    });

    it('handles invalid length or undefined phone safely', () => {
      assert.equal(maskPhone(''), '-');
      assert.equal(maskPhone(undefined), '-');
      assert.equal(maskPhone('12345'), '12345');
    });
  });

  describe('3. Key Validity Evaluation (isKeyCurrentlyValid)', () => {
    const baseKey: DigitalKeyDto = {
      id: 'test-key-01',
      keyNumber: 'KEY-TEST-001',
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
      permissions: [CommandCode.CMD_LOCK, CommandCode.CMD_UNLOCK],
      createdAt: '2026-10-01 00:00:00',
    };

    it('evaluates true for ACTIVE key within date range and within usage limit', () => {
      const now = new Date('2026-10-15T10:00:00Z');
      assert.equal(isKeyCurrentlyValid(baseKey, now), true);
    });

    it('evaluates true for ACTIVE key with unlimited usage (no maxUsageCount)', () => {
      const unlimitedKey: DigitalKeyDto = {
        ...baseKey,
        maxUsageCount: undefined,
        usedCount: 999,
      };
      const now = new Date('2026-10-15T10:00:00Z');
      assert.equal(isKeyCurrentlyValid(unlimitedKey, now), true);
    });

    it('evaluates false when status is not ACTIVE', () => {
      const now = new Date('2026-10-15T10:00:00Z');
      assert.equal(isKeyCurrentlyValid({ ...baseKey, status: 'PENDING' }, now), false);
      assert.equal(isKeyCurrentlyValid({ ...baseKey, status: 'EXPIRED' }, now), false);
      assert.equal(isKeyCurrentlyValid({ ...baseKey, status: 'REVOKED' }, now), false);
    });

    it('evaluates false when current time is outside valid range', () => {
      const beforeStart = new Date('2026-09-20 00:00:00');
      const afterEnd = new Date('2026-11-10 00:00:00');
      assert.equal(isKeyCurrentlyValid(baseKey, beforeStart), false);
      assert.equal(isKeyCurrentlyValid(baseKey, afterEnd), false);
    });

    it('evaluates false when usage limit has been reached or exceeded', () => {
      const now = new Date('2026-10-15T10:00:00Z');
      assert.equal(isKeyCurrentlyValid({ ...baseKey, maxUsageCount: 10, usedCount: 10 }, now), false);
      assert.equal(isKeyCurrentlyValid({ ...baseKey, maxUsageCount: 10, usedCount: 11 }, now), false);
    });
  });

  describe('4. Lifecycle State Machine Transition Guard (isValidKeyStatusTransition)', () => {
    it('allows valid transitions from PENDING state', () => {
      assert.equal(isValidKeyStatusTransition('PENDING', 'ACTIVE'), true);
      assert.equal(isValidKeyStatusTransition('PENDING', 'REVOKED'), true);
      assert.equal(isValidKeyStatusTransition('PENDING', 'EXPIRED'), true);
      assert.equal(isValidKeyStatusTransition('PENDING', 'PENDING'), true);
    });

    it('allows valid transitions from ACTIVE state', () => {
      assert.equal(isValidKeyStatusTransition('ACTIVE', 'EXPIRED'), true);
      assert.equal(isValidKeyStatusTransition('ACTIVE', 'REVOKED'), true);
      assert.equal(isValidKeyStatusTransition('ACTIVE', 'ACTIVE'), true);
      // Disallows returning to PENDING
      assert.equal(isValidKeyStatusTransition('ACTIVE', 'PENDING'), false);
    });

    it('strictly protects REVOKED as irreversible terminal state', () => {
      assert.equal(isValidKeyStatusTransition('REVOKED', 'ACTIVE'), false);
      assert.equal(isValidKeyStatusTransition('REVOKED', 'PENDING'), false);
      assert.equal(isValidKeyStatusTransition('REVOKED', 'EXPIRED'), false);
      assert.equal(isValidKeyStatusTransition('REVOKED', 'REVOKED'), false);
    });

    it('strictly protects EXPIRED as irreversible terminal state', () => {
      assert.equal(isValidKeyStatusTransition('EXPIRED', 'ACTIVE'), false);
      assert.equal(isValidKeyStatusTransition('EXPIRED', 'PENDING'), false);
      assert.equal(isValidKeyStatusTransition('EXPIRED', 'REVOKED'), false);
      assert.equal(isValidKeyStatusTransition('EXPIRED', 'EXPIRED'), false);
    });
  });

  describe('5. KPI & Statistics Calculation (calculateDigitalKeyStats)', () => {
    it('accurately calculates status and type statistics across key seeds', () => {
      const stats = calculateDigitalKeyStats(SEED_DIGITAL_KEYS);
      assert.equal(stats.totalCount, SEED_DIGITAL_KEYS.length);
      assert.ok(stats.activeCount > 0);
      assert.ok(stats.expiredCount > 0);
      assert.ok(stats.revokedCount > 0);
      assert.ok(stats.typeDistribution.BLE > 0);
      assert.ok(stats.typeDistribution.CLOUD > 0);
      assert.ok(stats.typeDistribution.NFC > 0);
      assert.ok(stats.totalUsageCount > 0);
      assert.equal(
        stats.totalCount,
        stats.activeCount + stats.expiredCount + stats.revokedCount + stats.pendingCount
      );
    });

    it('handles empty key list safely without NaN or crashes', () => {
      const emptyStats = calculateDigitalKeyStats([]);
      assert.deepEqual(emptyStats, {
        totalCount: 0,
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
      });
    });
  });

  describe('6. Multi-dimensional Filtering Pipeline (filterDigitalKeys)', () => {
    it('returns all keys when query is empty or undefined', () => {
      const result = filterDigitalKeys(SEED_DIGITAL_KEYS);
      assert.equal(result.length, SEED_DIGITAL_KEYS.length);
    });

    it('filters by keyword across plateNumber, recipientName, phone and keyNumber', () => {
      const byPlate = filterDigitalKeys(SEED_DIGITAL_KEYS, { keyword: '粤B·88888' });
      assert.ok(byPlate.length > 0);
      assert.ok(byPlate.every((k) => k.plateNumber.includes('粤B·88888')));

      const byRecipient = filterDigitalKeys(SEED_DIGITAL_KEYS, { keyword: '李' });
      assert.ok(byRecipient.length > 0);

      const byKeyNumber = filterDigitalKeys(SEED_DIGITAL_KEYS, { keyword: 'KEY-202610-001' });
      assert.equal(byKeyNumber.length, 1);
      assert.equal(byKeyNumber[0]?.keyNumber, 'KEY-202610-001');
    });

    it('filters strictly by keyType (BLE, CLOUD, NFC)', () => {
      const bleKeys = filterDigitalKeys(SEED_DIGITAL_KEYS, { keyType: 'BLE' });
      assert.ok(bleKeys.length > 0);
      assert.ok(bleKeys.every((k) => k.keyType === 'BLE'));

      const nfcKeys = filterDigitalKeys(SEED_DIGITAL_KEYS, { keyType: 'NFC' });
      assert.ok(nfcKeys.length > 0);
      assert.ok(nfcKeys.every((k) => k.keyType === 'NFC'));
    });

    it('filters strictly by status (ACTIVE, REVOKED, EXPIRED, PENDING)', () => {
      const activeKeys = filterDigitalKeys(SEED_DIGITAL_KEYS, { status: 'ACTIVE' });
      assert.ok(activeKeys.length > 0);
      assert.ok(activeKeys.every((k) => k.status === 'ACTIVE'));

      const revokedKeys = filterDigitalKeys(SEED_DIGITAL_KEYS, { status: 'REVOKED' });
      assert.ok(revokedKeys.length > 0);
      assert.ok(revokedKeys.every((k) => k.status === 'REVOKED'));
    });

    it('filters strictly by vehicleId', () => {
      const veh1Keys = filterDigitalKeys(SEED_DIGITAL_KEYS, { vehicleId: 'veh-001' });
      assert.ok(veh1Keys.length > 0);
      assert.ok(veh1Keys.every((k) => k.vehicleId === 'veh-001'));
    });
  });

  describe('7. Expiration Countdown & Helper Utilities', () => {
    it('detects keys expiring within specified hours threshold', () => {
      const now = new Date('2026-10-15T12:00:00Z');
      const expiringSoonKey: DigitalKeyDto = {
        ...SEED_DIGITAL_KEYS[0]!,
        status: 'ACTIVE',
        endTime: '2026-10-16T08:00:00Z', // 20 hours remaining
      };
      const notExpiringSoonKey: DigitalKeyDto = {
        ...SEED_DIGITAL_KEYS[0]!,
        status: 'ACTIVE',
        endTime: '2026-10-20T12:00:00Z', // 5 days remaining
      };

      assert.equal(isKeyExpiringSoon(expiringSoonKey, 24, now), true);
      assert.equal(isKeyExpiringSoon(notExpiringSoonKey, 24, now), false);
    });

    it('calculates remaining hours accurately', () => {
      const now = new Date('2026-10-15T12:00:00Z');
      const endTime = '2026-10-16T00:00:00Z'; // 12 hours later
      assert.equal(calculateRemainingHours(endTime, now), 12);

      const pastEndTime = '2026-10-14T00:00:00Z'; // in the past
      assert.equal(calculateRemainingHours(pastEndTime, now), 0);
    });

    it('generates simulated SHA-256 certificate fingerprint consistently', () => {
      const fp1 = generateSimulatedCertificateFingerprint('KEY-202610-001');
      const fp2 = generateSimulatedCertificateFingerprint('KEY-202610-001');
      assert.equal(fp1, fp2);
      assert.ok(fp1.startsWith('SHA256:'));
      assert.ok(fp1.includes(':'));
    });

    it('provides metadata dictionary for all types and statuses', () => {
      const types: DigitalKeyType[] = ['BLE', 'CLOUD', 'NFC'];
      for (const t of types) {
        assert.ok(DIGITAL_KEY_TYPE_META[t].label);
        assert.ok(DIGITAL_KEY_TYPE_META[t].tagColor);
      }

      const statuses: DigitalKeyStatus[] = ['PENDING', 'ACTIVE', 'EXPIRED', 'REVOKED'];
      for (const s of statuses) {
        assert.ok(DIGITAL_KEY_STATUS_META[s].label);
        assert.ok(DIGITAL_KEY_STATUS_META[s].tagColor);
      }
    });
  });

  describe('8. API Client Methods & Offline Fallback (api/digital-key.ts)', () => {
    it('fetchDigitalKeysApi returns list and respects query filters', async () => {
      const all = await fetchDigitalKeysApi();
      assert.ok(all.length >= 5);

      const bleOnly = await fetchDigitalKeysApi({ keyType: 'BLE' });
      assert.ok(bleOnly.every((k) => k.keyType === 'BLE'));
    });

    it('fetchDigitalKeyDetailApi returns key by ID and throws 404 for unknown ID', async () => {
      const first = (await fetchDigitalKeysApi())[0]!;
      const detail = await fetchDigitalKeyDetailApi(first.id);
      assert.equal(detail.id, first.id);
      assert.equal(detail.keyNumber, first.keyNumber);

      await assert.rejects(
        async () => {
          await fetchDigitalKeyDetailApi('non-existent-key-id');
        },
        (err: unknown) => {
          return err instanceof ApiError && err.statusCode === 404;
        }
      );
    });

    it('createDigitalKeyApi creates a key and inserts into in-memory state pool', async () => {
      const input: CreateDigitalKeyInput = {
        vehicleId: 'veh-001',
        plateNumber: '粤B·88888',
        vin: 'LSVAA4188P1002341',
        ownerName: '张建国',
        ownerPhone: '13800138000',
        recipientName: '周志强',
        recipientPhone: '13812349999',
        keyType: 'BLE',
        startTime: '2026-10-15 00:00:00',
        endTime: '2026-10-25 23:59:59',
        maxUsageCount: 5,
        permissions: [CommandCode.CMD_LOCK, CommandCode.CMD_UNLOCK, CommandCode.CMD_FIND_VEHICLE],
      };

      const created = await createDigitalKeyApi(input);
      assert.ok(created.id);
      assert.ok(created.keyNumber.startsWith('KEY-'));
      assert.equal(created.recipientName, '周志强');
      assert.equal(created.status, 'ACTIVE');
      assert.equal(created.usedCount, 0);

      // Verify in-memory state contains created key
      const keys = await fetchDigitalKeysApi();
      const found = keys.find((k) => k.id === created.id);
      assert.ok(found);
    });

    it('revokeDigitalKeyApi updates status to REVOKED with reason and revokedAt', async () => {
      const activeKey = (await fetchDigitalKeysApi()).find((k) => k.status === 'ACTIVE')!;
      const revoked = await revokeDigitalKeyApi(activeKey.id, '车主申请提前收回钥匙权限');
      assert.equal(revoked.id, activeKey.id);
      assert.equal(revoked.status, 'REVOKED');
      assert.equal(revoked.revokedReason, '车主申请提前收回钥匙权限');
      assert.ok(revoked.revokedAt);

      // Verify state transition guard rejects revoking an already REVOKED key
      await assert.rejects(
        async () => {
          await revokeDigitalKeyApi(activeKey.id, '再次作废');
        },
        (err: unknown) => {
          return err instanceof ApiError && err.statusCode === 400;
        }
      );
    });

    it('fetchVehicleKeyHistoryApi returns keys specifically assigned to the vehicle', async () => {
      const history = await fetchVehicleKeyHistoryApi('veh-001');
      assert.ok(history.length > 0);
      assert.ok(history.every((k) => k.vehicleId === 'veh-001'));
    });
  });
});
