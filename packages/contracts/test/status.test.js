import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CommandStatus,
  canTransitionStatus,
  isTerminalStatus,
  TERMINAL_COMMAND_STATUSES,
} from '../dist/index.js';

test('CommandStatus transitions test suite', async (t) => {
  await t.test('allows valid CREATED -> VALIDATING transition', () => {
    assert.equal(canTransitionStatus(CommandStatus.CREATED, CommandStatus.VALIDATING), true);
  });

  await t.test('allows valid WAITING_ACK -> SUCCESS transition', () => {
    assert.equal(canTransitionStatus(CommandStatus.WAITING_ACK, CommandStatus.SUCCESS), true);
  });

  await t.test('allows valid WAITING_ACK -> TIMEOUT transition', () => {
    assert.equal(canTransitionStatus(CommandStatus.WAITING_ACK, CommandStatus.TIMEOUT), true);
  });

  await t.test('rejects transition from terminal SUCCESS state', () => {
    assert.equal(isTerminalStatus(CommandStatus.SUCCESS), true);
    assert.equal(canTransitionStatus(CommandStatus.SUCCESS, CommandStatus.WAITING_ACK), false);
    assert.equal(canTransitionStatus(CommandStatus.SUCCESS, CommandStatus.FAILED), false);
  });

  await t.test('rejects transition from terminal TIMEOUT state (late ACK idempotent protection)', () => {
    assert.equal(isTerminalStatus(CommandStatus.TIMEOUT), true);
    assert.equal(canTransitionStatus(CommandStatus.TIMEOUT, CommandStatus.SUCCESS), false);
  });
});
