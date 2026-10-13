import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CommandCode, CommandStatus, SecurityLevel } from '@car-control/contracts';
import {
  getCommandStatusStepIndex,
  calculateStepTimings,
  parseCommandLockDetails,
  SEED_COMMAND_TRACES,
  type CommandTraceDto,
  type CommandLifecycleStep,
  type StepTimingBreakdown,
  type CommandLockDetails,
} from '../views/command/command-stream-core.ts';
import { fetchCommandTraceApi, resetInMemoryCommands } from '../api/command.ts';
import { ApiError } from '../api/client.ts';

describe('Command Stream & FSM Diagnostics Lifecycle Test Suite (TDD)', () => {
  describe('1. FSM 11-Step Status to Step Index Mapping (getCommandStatusStepIndex)', () => {
    it('maps all 11+ CommandStatus enum states to correct step index (0~5) and statuses', () => {
      // Step 0: CREATED
      const created = getCommandStatusStepIndex(CommandStatus.CREATED);
      assert.equal(created.stepIndex, 0);
      assert.equal(created.stepStatus, 'process');
      assert.equal(created.isTerminal, false);
      assert.ok(created.title.includes('创建'));

      // Step 1: VALIDATING
      const validating = getCommandStatusStepIndex(CommandStatus.VALIDATING);
      assert.equal(validating.stepIndex, 1);
      assert.equal(validating.stepStatus, 'process');
      assert.equal(validating.isTerminal, false);
      assert.ok(validating.title.includes('校验') || validating.title.includes('鉴权'));

      // Step 2: QUEUED
      const queued = getCommandStatusStepIndex(CommandStatus.QUEUED);
      assert.equal(queued.stepIndex, 2);
      assert.equal(queued.stepStatus, 'process');
      assert.equal(queued.isTerminal, false);
      assert.ok(queued.title.includes('锁') || queued.title.includes('队'));

      // Step 3: SENDING / SENT
      const sending = getCommandStatusStepIndex(CommandStatus.SENDING);
      assert.equal(sending.stepIndex, 3);
      assert.equal(sending.stepStatus, 'process');
      assert.equal(sending.isTerminal, false);

      const sent = getCommandStatusStepIndex(CommandStatus.SENT);
      assert.equal(sent.stepIndex, 3);
      assert.equal(sent.stepStatus, 'finish');
      assert.equal(sent.isTerminal, false);

      // Step 4: WAITING_ACK
      const waiting = getCommandStatusStepIndex(CommandStatus.WAITING_ACK);
      assert.equal(waiting.stepIndex, 4);
      assert.equal(waiting.stepStatus, 'process');
      assert.equal(waiting.isTerminal, false);
      assert.ok(waiting.title.includes('应答') || waiting.title.includes('执行'));

      // Step 5: Terminal SUCCESS
      const success = getCommandStatusStepIndex(CommandStatus.SUCCESS);
      assert.equal(success.stepIndex, 5);
      assert.equal(success.stepStatus, 'finish');
      assert.equal(success.isTerminal, true);
      assert.equal(success.isError, false);

      // Step 5: Terminal Errors (DEVICE_REJECTED, TIMEOUT, FAILED, CANCELLED, EXPIRED)
      const rejected = getCommandStatusStepIndex(CommandStatus.DEVICE_REJECTED);
      assert.equal(rejected.stepIndex, 5);
      assert.equal(rejected.stepStatus, 'error');
      assert.equal(rejected.isTerminal, true);
      assert.equal(rejected.isError, true);

      const timeout = getCommandStatusStepIndex(CommandStatus.TIMEOUT);
      assert.equal(timeout.stepIndex, 5);
      assert.equal(timeout.stepStatus, 'error');
      assert.equal(timeout.isTerminal, true);
      assert.equal(timeout.isError, true);

      const failed = getCommandStatusStepIndex(CommandStatus.FAILED);
      assert.equal(failed.stepIndex, 5);
      assert.equal(failed.stepStatus, 'error');
      assert.equal(failed.isTerminal, true);
      assert.equal(failed.isError, true);

      const cancelled = getCommandStatusStepIndex(CommandStatus.CANCELLED);
      assert.equal(cancelled.stepIndex, 5);
      assert.equal(cancelled.stepStatus, 'error');
      assert.equal(cancelled.isTerminal, true);

      const expired = getCommandStatusStepIndex(CommandStatus.EXPIRED);
      assert.equal(expired.stepIndex, 5);
      assert.equal(expired.stepStatus, 'error');
      assert.equal(expired.isTerminal, true);
    });
  });

  describe('2. Timing Breakdown & SLA Health Evaluation (calculateStepTimings)', () => {
    it('accurately computes step delta latencies, total latency, and SLA rating for fast trace (<1500ms)', () => {
      const baseTime = new Date('2026-10-13T10:25:30.000Z').getTime();
      const steps: CommandLifecycleStep[] = [
        {
          stepIndex: 0,
          name: 'CREATED',
          title: '客户端创建指令',
          status: 'finish',
          timestamp: new Date(baseTime).toISOString(),
          durationMs: 0,
        },
        {
          stepIndex: 1,
          name: 'VALIDATING',
          title: '网关安全与权限校验',
          status: 'finish',
          timestamp: new Date(baseTime + 45).toISOString(),
          durationMs: 45,
        },
        {
          stepIndex: 2,
          name: 'QUEUED',
          title: '分布式排他加锁与入队',
          status: 'finish',
          timestamp: new Date(baseTime + 120).toISOString(),
          durationMs: 75,
        },
        {
          stepIndex: 3,
          name: 'SENT',
          title: 'MQTT Broker 报文下发',
          status: 'finish',
          timestamp: new Date(baseTime + 290).toISOString(),
          durationMs: 170,
        },
        {
          stepIndex: 4,
          name: 'WAITING_ACK',
          title: '车载终端执行中',
          status: 'finish',
          timestamp: new Date(baseTime + 310).toISOString(),
          durationMs: 20,
        },
        {
          stepIndex: 5,
          name: 'SUCCESS',
          title: '终端执行成功并应答',
          status: 'finish',
          timestamp: new Date(baseTime + 1085).toISOString(),
          durationMs: 775,
        },
      ];

      const timings: StepTimingBreakdown = calculateStepTimings(steps);

      assert.equal(timings.totalDurationMs, 1085);
      assert.equal(timings.slaLevel, 'NORMAL');
      assert.ok(timings.slaText.includes('健康') || timings.slaText.includes('正常') || timings.slaText.includes('优'));
      assert.equal(timings.validationDurationMs, 45);
      assert.equal(timings.lockingDurationMs, 75);
      assert.equal(timings.downlinkDurationMs, 170);
      assert.equal(timings.ackDurationMs, 795); // 20 + 775 = 795ms

      // Segments check
      assert.equal(timings.segments.length, 4);
      const totalPercent = timings.segments.reduce((acc, seg) => acc + seg.percentage, 0);
      assert.ok(Math.abs(totalPercent - 100) <= 0.5, `Percentages must sum to ~100%, got ${totalPercent}`);
    });

    it('rates SLA as WARNING when total latency is between 1500ms and 3000ms', () => {
      const baseTime = new Date('2026-10-13T10:00:00.000Z').getTime();
      const steps: CommandLifecycleStep[] = [
        {
          stepIndex: 0,
          name: 'CREATED',
          title: '指令创建',
          status: 'finish',
          timestamp: new Date(baseTime).toISOString(),
        },
        {
          stepIndex: 5,
          name: 'SUCCESS',
          title: '终端应答',
          status: 'finish',
          timestamp: new Date(baseTime + 2100).toISOString(),
        },
      ];

      const timings = calculateStepTimings(steps);
      assert.equal(timings.totalDurationMs, 2100);
      assert.equal(timings.slaLevel, 'WARNING');
    });

    it('rates SLA as CRITICAL when total latency exceeds 3000ms', () => {
      const baseTime = new Date('2026-10-13T10:00:00.000Z').getTime();
      const steps: CommandLifecycleStep[] = [
        {
          stepIndex: 0,
          name: 'CREATED',
          title: '指令创建',
          status: 'finish',
          timestamp: new Date(baseTime).toISOString(),
        },
        {
          stepIndex: 5,
          name: 'TIMEOUT',
          title: '超时未应答',
          status: 'error',
          timestamp: new Date(baseTime + 10000).toISOString(),
        },
      ];

      const timings = calculateStepTimings(steps);
      assert.equal(timings.totalDurationMs, 10000);
      assert.equal(timings.slaLevel, 'CRITICAL');
    });

    it('safely handles empty or single-step inputs without divide-by-zero or NaN', () => {
      const emptyTimings = calculateStepTimings([]);
      assert.equal(emptyTimings.totalDurationMs, 0);
      assert.equal(emptyTimings.slaLevel, 'NORMAL');
      assert.equal(Number.isNaN(emptyTimings.segments[0]?.percentage), false);

      const singleTimings = calculateStepTimings([
        {
          stepIndex: 0,
          name: 'CREATED',
          title: '指令创建',
          status: 'process',
          timestamp: new Date().toISOString(),
        },
      ]);
      assert.equal(singleTimings.totalDurationMs, 0);
      assert.equal(singleTimings.slaLevel, 'NORMAL');
    });
  });

  describe('3. 409 Distributed Exclusive Lock Parser (parseCommandLockDetails)', () => {
    it('parses formatted 409 conflict message with lock key, holder command id, and ttl', () => {
      const msg = '409 Conflict: Vehicle veh-001 has active lock lock:cmd:tenant-demo:veh-001 held by cmd-seed-01. TTL: 12s. Retry later.';
      const details = parseCommandLockDetails(msg);

      assert.equal(details.isConflict, true);
      assert.equal(details.lockKey, 'lock:cmd:tenant-demo:veh-001');
      assert.equal(details.holderCommandId, 'cmd-seed-01');
      assert.equal(details.ttlSeconds, 12);
      assert.ok(details.waitSuggestion.length > 0);
    });

    it('parses structured object error with statusCode 409', () => {
      const objErr = {
        statusCode: 409,
        message: '该车辆已有指令正在执行中，请稍候',
        lockKey: 'lock:cmd:tenant-sz:veh-002',
        holderCommandId: 'cmd-active-99',
        ttlSeconds: 15,
      };

      const details = parseCommandLockDetails(objErr);
      assert.equal(details.isConflict, true);
      assert.equal(details.lockKey, 'lock:cmd:tenant-sz:veh-002');
      assert.equal(details.holderCommandId, 'cmd-active-99');
      assert.equal(details.ttlSeconds, 15);
      assert.ok(details.waitSuggestion.includes('排他锁'));
    });

    it('returns isConflict false when error does not indicate 409 lock contention', () => {
      const details = parseCommandLockDetails('500 Internal Server Error');
      assert.equal(details.isConflict, false);
    });
  });

  describe('4. Seed Traces Comprehensive Coverage (SEED_COMMAND_TRACES)', () => {
    it('provides high-fidelity seed traces for SUCCESS, REJECTED, TIMEOUT, and LOCK_CONFLICT', () => {
      assert.ok(SEED_COMMAND_TRACES.length >= 4);

      // 1. SUCCESS trace
      const successTrace = SEED_COMMAND_TRACES.find((t) => t.status === CommandStatus.SUCCESS);
      assert.ok(successTrace);
      assert.equal(successTrace?.commandCode, CommandCode.CMD_UNLOCK);
      assert.ok(successTrace?.steps.length >= 5);
      assert.ok(successTrace?.downlinkPayload);
      assert.ok(successTrace?.uplinkPayload);
      assert.ok((successTrace?.durationMs ?? 0) > 800 && (successTrace?.durationMs ?? 0) < 1500);

      // 2. DEVICE_REJECTED trace (non-P gear)
      const rejectedTrace = SEED_COMMAND_TRACES.find((t) => t.status === CommandStatus.DEVICE_REJECTED);
      assert.ok(rejectedTrace);
      assert.ok(rejectedTrace?.errorMessage?.includes('P档') || rejectedTrace?.errorMessage?.includes('挡位'));
      assert.ok(rejectedTrace?.steps.some((s) => s.status === 'error'));

      // 3. TIMEOUT trace (10s)
      const timeoutTrace = SEED_COMMAND_TRACES.find((t) => t.status === CommandStatus.TIMEOUT);
      assert.ok(timeoutTrace);
      assert.equal(timeoutTrace?.durationMs, 10000);

      // 4. LOCK CONFLICT trace
      const lockTrace = SEED_COMMAND_TRACES.find((t) => t.lockDetails?.isConflict === true);
      assert.ok(lockTrace);
      assert.ok(lockTrace?.lockDetails?.lockKey.startsWith('lock:cmd:'));
    });
  });

  describe('5. API Client & Offline Fallback (fetchCommandTraceApi)', () => {
    it('fetches existing trace from seed pool by commandId', async () => {
      const trace = await fetchCommandTraceApi('cmd-seed-01');
      assert.equal(trace.commandId, 'cmd-seed-01');
      assert.equal(trace.status, CommandStatus.SUCCESS);
      assert.ok(trace.steps.length > 0);
    });

    it('falls back to synthesized trace when commandId is unknown or in memory history', async () => {
      const trace = await fetchCommandTraceApi('cmd-unknown-999');
      assert.ok(trace);
      assert.equal(trace.commandId, 'cmd-unknown-999');
      assert.ok(trace.steps.length >= 2);
    });
  });

  describe('6. Integration with Command Execution Pipeline & Dynamic Trace Synthesis', () => {
    it('synthesizes lifecycle trace steps dynamically when command was newly executed in memory', async () => {
      // 下发一条新指令
      const record = await (await import('../api/command.ts')).executeCommandApi('veh-001', {
        commandCode: CommandCode.CMD_UNLOCK,
        idempotencyKey: `idemp-test-${Date.now()}`,
      });

      // 获取该动态指令的追踪流水
      const trace = await fetchCommandTraceApi(record.id);
      assert.equal(trace.commandId, record.id);
      assert.equal(trace.commandCode, CommandCode.CMD_UNLOCK);
      assert.equal(trace.status, CommandStatus.SUCCESS);
      assert.ok(trace.steps.length >= 6);

      // 验证时延计算
      const timings = calculateStepTimings(trace.steps);
      assert.ok(timings.totalDurationMs >= 0);
      assert.equal(timings.slaLevel, 'NORMAL');
    });
  });
});
