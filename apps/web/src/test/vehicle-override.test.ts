import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CommandCode, SecurityLevel } from '@car-control/contracts';
import {
  type VehicleCapabilityOverrideDto,
  type VehicleEffectiveCommandItem,
  type VehicleOverrideSummaryDto,
  resolveVehicleEffectiveList,
  calculateOverrideSummary,
  cleanRedundantOverrides,
  isRuleEqual,
  SEED_VEHICLE_OVERRIDES,
} from '../views/command/vehicle-override-core.ts';
import {
  SEED_CAPABILITY_TEMPLATES,
  createDefaultCapabilities,
  type ModelTemplateDto,
  type CapabilityRule,
  CommandCategory,
} from '../views/command/capability-core.ts';
import {
  fetchVehicleOverrideApi,
  saveVehicleOverrideApi,
  resetVehicleOverrideApi,
  getInMemoryVehicleOverrides,
  setInMemoryVehicleOverrides,
  resetInMemoryVehicleOverrides,
} from '../api/vehicle-override.ts';
import { ApiError, http } from '../api/client.ts';

describe('Vehicle Capability Override Core & TDD Test Suite', () => {
  const baseTemplate: ModelTemplateDto = SEED_CAPABILITY_TEMPLATES[0]; // EV Flagship

  beforeEach(() => {
    resetInMemoryVehicleOverrides();
  });

  describe('1. Rule Equality Checker (isRuleEqual)', () => {
    it('returns true when two rules are identical in all fields', () => {
      const ruleA: CapabilityRule = {
        supported: true,
        securityLevel: SecurityLevel.L1,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
        paramConstraints: { minTemp: 16, maxTemp: 30 },
      };
      const ruleB: CapabilityRule = {
        supported: true,
        securityLevel: SecurityLevel.L1,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
        paramConstraints: { maxTemp: 30, minTemp: 16 }, // key-order invariant
      };
      assert.equal(isRuleEqual(ruleA, ruleB), true);
    });

    it('detects differences in supported status', () => {
      const ruleA: CapabilityRule = {
        supported: true,
        securityLevel: SecurityLevel.L1,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
      };
      const ruleB: CapabilityRule = {
        ...ruleA,
        supported: false,
      };
      assert.equal(isRuleEqual(ruleA, ruleB), false);
    });

    it('detects differences in security level', () => {
      const ruleA: CapabilityRule = {
        supported: true,
        securityLevel: SecurityLevel.L1,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
      };
      const ruleB: CapabilityRule = {
        ...ruleA,
        securityLevel: SecurityLevel.L2,
      };
      assert.equal(isRuleEqual(ruleA, ruleB), false);
    });

    it('detects differences in timeoutMs and frequencyLimitSeconds', () => {
      const ruleA: CapabilityRule = {
        supported: true,
        securityLevel: SecurityLevel.L0,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
      };
      const ruleB: CapabilityRule = {
        ...ruleA,
        timeoutMs: 15000,
      };
      const ruleC: CapabilityRule = {
        ...ruleA,
        frequencyLimitSeconds: 0,
      };
      assert.equal(isRuleEqual(ruleA, ruleB), false);
      assert.equal(isRuleEqual(ruleA, ruleC), false);
    });

    it('detects differences in nested paramConstraints', () => {
      const ruleA: CapabilityRule = {
        supported: true,
        securityLevel: SecurityLevel.L1,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
        paramConstraints: { durationMin: 5, durationMax: 30 },
      };
      const ruleB: CapabilityRule = {
        supported: true,
        securityLevel: SecurityLevel.L1,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
        paramConstraints: { durationMin: 5, durationMax: 45 },
      };
      assert.equal(isRuleEqual(ruleA, ruleB), false);
    });
  });

  describe('2. Effective Capability Resolution Pipeline (resolveVehicleEffectiveList)', () => {
    it('returns all 13 command items with isOverridden = false when no override is provided', () => {
      const result = resolveVehicleEffectiveList(baseTemplate, null);

      assert.equal(result.length, 13);
      for (const item of result) {
        assert.equal(item.isOverridden, false);
        assert.equal(item.differsFromTemplate, false);
        assert.deepEqual(item.effectiveRule, item.templateRule);
        assert.ok(item.category);
        assert.equal(item.overrideReason, undefined);
      }
    });

    it('applies per-command overrides correctly when override record exists', () => {
      const overrideDto: VehicleCapabilityOverrideDto = {
        id: 'override-test-01',
        vehicleId: 'veh-001',
        vin: 'LFPH2E023N1000001',
        plateNumber: '粤B·88888',
        modelId: baseTemplate.modelId,
        updatedAt: '2026-10-14 10:00:00',
        overrides: {
          [CommandCode.CMD_ENGINE_START]: {
            supported: false,
            securityLevel: SecurityLevel.L2,
            timeoutMs: 20000,
            frequencyLimitSeconds: 30,
            description: '测试车辆防盗限制：单车禁止远程点火',
          },
          [CommandCode.CMD_FIND_VEHICLE]: {
            supported: true,
            securityLevel: SecurityLevel.L0,
            timeoutMs: 8000,
            frequencyLimitSeconds: 0,
            description: 'VIP 专属快速寻车免冷却',
          },
        },
      };

      const result = resolveVehicleEffectiveList(baseTemplate, overrideDto);
      assert.equal(result.length, 13);

      const engineStartItem = result.find((i) => i.commandCode === CommandCode.CMD_ENGINE_START);
      assert.ok(engineStartItem);
      assert.equal(engineStartItem.isOverridden, true);
      assert.equal(engineStartItem.differsFromTemplate, true);
      assert.equal(engineStartItem.effectiveRule.supported, false);
      assert.equal(engineStartItem.templateRule.supported, true);
      assert.equal(engineStartItem.overrideReason, '测试车辆防盗限制：单车禁止远程点火');

      const findVehItem = result.find((i) => i.commandCode === CommandCode.CMD_FIND_VEHICLE);
      assert.ok(findVehItem);
      assert.equal(findVehItem.isOverridden, true);
      assert.equal(findVehItem.differsFromTemplate, true);
      assert.equal(findVehItem.effectiveRule.frequencyLimitSeconds, 0);
      assert.equal(findVehItem.templateRule.frequencyLimitSeconds, 5);

      const lockItem = result.find((i) => i.commandCode === CommandCode.CMD_LOCK);
      assert.ok(lockItem);
      assert.equal(lockItem.isOverridden, false);
      assert.equal(lockItem.differsFromTemplate, false);
      assert.deepEqual(lockItem.effectiveRule, lockItem.templateRule);
    });

    it('marks differsFromTemplate = false when override is present but rules are strictly identical', () => {
      const templateLockRule = baseTemplate.capabilities[CommandCode.CMD_LOCK];
      const overrideDto: VehicleCapabilityOverrideDto = {
        id: 'override-test-02',
        vehicleId: 'veh-002',
        vin: 'LFPH2E023N1000002',
        plateNumber: '粤B·D12345',
        modelId: baseTemplate.modelId,
        updatedAt: '2026-10-14 10:00:00',
        overrides: {
          [CommandCode.CMD_LOCK]: {
            ...templateLockRule,
          },
        },
      };

      const result = resolveVehicleEffectiveList(baseTemplate, overrideDto);
      const lockItem = result.find((i) => i.commandCode === CommandCode.CMD_LOCK)!;

      assert.equal(lockItem.isOverridden, true);
      assert.equal(lockItem.differsFromTemplate, false);
    });

    it('maps all 4 command categories correctly for the 13 command items', () => {
      const result = resolveVehicleEffectiveList(baseTemplate, null);
      const catCount: Record<CommandCategory, number> = {
        [CommandCategory.DOOR_BODY]: 0,
        [CommandCategory.POWER_FIND]: 0,
        [CommandCategory.CABIN_CLIMATE]: 0,
        [CommandCategory.WINDOW_ROOF]: 0,
      };

      for (const item of result) {
        catCount[item.category]++;
      }

      assert.equal(catCount[CommandCategory.DOOR_BODY], 4);
      assert.equal(catCount[CommandCategory.POWER_FIND], 3);
      assert.equal(catCount[CommandCategory.CABIN_CLIMATE], 3);
      assert.equal(catCount[CommandCategory.WINDOW_ROOF], 3);
    });
  });

  describe('3. Redundant Override Pruning (cleanRedundantOverrides)', () => {
    it('prunes overrides that are completely identical to the template', () => {
      const templateLockRule = baseTemplate.capabilities[CommandCode.CMD_LOCK];
      const templateUnlockRule = baseTemplate.capabilities[CommandCode.CMD_UNLOCK];

      const rawOverrides: Partial<Record<CommandCode, CapabilityRule>> = {
        [CommandCode.CMD_LOCK]: { ...templateLockRule },
        [CommandCode.CMD_UNLOCK]: { ...templateUnlockRule },
        [CommandCode.CMD_ENGINE_START]: {
          ...baseTemplate.capabilities[CommandCode.CMD_ENGINE_START],
          supported: false,
        },
      };

      const cleaned = cleanRedundantOverrides(rawOverrides, baseTemplate);

      assert.equal(CommandCode.CMD_LOCK in cleaned, false);
      assert.equal(CommandCode.CMD_UNLOCK in cleaned, false);
      assert.equal(CommandCode.CMD_ENGINE_START in cleaned, true);
      assert.equal(cleaned[CommandCode.CMD_ENGINE_START]?.supported, false);
    });

    it('returns empty object when all overrides match template rules', () => {
      const rawOverrides: Partial<Record<CommandCode, CapabilityRule>> = {
        [CommandCode.CMD_LOCK]: { ...baseTemplate.capabilities[CommandCode.CMD_LOCK] },
        [CommandCode.CMD_AC_START]: { ...baseTemplate.capabilities[CommandCode.CMD_AC_START] },
      };

      const cleaned = cleanRedundantOverrides(rawOverrides, baseTemplate);
      assert.deepEqual(cleaned, {});
    });

    it('preserves all genuine differences in timeout, security level, or param constraints', () => {
      const rawOverrides: Partial<Record<CommandCode, CapabilityRule>> = {
        [CommandCode.CMD_AC_START]: {
          ...baseTemplate.capabilities[CommandCode.CMD_AC_START],
          timeoutMs: 30000, // modified timeout
        },
        [CommandCode.CMD_LOCK]: {
          ...baseTemplate.capabilities[CommandCode.CMD_LOCK],
          securityLevel: SecurityLevel.L1, // elevated security
        },
      };

      const cleaned = cleanRedundantOverrides(rawOverrides, baseTemplate);
      assert.equal(Object.keys(cleaned).length, 2);
      assert.equal(cleaned[CommandCode.CMD_AC_START]?.timeoutMs, 30000);
      assert.equal(cleaned[CommandCode.CMD_LOCK]?.securityLevel, SecurityLevel.L1);
    });
  });

  describe('4. Override KPI & Summary Calculation (calculateOverrideSummary)', () => {
    it('calculates 0 overrides and 0 differences for untouched template items', () => {
      const items = resolveVehicleEffectiveList(baseTemplate, null);
      const summary = calculateOverrideSummary(items);

      assert.equal(summary.totalCommands, 13);
      assert.equal(summary.overriddenCount, 0);
      assert.equal(summary.differsCount, 0);
      assert.equal(summary.hasOverrides, false);
      assert.equal(summary.hasDifferences, false);
      assert.equal(summary.disabledCount, 0); // EV Flagship has 13 supported
      assert.equal(summary.l2GuardedCount, 2); // CMD_ENGINE_START, CMD_ENGINE_STOP
    });

    it('calculates metrics accurately with mixed overrides and disabled commands', () => {
      const overrideDto: VehicleCapabilityOverrideDto = {
        id: 'override-test-03',
        vehicleId: 'veh-001',
        vin: 'LFPH2E023N1000001',
        plateNumber: '粤B·88888',
        modelId: baseTemplate.modelId,
        updatedAt: '2026-10-14 10:00:00',
        overrides: {
          [CommandCode.CMD_ENGINE_START]: {
            ...baseTemplate.capabilities[CommandCode.CMD_ENGINE_START],
            supported: false, // 1 disabled
          },
          [CommandCode.CMD_WINDOW_OPEN]: {
            ...baseTemplate.capabilities[CommandCode.CMD_WINDOW_OPEN],
            supported: false, // 2 disabled
          },
          [CommandCode.CMD_LOCK]: {
            ...baseTemplate.capabilities[CommandCode.CMD_LOCK],
            securityLevel: SecurityLevel.L2, // 1 extra L2
          },
          [CommandCode.CMD_UNLOCK]: {
            ...baseTemplate.capabilities[CommandCode.CMD_UNLOCK], // identical to template
          },
        },
      };

      const items = resolveVehicleEffectiveList(baseTemplate, overrideDto);
      const summary = calculateOverrideSummary(items);

      assert.equal(summary.totalCommands, 13);
      assert.equal(summary.overriddenCount, 4);
      assert.equal(summary.differsCount, 3); // ENGINE_START, WINDOW_OPEN, LOCK differ; UNLOCK is identical
      assert.equal(summary.hasOverrides, true);
      assert.equal(summary.hasDifferences, true);
      assert.equal(summary.disabledCount, 2);
      assert.equal(summary.l2GuardedCount, 3); // ENGINE_START (L2), ENGINE_STOP (L2), LOCK (elevated to L2)
    });
  });

  describe('5. Seed Vehicle Overrides (SEED_VEHICLE_OVERRIDES)', () => {
    it('provides valid seeds with expected test vehicle constraints', () => {
      assert.ok(Array.isArray(SEED_VEHICLE_OVERRIDES));
      assert.ok(SEED_VEHICLE_OVERRIDES.length >= 2);

      const testVeh = SEED_VEHICLE_OVERRIDES.find((o) => o.vehicleId === 'veh-001');
      assert.ok(testVeh, 'veh-001 seed must exist');
      assert.ok(testVeh.overrides[CommandCode.CMD_ENGINE_START], 'veh-001 must override CMD_ENGINE_START');
      assert.equal(testVeh.overrides[CommandCode.CMD_ENGINE_START]?.supported, false);
      assert.ok(testVeh.overrides[CommandCode.CMD_ENGINE_START]?.description);

      const vipVeh = SEED_VEHICLE_OVERRIDES.find((o) => o.vehicleId === 'veh-004');
      assert.ok(vipVeh, 'veh-004 VIP seed must exist');
      assert.ok(vipVeh.overrides[CommandCode.CMD_FIND_VEHICLE]);
      assert.equal(vipVeh.overrides[CommandCode.CMD_FIND_VEHICLE]?.frequencyLimitSeconds, 0);
    });

    it('ensures all seed override records have valid IDs, timestamps, and vehicle metadata', () => {
      for (const seed of SEED_VEHICLE_OVERRIDES) {
        assert.ok(seed.id.startsWith('override-'));
        assert.ok(seed.vehicleId.startsWith('veh-'));
        assert.ok(seed.vin.length === 17);
        assert.ok(seed.plateNumber.length >= 7);
        assert.ok(seed.modelId.length > 0);
        assert.ok(seed.updatedAt.length > 0);
      }
    });
  });

  describe('6. API Client Integration & Offline Fallback (api/vehicle-override.ts)', () => {
    it('fetchVehicleOverrideApi returns seed override for veh-001 and null for unconfigured vehicle', async () => {
      const veh001 = await fetchVehicleOverrideApi('veh-001');
      assert.ok(veh001);
      assert.equal(veh001.vehicleId, 'veh-001');
      assert.equal(veh001.overrides[CommandCode.CMD_ENGINE_START]?.supported, false);

      const unconfigured = await fetchVehicleOverrideApi('veh-999-empty');
      assert.equal(unconfigured, null);
    });

    it('saveVehicleOverrideApi updates existing override in memory fallback', async () => {
      const newOverrides: Partial<Record<CommandCode, CapabilityRule>> = {
        [CommandCode.CMD_TRUNK_OPEN]: {
          ...baseTemplate.capabilities[CommandCode.CMD_TRUNK_OPEN],
          supported: false,
          description: '尾门电机硬件异常临时禁用',
        },
      };

      const saved = await saveVehicleOverrideApi('veh-001', newOverrides, '故障隔离');
      assert.ok(saved);
      assert.equal(saved.vehicleId, 'veh-001');
      assert.equal(saved.overrides[CommandCode.CMD_TRUNK_OPEN]?.supported, false);

      // Verify persistence in in-memory store
      const fetched = await fetchVehicleOverrideApi('veh-001');
      assert.ok(fetched);
      assert.equal(fetched.overrides[CommandCode.CMD_TRUNK_OPEN]?.supported, false);
      assert.equal(fetched.overrides[CommandCode.CMD_ENGINE_START], undefined); // replaced
    });

    it('saveVehicleOverrideApi creates new override record for vehicle without prior override', async () => {
      const newOverrides: Partial<Record<CommandCode, CapabilityRule>> = {
        [CommandCode.CMD_SUNROOF_CONTROL]: {
          ...baseTemplate.capabilities[CommandCode.CMD_SUNROOF_CONTROL],
          supported: false,
          description: '天窗滑轨润滑维保，单车禁用',
        },
      };

      const saved = await saveVehicleOverrideApi('veh-002', newOverrides);
      assert.ok(saved);
      assert.equal(saved.vehicleId, 'veh-002');
      assert.equal(saved.overrides[CommandCode.CMD_SUNROOF_CONTROL]?.supported, false);

      const inStore = getInMemoryVehicleOverrides().find((o) => o.vehicleId === 'veh-002');
      assert.ok(inStore);
    });

    it('resetVehicleOverrideApi clears override for vehicle and returns true', async () => {
      const before = await fetchVehicleOverrideApi('veh-001');
      assert.ok(before);

      const resetOk = await resetVehicleOverrideApi('veh-001');
      assert.equal(resetOk, true);

      const after = await fetchVehicleOverrideApi('veh-001');
      assert.equal(after, null);
    });

    it('re-throws ApiError when server encounters real business error', async () => {
      const originalPut = http.put.bind(http);
      try {
        http.put = async () => {
          throw new ApiError('Tenant permission denied', 403, 'Forbidden');
        };

        await assert.rejects(
          async () => {
            await saveVehicleOverrideApi('veh-001', {});
          },
          (err: any) => {
            assert.ok(err instanceof ApiError);
            assert.equal(err.statusCode, 403);
            assert.equal(err.message, 'Tenant permission denied');
            return true;
          }
        );
      } finally {
        http.put = originalPut;
      }
    });

    it('resetInMemoryVehicleOverrides restores initial seeds', async () => {
      await resetVehicleOverrideApi('veh-001');
      assert.equal(await fetchVehicleOverrideApi('veh-001'), null);

      resetInMemoryVehicleOverrides();
      const restored = await fetchVehicleOverrideApi('veh-001');
      assert.ok(restored);
      assert.equal(restored.vehicleId, 'veh-001');
    });
  });
});
