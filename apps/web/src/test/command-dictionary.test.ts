import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CommandCode, SecurityLevel } from '@car-control/contracts';
import {
  type ProtocolParamSchema,
  type CommandDictionaryItem,
  type DictionaryStats,
  CommandCategory,
  SEED_COMMAND_DICTIONARY,
  calculateDictionaryStats,
  filterDictionaryItems,
  generateDictionaryMarkdown,
  generateDictionaryCsv,
  sanitizeCsvCell,
  validatePayloadAgainstSchema,
} from '../views/command/command-dictionary-core.ts';
import {
  fetchCommandDictionaryApi,
  fetchCommandDictionaryItemApi,
  updateCommandDictionaryItemApi,
  getInMemoryDictionary,
  resetInMemoryDictionary,
} from '../api/command-dictionary.ts';
import { ApiError } from '../api/client.ts';

describe('Command Dictionary & Protocol Parameter Management Test Suite (TDD)', () => {
  beforeEach(() => {
    resetInMemoryDictionary();
  });

  describe('1. Production Seed Dictionary Completeness & Integrity', () => {
    it('contains all 13 standard command codes defined in contracts', () => {
      const expectedCodes = Object.values(CommandCode);
      assert.equal(expectedCodes.length, 13);
      assert.equal(SEED_COMMAND_DICTIONARY.length, 13);

      const seedCodes = SEED_COMMAND_DICTIONARY.map((item) => item.code);
      for (const code of expectedCodes) {
        assert.ok(seedCodes.includes(code), `Missing command code in seed dictionary: ${code}`);
      }
    });

    it('ensures each command dictionary item possesses complete schema and metadata', () => {
      const opcodePattern = /^0x02_[0-9A-Fa-f]{2}$/;
      const canSignalPattern = /^CAN_[A-Z]{3,4}_[A-Za-z0-9_]+$/;

      for (const item of SEED_COMMAND_DICTIONARY) {
        assert.ok(item.code, 'Command code must be present');
        assert.ok(item.name && item.name.trim().length > 0, `Name must not be empty for ${item.code}`);
        assert.ok(Object.values(CommandCategory).includes(item.category), `Invalid category for ${item.code}`);
        assert.ok(Object.values(SecurityLevel).includes(item.defaultSecurityLevel), `Invalid securityLevel for ${item.code}`);
        assert.ok(item.defaultTimeoutMs >= 3000 && item.defaultTimeoutMs <= 60000, `Timeout out of bounds: ${item.defaultTimeoutMs}`);
        assert.ok(item.defaultFrequencyLimitSeconds >= 0 && item.defaultFrequencyLimitSeconds <= 300, `Frequency limit out of bounds: ${item.defaultFrequencyLimitSeconds}`);
        assert.match(item.downlinkOpcode, opcodePattern, `Invalid downlinkOpcode format for ${item.code}: ${item.downlinkOpcode}`);
        assert.match(item.canSignalName, canSignalPattern, `Invalid CAN signal name for ${item.code}: ${item.canSignalName}`);
        assert.ok(typeof item.payloadSchema === 'object' && item.payloadSchema !== null, `payloadSchema must be object for ${item.code}`);
        assert.ok(typeof item.samplePayload === 'object' && item.samplePayload !== null, `samplePayload must be object for ${item.code}`);
        assert.ok(item.description && item.description.length > 5, `Description too short for ${item.code}`);
      }
    });

    it('enforces L2 high-risk commands to possess safety warnings and elevated timeouts', () => {
      const l2Items = SEED_COMMAND_DICTIONARY.filter(
        (item) => item.defaultSecurityLevel === SecurityLevel.L2
      );
      assert.equal(l2Items.length, 2);

      const l2Codes = l2Items.map((item) => item.code);
      assert.ok(l2Codes.includes(CommandCode.CMD_ENGINE_START));
      assert.ok(l2Codes.includes(CommandCode.CMD_ENGINE_STOP));

      for (const item of l2Items) {
        assert.ok(item.safetyWarning && item.safetyWarning.length > 10, `L2 command must have detailed safetyWarning: ${item.code}`);
        assert.ok(item.defaultTimeoutMs >= 15000, `L2 command timeout should be >= 15000ms: ${item.code}`);
      }
    });

    it('validates protocol parameter schemas for parametric commands', () => {
      const acStart = SEED_COMMAND_DICTIONARY.find((item) => item.code === CommandCode.CMD_AC_START);
      assert.ok(acStart);
      assert.ok(acStart.payloadSchema.temperature);
      assert.equal(acStart.payloadSchema.temperature.type, 'number');
      assert.equal(acStart.payloadSchema.temperature.unit, '℃');
      assert.equal(acStart.payloadSchema.temperature.required, true);

      const seatHeat = SEED_COMMAND_DICTIONARY.find((item) => item.code === CommandCode.CMD_SEAT_HEAT);
      assert.ok(seatHeat);
      assert.ok(seatHeat.payloadSchema.position);
      assert.equal(seatHeat.payloadSchema.position.type, 'enum');
      assert.deepEqual(seatHeat.payloadSchema.position.allowedValues, ['DRIVER', 'PASSENGER']);
    });
  });

  describe('2. Dictionary Statistics Calculation (calculateDictionaryStats)', () => {
    it('calculates comprehensive metrics across categories, security levels and parameters', () => {
      const stats = calculateDictionaryStats(SEED_COMMAND_DICTIONARY);
      assert.equal(stats.total, 13);
      assert.equal(stats.l0Count, 3); // CMD_LOCK, CMD_FIND_VEHICLE, CMD_AC_STOP
      assert.equal(stats.l1Count, 8); // CMD_UNLOCK, CMD_TRUNK_OPEN, CMD_TRUNK_CLOSE, CMD_AC_START, CMD_SEAT_HEAT, CMD_WINDOW_OPEN, CMD_WINDOW_CLOSE, CMD_SUNROOF_CONTROL
      assert.equal(stats.l2Count, 2); // CMD_ENGINE_START, CMD_ENGINE_STOP
      assert.equal(stats.categoryCounts[CommandCategory.DOOR_BODY], 4);
      assert.equal(stats.categoryCounts[CommandCategory.POWER_FIND], 3);
      assert.equal(stats.categoryCounts[CommandCategory.CABIN_CLIMATE], 3);
      assert.equal(stats.categoryCounts[CommandCategory.WINDOW_ROOF], 3);
      assert.ok(stats.parametricCount >= 6); // commands with params: FIND, ENGINE_START, AC_START, SEAT_HEAT, WINDOW_OPEN, SUNROOF_CONTROL
      assert.ok(stats.averageTimeoutMs >= 10000 && stats.averageTimeoutMs <= 20000);
      assert.ok(stats.averageFrequencyLimitSeconds >= 5);
    });

    it('safely handles empty array input', () => {
      const emptyStats = calculateDictionaryStats([]);
      assert.equal(emptyStats.total, 0);
      assert.equal(emptyStats.l0Count, 0);
      assert.equal(emptyStats.l1Count, 0);
      assert.equal(emptyStats.l2Count, 0);
      assert.equal(emptyStats.parametricCount, 0);
      assert.equal(emptyStats.averageTimeoutMs, 0);
      assert.equal(emptyStats.averageFrequencyLimitSeconds, 0);
      assert.equal(emptyStats.categoryCounts[CommandCategory.DOOR_BODY], 0);
    });
  });

  describe('3. Multi-dimensional Dictionary Filtering (filterDictionaryItems)', () => {
    it('filters items by keyword matching code, name, opcode, or CAN signal', () => {
      const resCode = filterDictionaryItems(SEED_COMMAND_DICTIONARY, { keyword: 'LOCK' });
      assert.ok(resCode.some((item) => item.code === CommandCode.CMD_LOCK));
      assert.ok(resCode.some((item) => item.code === CommandCode.CMD_UNLOCK));

      const resName = filterDictionaryItems(SEED_COMMAND_DICTIONARY, { keyword: '空调' });
      assert.equal(resName.length, 2);
      assert.ok(resName.some((item) => item.code === CommandCode.CMD_AC_START));
      assert.ok(resName.some((item) => item.code === CommandCode.CMD_AC_STOP));

      const resOpcode = filterDictionaryItems(SEED_COMMAND_DICTIONARY, { keyword: '0x02_08' });
      assert.equal(resOpcode.length, 1);
      assert.equal(resOpcode[0]?.code, CommandCode.CMD_AC_START);

      const resCan = filterDictionaryItems(SEED_COMMAND_DICTIONARY, { keyword: 'CAN_VCU' });
      assert.equal(resCan.length, 2);
    });

    it('filters items by business category', () => {
      const doorItems = filterDictionaryItems(SEED_COMMAND_DICTIONARY, {
        category: CommandCategory.DOOR_BODY,
      });
      assert.equal(doorItems.length, 4);
      for (const item of doorItems) {
        assert.equal(item.category, CommandCategory.DOOR_BODY);
      }

      const allItems = filterDictionaryItems(SEED_COMMAND_DICTIONARY, { category: 'ALL' });
      assert.equal(allItems.length, 13);
    });

    it('filters items by security level', () => {
      const l2Items = filterDictionaryItems(SEED_COMMAND_DICTIONARY, {
        securityLevel: SecurityLevel.L2,
      });
      assert.equal(l2Items.length, 2);
      for (const item of l2Items) {
        assert.equal(item.defaultSecurityLevel, SecurityLevel.L2);
      }
    });

    it('combines keyword, category, and security level filters simultaneously', () => {
      const combined = filterDictionaryItems(SEED_COMMAND_DICTIONARY, {
        category: CommandCategory.POWER_FIND,
        securityLevel: SecurityLevel.L2,
        keyword: '点火',
      });
      assert.equal(combined.length, 1);
      assert.equal(combined[0]?.code, CommandCode.CMD_ENGINE_START);
    });
  });

  describe('4. Markdown Protocol Manual Generation (generateDictionaryMarkdown)', () => {
    it('generates well-formatted Markdown documentation containing all commands and schemas', () => {
      const md = generateDictionaryMarkdown(SEED_COMMAND_DICTIONARY);
      assert.ok(md.includes('# 控车协议参数与指令字典手册'));
      assert.ok(md.includes('0x02_01'));
      assert.ok(md.includes('CAN_BCM_DoorLockCmd'));
      assert.ok(md.includes('CAN_HVAC_TargetTemp'));
      assert.ok(md.includes('CMD_ENGINE_START'));
      assert.ok(md.includes('安全提示'));
      assert.ok(md.includes('JSON 示例'));

      for (const item of SEED_COMMAND_DICTIONARY) {
        assert.ok(md.includes(item.code), `Markdown missing code ${item.code}`);
        assert.ok(md.includes(item.name), `Markdown missing name ${item.name}`);
      }
    });
  });

  describe('5. CSV Export and CWE-1236 Formula Injection Defense', () => {
    it('prepends UTF-8 BOM byte sequence at the start of CSV', () => {
      const csv = generateDictionaryCsv(SEED_COMMAND_DICTIONARY);
      assert.ok(csv.startsWith('\uFEFF'), 'CSV must start with UTF-8 BOM');
    });

    it('includes RFC 4180 standard headers and 13 rows', () => {
      const csv = generateDictionaryCsv(SEED_COMMAND_DICTIONARY);
      const lines = csv.replace('\uFEFF', '').trim().split('\n');
      assert.equal(lines.length, 14); // 1 header + 13 data rows
      assert.ok(lines[0]?.includes('指令代码,指令名称,业务集群,下行Opcode,安全等级'));
    });

    it('sanitizes formula-triggering characters (=, +, -, @, \\t, \\r) against CWE-1236', () => {
      assert.equal(sanitizeCsvCell('=SUM(A1:A10)'), "'=SUM(A1:A10)");
      assert.equal(sanitizeCsvCell('+12345'), "'+12345");
      assert.equal(sanitizeCsvCell('-cmd|/C calc!A0'), "'-cmd|/C calc!A0");
      assert.equal(sanitizeCsvCell('@evil.com'), "'@evil.com");
      assert.equal(sanitizeCsvCell('  =1+1'), "'=1+1");
      assert.equal(sanitizeCsvCell('Normal Text'), 'Normal Text');
    });

    it('properly quotes and escapes commas, double quotes, and newlines', () => {
      const maliciousItems: CommandDictionaryItem[] = [
        {
          code: CommandCode.CMD_LOCK,
          name: '测试=CMD',
          category: CommandCategory.DOOR_BODY,
          defaultSecurityLevel: SecurityLevel.L0,
          defaultTimeoutMs: 10000,
          defaultFrequencyLimitSeconds: 5,
          canSignalName: 'CAN_TEST',
          downlinkOpcode: '0x02_01',
          payloadSchema: {},
          samplePayload: {},
          description: '带有,逗号和"引号"\n换行',
          safetyWarning: '=cmd|"/C calc"!A0',
        },
      ];

      const csv = generateDictionaryCsv(maliciousItems);
      assert.ok(csv.includes("'\t") || csv.includes("''") || csv.includes("'+") || csv.includes("'-") || csv.includes("'="));
      assert.ok(csv.includes('""引号""'));
      assert.ok(!csv.includes('\n=cmd'));
    });
  });

  describe('6. Payload Schema Validation (validatePayloadAgainstSchema)', () => {
    const acStart = SEED_COMMAND_DICTIONARY.find((item) => item.code === CommandCode.CMD_AC_START)!;

    it('accepts valid payload matching schema requirements', () => {
      const valid = validatePayloadAgainstSchema(acStart.payloadSchema, {
        temperature: 22,
        fanSpeed: 4,
        mode: 'COOL',
      });
      assert.equal(valid.valid, true);
      assert.equal(valid.errors.length, 0);
    });

    it('rejects payload missing required fields', () => {
      const invalid = validatePayloadAgainstSchema(acStart.payloadSchema, {
        fanSpeed: 3,
      });
      assert.equal(invalid.valid, false);
      assert.ok(invalid.errors.some((err) => err.includes('temperature')));
    });

    it('rejects payload with invalid types or values out of bounds', () => {
      const invalid = validatePayloadAgainstSchema(acStart.payloadSchema, {
        temperature: 35, // max is 30
        fanSpeed: 10,   // max is 7
        mode: 'INVALID_MODE',
      });
      assert.equal(invalid.valid, false);
      assert.ok(invalid.errors.length >= 3);
    });
  });

  describe('7. API Client Methods & Offline Fallback (api/command-dictionary.ts)', () => {
    it('fetchCommandDictionaryApi returns complete seed dictionary in offline mode', async () => {
      const data = await fetchCommandDictionaryApi();
      assert.equal(data.length, 13);
      assert.ok(data.some((item) => item.code === CommandCode.CMD_LOCK));
    });

    it('fetchCommandDictionaryItemApi retrieves single command item', async () => {
      const item = await fetchCommandDictionaryItemApi(CommandCode.CMD_ENGINE_START);
      assert.equal(item.code, CommandCode.CMD_ENGINE_START);
      assert.equal(item.defaultSecurityLevel, SecurityLevel.L2);
    });

    it('fetchCommandDictionaryItemApi throws 404 for non-existent command', async () => {
      await assert.rejects(
        async () => {
          await fetchCommandDictionaryItemApi('UNKNOWN_CMD' as CommandCode);
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal((err as ApiError).statusCode, 404);
          return true;
        }
      );
    });

    it('updateCommandDictionaryItemApi modifies item in memory state and returns updated', async () => {
      const updated = await updateCommandDictionaryItemApi(CommandCode.CMD_LOCK, {
        defaultTimeoutMs: 12000,
        defaultFrequencyLimitSeconds: 8,
        description: '修改后的闭锁描述',
      });

      assert.equal(updated.code, CommandCode.CMD_LOCK);
      assert.equal(updated.defaultTimeoutMs, 12000);
      assert.equal(updated.defaultFrequencyLimitSeconds, 8);
      assert.equal(updated.description, '修改后的闭锁描述');

      const refetched = await fetchCommandDictionaryItemApi(CommandCode.CMD_LOCK);
      assert.equal(refetched.defaultTimeoutMs, 12000);
    });

    it('updateCommandDictionaryItemApi throws 404 if updating non-existent command', async () => {
      await assert.rejects(
        async () => {
          await updateCommandDictionaryItemApi('NON_EXISTENT' as CommandCode, {
            defaultTimeoutMs: 5000,
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal((err as ApiError).statusCode, 404);
          return true;
        }
      );
    });

    it('resetInMemoryDictionary restores initial seed state', async () => {
      await updateCommandDictionaryItemApi(CommandCode.CMD_LOCK, {
        defaultTimeoutMs: 9999,
      });

      resetInMemoryDictionary();

      const item = await fetchCommandDictionaryItemApi(CommandCode.CMD_LOCK);
      assert.equal(item.defaultTimeoutMs, 10000);
    });
  });
});
