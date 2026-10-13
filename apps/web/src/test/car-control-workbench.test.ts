import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  CommandCode,
  SecurityLevel,
  CommandStatus,
  type EffectiveCapabilityDto,
} from '@car-control/contracts';
import {
  COMMAND_METADATA,
  validateSecurityCode,
  formatExecutionDuration,
  isCommandSupportedByCapability,
  CommandLockError,
  isCommandLockError,
  isApiError,
  evaluateVoltageHealth,
  type CommandMetaItem,
  type SecurityCodeValidationResult,
} from '../views/command/command-core.ts';
import {
  executeCommandApi,
  fetchVehicleCapabilitiesApi,
  fetchCommandHistoryApi,
  getInMemoryCommandHistory,
  resetInMemoryCommands,
  setVehicleCommandLock,
  type CommandRecord,
} from '../api/command.ts';
import { ApiError, http } from '../api/client.ts';

describe('Remote Car Control Workbench Core & TDD Test Suite', () => {
  beforeEach(() => {
    resetInMemoryCommands();
  });

  describe('1. 13 Command Types Metadata & Security Level Partitioning', () => {
    it('defines complete metadata for all 13 command types', () => {
      const allCodes: CommandCode[] = [
        CommandCode.CMD_LOCK,
        CommandCode.CMD_UNLOCK,
        CommandCode.CMD_FIND_VEHICLE,
        CommandCode.CMD_TRUNK_OPEN,
        CommandCode.CMD_TRUNK_CLOSE,
        CommandCode.CMD_ENGINE_START,
        CommandCode.CMD_ENGINE_STOP,
        CommandCode.CMD_WINDOW_OPEN,
        CommandCode.CMD_WINDOW_CLOSE,
        CommandCode.CMD_AC_START,
        CommandCode.CMD_AC_STOP,
        CommandCode.CMD_SEAT_HEAT,
        CommandCode.CMD_SUNROOF_CONTROL,
      ];

      assert.equal(allCodes.length, 13);
      for (const code of allCodes) {
        const meta = COMMAND_METADATA[code];
        assert.ok(meta, `Metadata for ${code} must exist`);
        assert.equal(meta.code, code);
        assert.ok(meta.name.length > 0, `Command ${code} must have a Chinese display name`);
        assert.ok(meta.group, `Command ${code} must belong to a functional group`);
        assert.ok(meta.defaultTimeoutMs > 0, `Command ${code} must have timeout > 0`);
      }
    });

    it('partitions commands into correct security levels (L0, L1, L2)', () => {
      // L0 commands: no sensitive side effects
      assert.equal(COMMAND_METADATA[CommandCode.CMD_LOCK].securityLevel, SecurityLevel.L0);
      assert.equal(COMMAND_METADATA[CommandCode.CMD_FIND_VEHICLE].securityLevel, SecurityLevel.L0);
      assert.equal(COMMAND_METADATA[CommandCode.CMD_AC_STOP].securityLevel, SecurityLevel.L0);

      // L1 commands: moderate sensitivity requiring confirmation or pin
      assert.equal(COMMAND_METADATA[CommandCode.CMD_UNLOCK].securityLevel, SecurityLevel.L1);
      assert.equal(COMMAND_METADATA[CommandCode.CMD_TRUNK_OPEN].securityLevel, SecurityLevel.L1);
      assert.equal(COMMAND_METADATA[CommandCode.CMD_TRUNK_CLOSE].securityLevel, SecurityLevel.L1);
      assert.equal(COMMAND_METADATA[CommandCode.CMD_WINDOW_OPEN].securityLevel, SecurityLevel.L1);
      assert.equal(COMMAND_METADATA[CommandCode.CMD_WINDOW_CLOSE].securityLevel, SecurityLevel.L1);
      assert.equal(COMMAND_METADATA[CommandCode.CMD_AC_START].securityLevel, SecurityLevel.L1);
      assert.equal(COMMAND_METADATA[CommandCode.CMD_SEAT_HEAT].securityLevel, SecurityLevel.L1);
      assert.equal(COMMAND_METADATA[CommandCode.CMD_SUNROOF_CONTROL].securityLevel, SecurityLevel.L1);

      // L2 commands: high risk requiring mandatory 6-digit PIN and pre-condition validation
      assert.equal(COMMAND_METADATA[CommandCode.CMD_ENGINE_START].securityLevel, SecurityLevel.L2);
      assert.equal(COMMAND_METADATA[CommandCode.CMD_ENGINE_STOP].securityLevel, SecurityLevel.L2);
    });

    it('groups 13 commands into 4 functional domains properly', () => {
      const groups = {
        DOOR_TRUNK: [
          CommandCode.CMD_LOCK,
          CommandCode.CMD_UNLOCK,
          CommandCode.CMD_TRUNK_OPEN,
          CommandCode.CMD_TRUNK_CLOSE,
        ],
        POWER_SEARCH: [
          CommandCode.CMD_FIND_VEHICLE,
          CommandCode.CMD_ENGINE_START,
          CommandCode.CMD_ENGINE_STOP,
        ],
        CLIMATE: [
          CommandCode.CMD_AC_START,
          CommandCode.CMD_AC_STOP,
          CommandCode.CMD_SEAT_HEAT,
        ],
        WINDOW_SUNROOF: [
          CommandCode.CMD_WINDOW_OPEN,
          CommandCode.CMD_WINDOW_CLOSE,
          CommandCode.CMD_SUNROOF_CONTROL,
        ],
      };

      for (const [groupName, codes] of Object.entries(groups)) {
        for (const code of codes) {
          assert.equal(COMMAND_METADATA[code].group, groupName);
        }
      }
    });

    it('provides safety warning text for high-risk and sensitive operations', () => {
      assert.ok(COMMAND_METADATA[CommandCode.CMD_TRUNK_OPEN].warningText?.includes('财产风险'));
      assert.ok(COMMAND_METADATA[CommandCode.CMD_WINDOW_CLOSE].warningText?.includes('防夹'));
      assert.ok(COMMAND_METADATA[CommandCode.CMD_ENGINE_START].warningText?.includes('安全'));
      assert.ok(COMMAND_METADATA[CommandCode.CMD_ENGINE_STOP].warningText?.includes('P'));
    });
  });

  describe('2. Security Code Pure Validation (validateSecurityCode)', () => {
    it('always passes for L0 commands without security check', () => {
      const res = validateSecurityCode(undefined, SecurityLevel.L0);
      assert.equal(res.valid, true);
    });

    it('passes for L1 operations when code is optional or provided', () => {
      const res1 = validateSecurityCode(undefined, SecurityLevel.L1);
      assert.equal(res1.valid, true);
      const res2 = validateSecurityCode('123456', SecurityLevel.L1);
      assert.equal(res2.valid, true);
    });

    it('intercepts empty or missing security code for L2 commands', () => {
      const res1 = validateSecurityCode('', SecurityLevel.L2);
      assert.equal(res1.valid, false);
      assert.match(res1.message!, /请输入6位/);

      const res2 = validateSecurityCode(undefined, SecurityLevel.L2);
      assert.equal(res2.valid, false);
    });

    it('intercepts non-numeric security code for L2 commands', () => {
      const res1 = validateSecurityCode('abcdef', SecurityLevel.L2);
      assert.equal(res1.valid, false);
      assert.match(res1.message!, /6位纯数字/);

      const res2 = validateSecurityCode('12a456', SecurityLevel.L2);
      assert.equal(res2.valid, false);
    });

    it('intercepts incorrect length security codes for L2 commands', () => {
      const res1 = validateSecurityCode('12345', SecurityLevel.L2);
      assert.equal(res1.valid, false);
      assert.match(res1.message!, /6位纯数字/);

      const res2 = validateSecurityCode('1234567', SecurityLevel.L2);
      assert.equal(res2.valid, false);
    });

    it('intercepts mismatching demo PIN for L2 commands', () => {
      const res = validateSecurityCode('654321', SecurityLevel.L2, '123456');
      assert.equal(res.valid, false);
      assert.match(res.message!, /安全操作码错误/);
    });

    it('accepts strictly valid 6-digit numeric PIN matching expected PIN', () => {
      const res = validateSecurityCode('123456', SecurityLevel.L2, '123456');
      assert.equal(res.valid, true);
      assert.equal(res.message, undefined);
    });
  });

  describe('3. Execution Duration Formatter (formatExecutionDuration)', () => {
    it('returns "-" for null, undefined, or negative milliseconds', () => {
      assert.equal(formatExecutionDuration(null), '-');
      assert.equal(formatExecutionDuration(undefined), '-');
      assert.equal(formatExecutionDuration(-50), '-');
    });

    it('formats durations below 1000ms as Xms', () => {
      assert.equal(formatExecutionDuration(0), '0ms');
      assert.equal(formatExecutionDuration(120), '120ms');
      assert.equal(formatExecutionDuration(999), '999ms');
      assert.equal(formatExecutionDuration(450.4), '450ms');
    });

    it('formats durations at or above 1000ms as X.XXs', () => {
      assert.equal(formatExecutionDuration(1000), '1.00s');
      assert.equal(formatExecutionDuration(1280), '1.28s');
      assert.equal(formatExecutionDuration(2345), '2.35s');
      assert.equal(formatExecutionDuration(10500), '10.50s');
    });
  });

  describe('4. Vehicle Capability Evaluation (isCommandSupportedByCapability)', () => {
    const mockCapabilities: Record<CommandCode, EffectiveCapabilityDto> = {
      [CommandCode.CMD_LOCK]: {
        commandCode: CommandCode.CMD_LOCK,
        commandName: '车辆上锁',
        supported: true,
        securityLevel: SecurityLevel.L0,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
      },
      [CommandCode.CMD_UNLOCK]: {
        commandCode: CommandCode.CMD_UNLOCK,
        commandName: '车辆解锁',
        supported: true,
        securityLevel: SecurityLevel.L1,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
      },
      [CommandCode.CMD_FIND_VEHICLE]: {
        commandCode: CommandCode.CMD_FIND_VEHICLE,
        commandName: '鸣笛寻车',
        supported: true,
        securityLevel: SecurityLevel.L0,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
      },
      [CommandCode.CMD_TRUNK_OPEN]: {
        commandCode: CommandCode.CMD_TRUNK_OPEN,
        commandName: '开启后备箱',
        supported: true,
        securityLevel: SecurityLevel.L1,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
      },
      [CommandCode.CMD_TRUNK_CLOSE]: {
        commandCode: CommandCode.CMD_TRUNK_CLOSE,
        commandName: '关闭后备箱',
        supported: true,
        securityLevel: SecurityLevel.L1,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
      },
      [CommandCode.CMD_ENGINE_START]: {
        commandCode: CommandCode.CMD_ENGINE_START,
        commandName: '远程点火启动',
        supported: true,
        securityLevel: SecurityLevel.L2,
        timeoutMs: 15000,
        frequencyLimitSeconds: 10,
      },
      [CommandCode.CMD_ENGINE_STOP]: {
        commandCode: CommandCode.CMD_ENGINE_STOP,
        commandName: '远程熄火',
        supported: true,
        securityLevel: SecurityLevel.L2,
        timeoutMs: 15000,
        frequencyLimitSeconds: 10,
      },
      [CommandCode.CMD_WINDOW_OPEN]: {
        commandCode: CommandCode.CMD_WINDOW_OPEN,
        commandName: '开启车窗',
        supported: true,
        securityLevel: SecurityLevel.L1,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
      },
      [CommandCode.CMD_WINDOW_CLOSE]: {
        commandCode: CommandCode.CMD_WINDOW_CLOSE,
        commandName: '关闭车窗',
        supported: true,
        securityLevel: SecurityLevel.L1,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
      },
      [CommandCode.CMD_AC_START]: {
        commandCode: CommandCode.CMD_AC_START,
        commandName: '开启空调',
        supported: true,
        securityLevel: SecurityLevel.L1,
        timeoutMs: 15000,
        frequencyLimitSeconds: 10,
      },
      [CommandCode.CMD_AC_STOP]: {
        commandCode: CommandCode.CMD_AC_STOP,
        commandName: '关闭空调',
        supported: true,
        securityLevel: SecurityLevel.L0,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
      },
      [CommandCode.CMD_SEAT_HEAT]: {
        commandCode: CommandCode.CMD_SEAT_HEAT,
        commandName: '座椅加热',
        supported: false,
        securityLevel: SecurityLevel.L1,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
        reason: '该车型硬件配置不支持此功能',
      },
      [CommandCode.CMD_SUNROOF_CONTROL]: {
        commandCode: CommandCode.CMD_SUNROOF_CONTROL,
        commandName: '开启/关闭天窗',
        supported: false,
        securityLevel: SecurityLevel.L1,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
        reason: '该车型无全景天窗硬件',
      },
    };

    it('evaluates supported command as true', () => {
      const res = isCommandSupportedByCapability(CommandCode.CMD_LOCK, mockCapabilities);
      assert.equal(res.supported, true);
    });

    it('evaluates unsupported command as false with friendly reason', () => {
      const res1 = isCommandSupportedByCapability(CommandCode.CMD_SEAT_HEAT, mockCapabilities);
      assert.equal(res1.supported, false);
      assert.equal(res1.reason, '该车型硬件配置不支持此功能');

      const res2 = isCommandSupportedByCapability(CommandCode.CMD_SUNROOF_CONTROL, mockCapabilities);
      assert.equal(res2.supported, false);
      assert.equal(res2.reason, '该车型无全景天窗硬件');
    });

    it('gracefully handles missing command in capability matrix', () => {
      const sparseCaps: Partial<Record<CommandCode, EffectiveCapabilityDto>> = {
        [CommandCode.CMD_LOCK]: mockCapabilities[CommandCode.CMD_LOCK],
      };
      const res = isCommandSupportedByCapability(CommandCode.CMD_AC_START, sparseCaps);
      assert.equal(res.supported, false);
      assert.equal(res.reason, '该车型硬件配置不支持此功能');
    });

    it('defaults to supported when capabilities mapping is null or undefined', () => {
      assert.equal(isCommandSupportedByCapability(CommandCode.CMD_LOCK, null).supported, true);
      assert.equal(isCommandSupportedByCapability(CommandCode.CMD_LOCK, undefined).supported, true);
    });
  });

  describe('5. Voltage Health Evaluation (evaluateVoltageHealth)', () => {
    it('categorizes >= 12.0V as NORMAL', () => {
      assert.equal(evaluateVoltageHealth(12.6).level, 'NORMAL');
      assert.equal(evaluateVoltageHealth(12.0).level, 'NORMAL');
      assert.equal(evaluateVoltageHealth(13.8).level, 'NORMAL');
    });

    it('categorizes 11.0V ~ 11.9V as LOW', () => {
      assert.equal(evaluateVoltageHealth(11.9).level, 'LOW');
      assert.equal(evaluateVoltageHealth(11.0).level, 'LOW');
    });

    it('categorizes < 11.0V as CRITICAL', () => {
      assert.equal(evaluateVoltageHealth(10.9).level, 'CRITICAL');
      assert.equal(evaluateVoltageHealth(9.5).level, 'CRITICAL');
    });
  });

  describe('6. Error Handling & 409 Concurrency Exclusive Lock', () => {
    it('creates and identifies CommandLockError properly', () => {
      const err = new CommandLockError('veh-001', '该车辆已有指令正在执行中，请稍候', CommandCode.CMD_LOCK);
      assert.equal(err.name, 'CommandLockError');
      assert.equal(err.vehicleId, 'veh-001');
      assert.equal(err.commandCode, CommandCode.CMD_LOCK);
      assert.equal(isCommandLockError(err), true);
      assert.equal(isCommandLockError(new Error('general')), false);
    });

    it('isApiError identifies ApiError instances and duck-typed objects', () => {
      const realApiErr = new ApiError('Conflict', 409);
      assert.equal(isApiError(realApiErr), true);

      const duckErr = { statusCode: 409, message: 'Vehicle locked' };
      assert.equal(isApiError(duckErr), true);

      assert.equal(isApiError(null), false);
      assert.equal(isApiError('error string'), false);
    });

    it('executeCommandApi dispatches command and receives ACK record', async () => {
      const res = await executeCommandApi('veh-test-01', {
        commandCode: CommandCode.CMD_LOCK,
        idempotencyKey: 'idemp-101',
      });

      assert.ok(res.id);
      assert.equal(res.vehicleId, 'veh-test-01');
      assert.equal(res.commandCode, CommandCode.CMD_LOCK);
      assert.equal(res.status, CommandStatus.SUCCESS);
      assert.ok(typeof res.durationMs === 'number');
    });

    it('intercepts simultaneous command dispatch with 409 CommandLockError', async () => {
      // Simulate that veh-locked has an active running lock
      setVehicleCommandLock('veh-locked', true);

      await assert.rejects(
        async () => {
          await executeCommandApi('veh-locked', {
            commandCode: CommandCode.CMD_ENGINE_START,
            idempotencyKey: 'idemp-conflict',
            securityCode: '123456',
          });
        },
        (err: unknown) => {
          assert.ok(isCommandLockError(err));
          assert.equal((err as CommandLockError).vehicleId, 'veh-locked');
          assert.match((err as Error).message, /已有指令正在执行中/);
          return true;
        }
      );

      // Once released, command succeeds
      setVehicleCommandLock('veh-locked', false);
      const res = await executeCommandApi('veh-locked', {
        commandCode: CommandCode.CMD_ENGINE_START,
        idempotencyKey: 'idemp-success-after-release',
        securityCode: '123456',
      });
      assert.equal(res.commandCode, CommandCode.CMD_ENGINE_START);
      assert.equal(res.status, CommandStatus.SUCCESS);
    });

    it('transforms server 409 ApiError into CommandLockError', async () => {
      const originalPost = http.post;
      http.post = async () => {
        throw new ApiError('Vehicle command in progress', 409);
      };

      try {
        await assert.rejects(
          async () => {
            await executeCommandApi('veh-srv-lock', {
              commandCode: CommandCode.CMD_UNLOCK,
              idempotencyKey: 'idemp-srv-409',
            });
          },
          (err: unknown) => {
            assert.ok(isCommandLockError(err));
            assert.equal((err as CommandLockError).vehicleId, 'veh-srv-lock');
            return true;
          }
        );
      } finally {
        http.post = originalPost;
      }
    });
  });

  describe('7. Capability Matrix & History API Methods', () => {
    it('fetchVehicleCapabilitiesApi returns capability record mapping for vehicle', async () => {
      const caps = await fetchVehicleCapabilitiesApi('veh-test-01');
      assert.ok(caps);
      assert.ok(caps[CommandCode.CMD_LOCK]);
      assert.equal(caps[CommandCode.CMD_LOCK].commandCode, CommandCode.CMD_LOCK);
    });

    it('fetchCommandHistoryApi returns command logs for vehicle', async () => {
      await executeCommandApi('veh-hist-01', {
        commandCode: CommandCode.CMD_FIND_VEHICLE,
        idempotencyKey: 'idemp-hist-1',
      });
      await executeCommandApi('veh-hist-01', {
        commandCode: CommandCode.CMD_LOCK,
        idempotencyKey: 'idemp-hist-2',
      });

      const history = await fetchCommandHistoryApi('veh-hist-01');
      assert.ok(history.length >= 2);
      assert.equal(history[0].vehicleId, 'veh-hist-01');
    });
  });
});
