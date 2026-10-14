import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CommandCode, SecurityLevel } from '@car-control/contracts';
import {
  CommandCategory,
  COMMAND_CATEGORY_MAP,
  getCategoryForCommand,
  validateTimeoutMs,
  validateFrequencyLimit,
  validateParamConstraints,
  calculateTemplateStats,
  diffCapabilityTemplates,
  cloneModelTemplate,
  SEED_CAPABILITY_TEMPLATES,
  type CapabilityRule,
  type ModelTemplateDto,
  type CreateCapabilityTemplateInput,
} from '../views/command/capability-core.ts';
import {
  fetchCapabilityTemplatesApi,
  fetchCapabilityTemplateByModelApi,
  updateCapabilityTemplateApi,
  createCapabilityTemplateApi,
  cloneCapabilityTemplateApi,
  resetInMemoryCapabilityTemplates,
  getInMemoryCapabilityTemplates,
} from '../api/capability.ts';
import { ApiError, http } from '../api/client.ts';

describe('Model Capability Template Center Core & TDD Test Suite', () => {
  beforeEach(() => {
    resetInMemoryCapabilityTemplates();
  });

  describe('1. Command Category Definitions & Metadata Mapping', () => {
    it('defines all 4 core business command categories', () => {
      const categories = [
        CommandCategory.DOOR_BODY,
        CommandCategory.POWER_FIND,
        CommandCategory.CABIN_CLIMATE,
        CommandCategory.WINDOW_ROOF,
      ];
      assert.equal(categories.length, 4);

      for (const cat of categories) {
        const meta = COMMAND_CATEGORY_MAP[cat];
        assert.ok(meta, `Category ${cat} must have metadata`);
        assert.equal(meta.key, cat);
        assert.ok(meta.label.length > 0);
        assert.ok(meta.color.startsWith('#'));
        assert.ok(meta.tagColor.length > 0);
        assert.ok(meta.commandCodes.length > 0);
      }
    });

    it('maps all 13 CommandCodes exactly once without duplication or omission', () => {
      const all13Codes: CommandCode[] = [
        CommandCode.CMD_LOCK,
        CommandCode.CMD_UNLOCK,
        CommandCode.CMD_TRUNK_OPEN,
        CommandCode.CMD_TRUNK_CLOSE,
        CommandCode.CMD_FIND_VEHICLE,
        CommandCode.CMD_ENGINE_START,
        CommandCode.CMD_ENGINE_STOP,
        CommandCode.CMD_AC_START,
        CommandCode.CMD_AC_STOP,
        CommandCode.CMD_SEAT_HEAT,
        CommandCode.CMD_WINDOW_OPEN,
        CommandCode.CMD_WINDOW_CLOSE,
        CommandCode.CMD_SUNROOF_CONTROL,
      ];

      const categorizedCodes: CommandCode[] = [];
      for (const cat of Object.values(CommandCategory)) {
        categorizedCodes.push(...COMMAND_CATEGORY_MAP[cat].commandCodes);
      }

      assert.equal(categorizedCodes.length, 13);
      const uniqueCodes = new Set(categorizedCodes);
      assert.equal(uniqueCodes.size, 13);

      for (const code of all13Codes) {
        assert.ok(uniqueCodes.has(code), `CommandCode ${code} must be mapped`);
        const cat = getCategoryForCommand(code);
        assert.ok(cat, `getCategoryForCommand must return a valid category for ${code}`);
      }
    });

    it('correctly maps specific command codes to their intended categories', () => {
      assert.equal(getCategoryForCommand(CommandCode.CMD_LOCK), CommandCategory.DOOR_BODY);
      assert.equal(getCategoryForCommand(CommandCode.CMD_UNLOCK), CommandCategory.DOOR_BODY);
      assert.equal(getCategoryForCommand(CommandCode.CMD_TRUNK_OPEN), CommandCategory.DOOR_BODY);
      assert.equal(getCategoryForCommand(CommandCode.CMD_TRUNK_CLOSE), CommandCategory.DOOR_BODY);

      assert.equal(getCategoryForCommand(CommandCode.CMD_FIND_VEHICLE), CommandCategory.POWER_FIND);
      assert.equal(getCategoryForCommand(CommandCode.CMD_ENGINE_START), CommandCategory.POWER_FIND);
      assert.equal(getCategoryForCommand(CommandCode.CMD_ENGINE_STOP), CommandCategory.POWER_FIND);

      assert.equal(getCategoryForCommand(CommandCode.CMD_AC_START), CommandCategory.CABIN_CLIMATE);
      assert.equal(getCategoryForCommand(CommandCode.CMD_AC_STOP), CommandCategory.CABIN_CLIMATE);
      assert.equal(getCategoryForCommand(CommandCode.CMD_SEAT_HEAT), CommandCategory.CABIN_CLIMATE);

      assert.equal(getCategoryForCommand(CommandCode.CMD_WINDOW_OPEN), CommandCategory.WINDOW_ROOF);
      assert.equal(getCategoryForCommand(CommandCode.CMD_WINDOW_CLOSE), CommandCategory.WINDOW_ROOF);
      assert.equal(getCategoryForCommand(CommandCode.CMD_SUNROOF_CONTROL), CommandCategory.WINDOW_ROOF);
    });
  });

  describe('2. Parameter Validation Pure Functions', () => {
    describe('validateTimeoutMs', () => {
      it('accepts integer timeout between 3,000ms and 60,000ms', () => {
        assert.equal(validateTimeoutMs(3000).valid, true);
        assert.equal(validateTimeoutMs(10000).valid, true);
        assert.equal(validateTimeoutMs(15000).valid, true);
        assert.equal(validateTimeoutMs(60000).valid, true);
      });

      it('rejects values below 3,000ms', () => {
        const res = validateTimeoutMs(2999);
        assert.equal(res.valid, false);
        assert.ok(res.message?.includes('3,000') || res.message?.includes('3000'));

        assert.equal(validateTimeoutMs(0).valid, false);
        assert.equal(validateTimeoutMs(-1000).valid, false);
      });

      it('rejects values above 60,000ms', () => {
        const res = validateTimeoutMs(60001);
        assert.equal(res.valid, false);
        assert.ok(res.message?.includes('60,000') || res.message?.includes('60000'));
      });

      it('rejects floats, NaN, and non-number inputs', () => {
        assert.equal(validateTimeoutMs(5000.5).valid, false);
        assert.equal(validateTimeoutMs(NaN).valid, false);
        assert.equal(validateTimeoutMs(undefined as unknown as number).valid, false);
      });
    });

    describe('validateFrequencyLimit', () => {
      it('accepts frequency limit between 0s and 300s', () => {
        assert.equal(validateFrequencyLimit(0).valid, true);
        assert.equal(validateFrequencyLimit(5).valid, true);
        assert.equal(validateFrequencyLimit(60).valid, true);
        assert.equal(validateFrequencyLimit(300).valid, true);
      });

      it('rejects negative limits', () => {
        const res = validateFrequencyLimit(-1);
        assert.equal(res.valid, false);
        assert.ok(res.message?.includes('0'));
      });

      it('rejects limits exceeding 300 seconds', () => {
        const res = validateFrequencyLimit(301);
        assert.equal(res.valid, false);
        assert.ok(res.message?.includes('300'));
      });

      it('rejects non-integer and invalid numbers', () => {
        assert.equal(validateFrequencyLimit(3.14).valid, false);
        assert.equal(validateFrequencyLimit(NaN).valid, false);
      });
    });

    describe('validateParamConstraints', () => {
      it('validates AC_START temperature ranges and mode configurations', () => {
        // Valid AC configuration
        const validAc = {
          tempMin: 16,
          tempMax: 30,
          allowedModes: ['AUTO', 'COOL', 'HEAT'],
          allowedWindSpeeds: [1, 2, 3, 4],
        };
        assert.equal(validateParamConstraints(CommandCode.CMD_AC_START, validAc).valid, true);

        // Invalid: tempMin > tempMax
        const invalidOrder = { tempMin: 28, tempMax: 20 };
        const resOrder = validateParamConstraints(CommandCode.CMD_AC_START, invalidOrder);
        assert.equal(resOrder.valid, false);
        assert.ok(resOrder.message?.includes('温度'));

        // Invalid: temp out of range [16, 32]
        const outOfRange = { tempMin: 12, tempMax: 30 };
        assert.equal(validateParamConstraints(CommandCode.CMD_AC_START, outOfRange).valid, false);

        // Invalid wind speeds
        const invalidWind = { tempMin: 18, tempMax: 26, allowedWindSpeeds: [0, 8] };
        assert.equal(validateParamConstraints(CommandCode.CMD_AC_START, invalidWind).valid, false);
      });

      it('validates ENGINE_START remote duration constraints', () => {
        // Valid engine duration
        const validEngine = { durationMin: 5, durationMax: 45, durationStep: 5 };
        assert.equal(validateParamConstraints(CommandCode.CMD_ENGINE_START, validEngine).valid, true);

        // Invalid: durationMin > durationMax
        const invalidEngine = { durationMin: 50, durationMax: 30 };
        assert.equal(validateParamConstraints(CommandCode.CMD_ENGINE_START, invalidEngine).valid, false);

        // Invalid: negative or zero duration
        const zeroEngine = { durationMin: 0, durationMax: 30 };
        assert.equal(validateParamConstraints(CommandCode.CMD_ENGINE_START, zeroEngine).valid, false);
      });

      it('validates SEAT_HEAT heating levels and position constraints', () => {
        // Valid seat heat
        const validSeat = { maxLevels: 3, allowedPositions: ['DRIVER', 'PASSENGER'] };
        assert.equal(validateParamConstraints(CommandCode.CMD_SEAT_HEAT, validSeat).valid, true);

        // Invalid: maxLevels exceeds range (must be 1 ~ 5)
        const invalidLevels = { maxLevels: 6 };
        assert.equal(validateParamConstraints(CommandCode.CMD_SEAT_HEAT, invalidLevels).valid, false);

        const zeroLevels = { maxLevels: 0 };
        assert.equal(validateParamConstraints(CommandCode.CMD_SEAT_HEAT, zeroLevels).valid, false);
      });

      it('allows empty or undefined constraints for commands without required schema', () => {
        assert.equal(validateParamConstraints(CommandCode.CMD_LOCK, undefined).valid, true);
        assert.equal(validateParamConstraints(CommandCode.CMD_LOCK, {}).valid, true);
        assert.equal(validateParamConstraints(CommandCode.CMD_UNLOCK, null).valid, true);
      });
    });
  });

  describe('3. Template Statistics Calculation (calculateTemplateStats)', () => {
    it('accurately computes summary metrics for seed templates', () => {
      const stats = calculateTemplateStats(SEED_CAPABILITY_TEMPLATES);

      assert.equal(stats.totalTemplates, 3);
      assert.equal(stats.powertrainCounts.EV, 1);
      assert.equal(stats.powertrainCounts.ICE, 1);
      assert.equal(stats.powertrainCounts.PHEV, 1);
      assert.equal(stats.powertrainCounts.REEV, 0);

      // EV has 13/13 (100%), ICE has 9/13 (69.23%), PHEV has 12/13 (92.31%)
      // Total supported = 13 + 9 + 12 = 34. Total commands = 3 * 13 = 39.
      // 34 / 39 = 87.18% (approx 87.2%)
      assert.ok(stats.averageCoveragePercent > 80 && stats.averageCoveragePercent < 90);
      assert.equal(typeof stats.averageCoveragePercent, 'number');

      // L2 guarded commands count
      assert.ok(stats.l2GuardedCount > 0);

      // Customized rules count (rules with paramConstraints)
      assert.ok(stats.customizedRulesCount > 0);
    });

    it('safely handles empty templates array without NaN or division by zero', () => {
      const emptyStats = calculateTemplateStats([]);
      assert.equal(emptyStats.totalTemplates, 0);
      assert.equal(emptyStats.powertrainCounts.EV, 0);
      assert.equal(emptyStats.powertrainCounts.PHEV, 0);
      assert.equal(emptyStats.powertrainCounts.ICE, 0);
      assert.equal(emptyStats.powertrainCounts.REEV, 0);
      assert.equal(emptyStats.averageCoveragePercent, 0);
      assert.equal(emptyStats.l2GuardedCount, 0);
      assert.equal(emptyStats.customizedRulesCount, 0);
    });
  });

  describe('4. Template Diffing Pure Function (diffCapabilityTemplates)', () => {
    it('returns no differences when comparing a template with itself', () => {
      const tpl = SEED_CAPABILITY_TEMPLATES[0]!;
      const diffResult = diffCapabilityTemplates(tpl, tpl);

      assert.equal(diffResult.hasDifferences, false);
      assert.equal(diffResult.totalChanges, 0);
      assert.equal(diffResult.diffs.length, 0);
    });

    it('identifies differences in supported status, timeout, security level, and param constraints', () => {
      const base = SEED_CAPABILITY_TEMPLATES[0]!; // EV flagship (13/13 supported)
      const target = SEED_CAPABILITY_TEMPLATES[1]!; // ICE economy (9/13 supported)

      const diffResult = diffCapabilityTemplates(base, target);

      assert.equal(diffResult.hasDifferences, true);
      assert.ok(diffResult.totalChanges > 0);
      assert.ok(diffResult.diffs.length > 0);

      // Sunroof is supported in EV, unsupported in ICE
      const sunroofDiff = diffResult.diffs.find((d) => d.commandCode === CommandCode.CMD_SUNROOF_CONTROL);
      assert.ok(sunroofDiff, 'Sunroof diff must exist');
      assert.equal(sunroofDiff.baseRule.supported, true);
      assert.equal(sunroofDiff.targetRule.supported, false);
      assert.ok(sunroofDiff.changes.includes('supported'));
    });
  });

  describe('5. Template Cloning Pure Function (cloneModelTemplate)', () => {
    it('deep clones capabilities to a new instance with independent references', () => {
      const source = SEED_CAPABILITY_TEMPLATES[0]!;
      const clone = cloneModelTemplate(
        source,
        'model-target-01',
        '凌云 07 纯电版',
        '0x0105',
        'EV'
      );

      assert.notEqual(clone.id, source.id);
      assert.equal(clone.modelId, 'model-target-01');
      assert.equal(clone.modelName, '凌云 07 纯电版');
      assert.equal(clone.protocolCode, '0x0105');
      assert.equal(clone.powertrain, 'EV');
      assert.ok(clone.description?.includes(source.modelName));

      // Assert deep clone: mutating clone should NOT affect source
      clone.capabilities[CommandCode.CMD_SUNROOF_CONTROL].supported = false;
      assert.equal(source.capabilities[CommandCode.CMD_SUNROOF_CONTROL].supported, true);
      assert.equal(clone.capabilities[CommandCode.CMD_SUNROOF_CONTROL].supported, false);
    });
  });

  describe('6. Production Seed Templates Integrity', () => {
    it('provides EV flagship template with 13/13 supported and custom constraints', () => {
      const ev = SEED_CAPABILITY_TEMPLATES.find((t) => t.powertrain === 'EV');
      assert.ok(ev, 'EV flagship template must exist');
      assert.equal(ev.protocolCode, '0x0001');

      const supportedCount = Object.values(ev.capabilities).filter((c) => c.supported).length;
      assert.equal(supportedCount, 13);

      assert.ok(ev.capabilities[CommandCode.CMD_AC_START].paramConstraints);
      assert.ok(ev.capabilities[CommandCode.CMD_SEAT_HEAT].paramConstraints);
    });

    it('provides ICE economy template with 9/13 supported and L2 engine start', () => {
      const ice = SEED_CAPABILITY_TEMPLATES.find((t) => t.powertrain === 'ICE');
      assert.ok(ice, 'ICE economy template must exist');
      assert.equal(ice.protocolCode, '0x0002');

      const supportedCount = Object.values(ice.capabilities).filter((c) => c.supported).length;
      assert.equal(supportedCount, 9);

      // Verify L2 security level for engine start
      assert.equal(ice.capabilities[CommandCode.CMD_ENGINE_START].securityLevel, SecurityLevel.L2);
      assert.equal(ice.capabilities[CommandCode.CMD_SUNROOF_CONTROL].supported, false);
      assert.equal(ice.capabilities[CommandCode.CMD_SEAT_HEAT].supported, false);
      assert.equal(ice.capabilities[CommandCode.CMD_TRUNK_CLOSE].supported, false);
    });

    it('provides PHEV SUV template with 12/13 supported', () => {
      const phev = SEED_CAPABILITY_TEMPLATES.find((t) => t.powertrain === 'PHEV');
      assert.ok(phev, 'PHEV SUV template must exist');
      assert.equal(phev.protocolCode, '0x0003');

      const supportedCount = Object.values(phev.capabilities).filter((c) => c.supported).length;
      assert.equal(supportedCount, 12);
    });
  });

  describe('7. API Client & In-Memory Offline State Synchronization', () => {
    it('fetchCapabilityTemplatesApi returns all templates in offline fallback', async () => {
      const list = await fetchCapabilityTemplatesApi();
      assert.equal(list.length, 3);
      assert.equal(list[0]?.modelName, '极光 01 纯电旗舰');
    });

    it('fetchCapabilityTemplateByModelApi finds template by modelId or returns null', async () => {
      const found = await fetchCapabilityTemplateByModelApi('model-ev-flagship');
      assert.ok(found);
      assert.equal(found.modelName, '极光 01 纯电旗舰');

      const notFound = await fetchCapabilityTemplateByModelApi('model-non-existent');
      assert.equal(notFound, null);
    });

    it('updateCapabilityTemplateApi updates capabilities and persists in memory', async () => {
      const initial = await fetchCapabilityTemplateByModelApi('model-ev-flagship');
      assert.ok(initial);

      const modifiedCaps = {
        ...initial.capabilities,
        [CommandCode.CMD_SUNROOF_CONTROL]: {
          ...initial.capabilities[CommandCode.CMD_SUNROOF_CONTROL],
          supported: false,
          timeoutMs: 12000,
        },
      };

      const updated = await updateCapabilityTemplateApi(initial.id, modifiedCaps);
      assert.equal(updated.capabilities[CommandCode.CMD_SUNROOF_CONTROL].supported, false);
      assert.equal(updated.capabilities[CommandCode.CMD_SUNROOF_CONTROL].timeoutMs, 12000);

      // Verify fetched again has the updated state
      const refreshed = await fetchCapabilityTemplateByModelApi('model-ev-flagship');
      assert.equal(refreshed?.capabilities[CommandCode.CMD_SUNROOF_CONTROL].supported, false);
    });

    it('createCapabilityTemplateApi creates a new template and adds to list', async () => {
      const input: CreateCapabilityTemplateInput = {
        modelId: 'model-reev-01',
        modelName: '星瀚 09 增程旗舰',
        protocolCode: '0x0109',
        powertrain: 'REEV',
        description: '全栈增程超长续航控车模板',
      };

      const created = await createCapabilityTemplateApi(input);
      assert.ok(created.id);
      assert.equal(created.modelId, 'model-reev-01');
      assert.equal(created.powertrain, 'REEV');
      assert.equal(created.protocolCode, '0x0109');

      const list = await fetchCapabilityTemplatesApi();
      assert.equal(list.length, 4);
    });

    it('cloneCapabilityTemplateApi clones existing template and registers into pool', async () => {
      const source = SEED_CAPABILITY_TEMPLATES[0]!;
      const cloned = await cloneCapabilityTemplateApi(
        source.id,
        'model-cloned-01',
        '极光 02 纯电尊享版',
        '0x0004'
      );

      assert.ok(cloned.id);
      assert.equal(cloned.modelId, 'model-cloned-01');
      assert.equal(cloned.modelName, '极光 02 纯电尊享版');
      assert.equal(cloned.protocolCode, '0x0004');

      const list = await fetchCapabilityTemplatesApi();
      assert.equal(list.length, 4);
    });

    it('re-throws server ApiError without swallowing it', async () => {
      const origPatch = http.patch;
      http.patch = async () => {
        throw new ApiError('非法参数约束', 400);
      };

      try {
        await assert.rejects(
          async () => {
            await updateCapabilityTemplateApi('tpl-ev-flagship', {} as any);
          },
          (err: any) => {
            return err instanceof ApiError && err.statusCode === 400 && err.message === '非法参数约束';
          }
        );
      } finally {
        http.patch = origPatch;
      }
    });

    it('throws error when cloning from non-existent template', async () => {
      await assert.rejects(
        async () => {
          await cloneCapabilityTemplateApi('tpl-non-existent', 'm-01', 'Test Model');
        },
        /不存在/
      );
    });

    it('throws error when updating non-existent template in memory fallback', async () => {
      await assert.rejects(
        async () => {
          await updateCapabilityTemplateApi('tpl-non-existent', {} as any);
        },
        /未找到/
      );
    });
  });

  describe('8. Route Registration & 14-Menu Constant Invariance', () => {
    it('registers RoutePath.CAPABILITIES = "/capabilities" with hideInMenu = true', async () => {
      const { RoutePath, routes, getMenuRoutes, findRouteByPath, computeBreadcrumbs } = await import(
        '../router/routes.ts'
      );

      assert.equal(RoutePath.CAPABILITIES, '/capabilities');

      const routeMeta = routes.find((r) => r.path === RoutePath.CAPABILITIES);
      assert.ok(routeMeta, 'Route meta for CAPABILITIES must be registered');
      assert.equal(routeMeta.hideInMenu, true);
      assert.equal(routeMeta.title, '车型能力配置');

      // The critical contract: getMenuRoutes().length === 14 MUST strictly hold
      const menuRoutes = getMenuRoutes();
      assert.equal(
        menuRoutes.length,
        14,
        `Main visible navigation menu count must remain exactly 14, found ${menuRoutes.length}`
      );

      // Verify breadcrumbs computation
      const breadcrumbs = computeBreadcrumbs(RoutePath.CAPABILITIES);
      assert.equal(breadcrumbs.length, 3);
      assert.equal(breadcrumbs[0]?.title, '首页');
      assert.equal(breadcrumbs[1]?.title, '车控运营');
      assert.equal(breadcrumbs[2]?.title, '车型能力配置');

      // Verify route finder
      const found = findRouteByPath(RoutePath.CAPABILITIES);
      assert.equal(found?.title, '车型能力配置');
    });
  });
});

