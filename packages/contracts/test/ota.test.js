import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OtaPlanStatus,
  OtaTaskStatus,
  OtaStep,
  FirmwareStatus,
  OtaTargetType,
  DEFAULT_OTA_PRE_CHECK,
  isTerminalOtaTaskStatus,
  canTransitionOtaTaskStatus,
  isTerminalOtaPlanStatus,
  canTransitionOtaPlanStatus,
  MqttTopicBuilder,
  WebSocketEvent,
  WebSocketRoomBuilder,
} from '../dist/index.js';

test('OTA Contracts & Topics Test Suite', async (t) => {
  await t.test('OtaPlanStatus enum exports all 6 lifecycle statuses', () => {
    assert.equal(OtaPlanStatus.DRAFT, 'DRAFT');
    assert.equal(OtaPlanStatus.SCHEDULED, 'SCHEDULED');
    assert.equal(OtaPlanStatus.EXECUTING, 'EXECUTING');
    assert.equal(OtaPlanStatus.PAUSED, 'PAUSED');
    assert.equal(OtaPlanStatus.COMPLETED, 'COMPLETED');
    assert.equal(OtaPlanStatus.CANCELLED, 'CANCELLED');
  });

  await t.test('OtaTaskStatus enum exports all 9 task statuses', () => {
    assert.equal(OtaTaskStatus.QUEUED, 'QUEUED');
    assert.equal(OtaTaskStatus.NOTIFIED, 'NOTIFIED');
    assert.equal(OtaTaskStatus.DOWNLOADING, 'DOWNLOADING');
    assert.equal(OtaTaskStatus.VERIFYING, 'VERIFYING');
    assert.equal(OtaTaskStatus.FLASHING, 'FLASHING');
    assert.equal(OtaTaskStatus.SUCCESS, 'SUCCESS');
    assert.equal(OtaTaskStatus.FAILED, 'FAILED');
    assert.equal(OtaTaskStatus.SKIPPED_UNSAFE, 'SKIPPED_UNSAFE');
    assert.equal(OtaTaskStatus.TIMEOUT, 'TIMEOUT');
  });

  await t.test('OtaStep enum exports 6 physical execution steps', () => {
    assert.equal(OtaStep.DOWNLOADING, 'DOWNLOADING');
    assert.equal(OtaStep.VERIFYING, 'VERIFYING');
    assert.equal(OtaStep.FLASHING, 'FLASHING');
    assert.equal(OtaStep.REBOOTING, 'REBOOTING');
    assert.equal(OtaStep.SUCCESS, 'SUCCESS');
    assert.equal(OtaStep.FAILED, 'FAILED');
  });

  await t.test('OtaStep and OtaTaskStatus are strictly distinct', () => {
    // REBOOTING is only in OtaStep
    assert.equal('REBOOTING' in OtaStep, true);
    assert.equal('REBOOTING' in OtaTaskStatus, false);

    // QUEUED, NOTIFIED, SKIPPED_UNSAFE, TIMEOUT are only in OtaTaskStatus
    assert.equal('QUEUED' in OtaTaskStatus, true);
    assert.equal('QUEUED' in OtaStep, false);
    assert.equal('NOTIFIED' in OtaTaskStatus, true);
    assert.equal('NOTIFIED' in OtaStep, false);
    assert.equal('SKIPPED_UNSAFE' in OtaTaskStatus, true);
    assert.equal('SKIPPED_UNSAFE' in OtaStep, false);
    assert.equal('TIMEOUT' in OtaTaskStatus, true);
    assert.equal('TIMEOUT' in OtaStep, false);
  });

  await t.test('DEFAULT_OTA_PRE_CHECK provides mandatory safety thresholds', () => {
    assert.deepEqual(DEFAULT_OTA_PRE_CHECK, {
      engineOff: true,
      minBatteryVoltage: 12.0,
    });
  });

  await t.test('isTerminalOtaTaskStatus correctly identifies terminal statuses', () => {
    assert.equal(isTerminalOtaTaskStatus(OtaTaskStatus.SUCCESS), true);
    assert.equal(isTerminalOtaTaskStatus(OtaTaskStatus.FAILED), true);
    assert.equal(isTerminalOtaTaskStatus(OtaTaskStatus.TIMEOUT), true);
    assert.equal(isTerminalOtaTaskStatus(OtaTaskStatus.SKIPPED_UNSAFE), true);

    assert.equal(isTerminalOtaTaskStatus(OtaTaskStatus.QUEUED), false);
    assert.equal(isTerminalOtaTaskStatus(OtaTaskStatus.NOTIFIED), false);
    assert.equal(isTerminalOtaTaskStatus(OtaTaskStatus.DOWNLOADING), false);
    assert.equal(isTerminalOtaTaskStatus(OtaTaskStatus.VERIFYING), false);
    assert.equal(isTerminalOtaTaskStatus(OtaTaskStatus.FLASHING), false);
  });

  await t.test('canTransitionOtaTaskStatus validates task state transitions', () => {
    // Valid transitions
    assert.equal(canTransitionOtaTaskStatus(OtaTaskStatus.QUEUED, OtaTaskStatus.NOTIFIED), true);
    assert.equal(canTransitionOtaTaskStatus(OtaTaskStatus.QUEUED, OtaTaskStatus.SKIPPED_UNSAFE), true);
    assert.equal(canTransitionOtaTaskStatus(OtaTaskStatus.QUEUED, OtaTaskStatus.FAILED), true);

    assert.equal(canTransitionOtaTaskStatus(OtaTaskStatus.NOTIFIED, OtaTaskStatus.DOWNLOADING), true);
    assert.equal(canTransitionOtaTaskStatus(OtaTaskStatus.NOTIFIED, OtaTaskStatus.TIMEOUT), true);
    assert.equal(canTransitionOtaTaskStatus(OtaTaskStatus.NOTIFIED, OtaTaskStatus.FAILED), true);

    assert.equal(canTransitionOtaTaskStatus(OtaTaskStatus.DOWNLOADING, OtaTaskStatus.VERIFYING), true);
    assert.equal(canTransitionOtaTaskStatus(OtaTaskStatus.DOWNLOADING, OtaTaskStatus.FAILED), true);
    assert.equal(canTransitionOtaTaskStatus(OtaTaskStatus.DOWNLOADING, OtaTaskStatus.TIMEOUT), true);

    assert.equal(canTransitionOtaTaskStatus(OtaTaskStatus.VERIFYING, OtaTaskStatus.FLASHING), true);
    assert.equal(canTransitionOtaTaskStatus(OtaTaskStatus.VERIFYING, OtaTaskStatus.FAILED), true);
    assert.equal(canTransitionOtaTaskStatus(OtaTaskStatus.VERIFYING, OtaTaskStatus.TIMEOUT), true);

    assert.equal(canTransitionOtaTaskStatus(OtaTaskStatus.FLASHING, OtaTaskStatus.SUCCESS), true);
    assert.equal(canTransitionOtaTaskStatus(OtaTaskStatus.FLASHING, OtaTaskStatus.FAILED), true);
    assert.equal(canTransitionOtaTaskStatus(OtaTaskStatus.FLASHING, OtaTaskStatus.TIMEOUT), true);

    // Terminal transitions must be rejected
    assert.equal(canTransitionOtaTaskStatus(OtaTaskStatus.SUCCESS, OtaTaskStatus.QUEUED), false);
    assert.equal(canTransitionOtaTaskStatus(OtaTaskStatus.FAILED, OtaTaskStatus.DOWNLOADING), false);
    assert.equal(canTransitionOtaTaskStatus(OtaTaskStatus.TIMEOUT, OtaTaskStatus.SUCCESS), false);
    assert.equal(canTransitionOtaTaskStatus(OtaTaskStatus.SKIPPED_UNSAFE, OtaTaskStatus.NOTIFIED), false);

    // Invalid leaps must be rejected
    assert.equal(canTransitionOtaTaskStatus(OtaTaskStatus.QUEUED, OtaTaskStatus.FLASHING), false);
    assert.equal(canTransitionOtaTaskStatus(OtaTaskStatus.NOTIFIED, OtaTaskStatus.SUCCESS), false);
  });

  await t.test('isTerminalOtaPlanStatus and canTransitionOtaPlanStatus work as expected', () => {
    assert.equal(isTerminalOtaPlanStatus(OtaPlanStatus.COMPLETED), true);
    assert.equal(isTerminalOtaPlanStatus(OtaPlanStatus.CANCELLED), true);
    assert.equal(isTerminalOtaPlanStatus(OtaPlanStatus.DRAFT), false);
    assert.equal(isTerminalOtaPlanStatus(OtaPlanStatus.SCHEDULED), false);
    assert.equal(isTerminalOtaPlanStatus(OtaPlanStatus.EXECUTING), false);
    assert.equal(isTerminalOtaPlanStatus(OtaPlanStatus.PAUSED), false);

    // Plan transitions
    assert.equal(canTransitionOtaPlanStatus(OtaPlanStatus.DRAFT, OtaPlanStatus.SCHEDULED), true);
    assert.equal(canTransitionOtaPlanStatus(OtaPlanStatus.DRAFT, OtaPlanStatus.EXECUTING), true);
    assert.equal(canTransitionOtaPlanStatus(OtaPlanStatus.DRAFT, OtaPlanStatus.CANCELLED), true);
    assert.equal(canTransitionOtaPlanStatus(OtaPlanStatus.SCHEDULED, OtaPlanStatus.EXECUTING), true);
    assert.equal(canTransitionOtaPlanStatus(OtaPlanStatus.SCHEDULED, OtaPlanStatus.CANCELLED), true);
    assert.equal(canTransitionOtaPlanStatus(OtaPlanStatus.EXECUTING, OtaPlanStatus.PAUSED), true);
    assert.equal(canTransitionOtaPlanStatus(OtaPlanStatus.EXECUTING, OtaPlanStatus.COMPLETED), true);
    assert.equal(canTransitionOtaPlanStatus(OtaPlanStatus.EXECUTING, OtaPlanStatus.CANCELLED), true);
    assert.equal(canTransitionOtaPlanStatus(OtaPlanStatus.PAUSED, OtaPlanStatus.EXECUTING), true);
    assert.equal(canTransitionOtaPlanStatus(OtaPlanStatus.PAUSED, OtaPlanStatus.CANCELLED), true);
    assert.equal(canTransitionOtaPlanStatus(OtaPlanStatus.PAUSED, OtaPlanStatus.COMPLETED), true);

    // Terminal plan transitions rejected
    assert.equal(canTransitionOtaPlanStatus(OtaPlanStatus.COMPLETED, OtaPlanStatus.EXECUTING), false);
    assert.equal(canTransitionOtaPlanStatus(OtaPlanStatus.CANCELLED, OtaPlanStatus.DRAFT), false);
  });

  await t.test('MqttTopicBuilder builds and parses OTA topics correctly', () => {
    const upgradeTopic = MqttTopicBuilder.otaUpgrade('PK_TEST', 'DEV_001');
    assert.equal(upgradeTopic, '/sys/PK_TEST/DEV_001/ota/upgrade');

    const progressTopic = MqttTopicBuilder.otaProgress('PK_TEST', 'DEV_001');
    assert.equal(progressTopic, '/sys/PK_TEST/DEV_001/ota/progress');

    const parsedUpgrade = MqttTopicBuilder.parse(upgradeTopic);
    assert.deepEqual(parsedUpgrade, {
      productKey: 'PK_TEST',
      deviceNo: 'DEV_001',
      action: 'ota/upgrade',
    });

    const parsedProgress = MqttTopicBuilder.parse(progressTopic);
    assert.deepEqual(parsedProgress, {
      productKey: 'PK_TEST',
      deviceNo: 'DEV_001',
      action: 'ota/progress',
    });
  });

  await t.test('WebSocketEvent and WebSocketRoomBuilder export OTA events and rooms', () => {
    assert.equal(WebSocketEvent.OTA_PROGRESS, 'ota.progress');
    assert.equal(WebSocketEvent.OTA_COMPLETED, 'ota.completed');
    assert.equal(WebSocketRoomBuilder.otaPlanRoom('plan-uuid-999'), 'ota-plan:plan-uuid-999');
  });

  await t.test('instantiates valid OTA DTO objects', () => {
    /** @type {import('../dist/index.js').FirmwarePackageDto} */
    const firmware = {
      id: 'fw-1',
      tenantId: 'tenant-1',
      name: 'TBox-v2.0',
      version: '2.0.0',
      targetModelId: 'model-1',
      hardwareVersion: 'HW-V2',
      fileUrl: 'https://cdn.example.com/fw/v2.bin',
      fileSizeBytes: 1048576,
      checksumSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      checksumMd5: 'd41d8cd98f00b204e9800998ecf8427e',
      description: 'Test firmware',
      status: 'ACTIVE',
      createdAt: new Date(),
    };
    assert.equal(firmware.name, 'TBox-v2.0');

    /** @type {import('../dist/index.js').OtaPlanDto} */
    const plan = {
      id: 'plan-1',
      tenantId: 'tenant-1',
      name: 'Batch Update Plan 1',
      firmwareId: 'fw-1',
      targetType: 'MODEL',
      targetIds: ['model-1'],
      status: OtaPlanStatus.EXECUTING,
      batchSize: 100,
      batchIntervalSec: 30,
      maxRetries: 3,
      preCheckRequired: { engineOff: true, minBatteryVoltage: 12.0 },
      totalDevices: 10,
      successDevices: 8,
      failedDevices: 2,
      createdAt: new Date(),
    };
    assert.equal(plan.batchSize, 100);

    /** @type {import('../dist/index.js').OtaDeviceTaskDto} */
    const task = {
      id: 'task-1',
      tenantId: 'tenant-1',
      planId: 'plan-1',
      vehicleId: 'veh-1',
      deviceNo: 'DEV-001',
      firmwareVersion: '2.0.0',
      status: OtaTaskStatus.DOWNLOADING,
      currentStep: OtaStep.DOWNLOADING,
      progressPercent: 45,
      retryCount: 0,
      notifiedAt: new Date(),
    };
    assert.equal(task.progressPercent, 45);

    /** @type {import('../dist/index.js').OtaUpgradeDownlinkPayload} */
    const downlink = {
      traceId: 'tr-1',
      planId: 'plan-1',
      taskId: 'task-1',
      version: '2.0.0',
      fileUrl: 'https://cdn.example.com/fw/v2.bin',
      fileSizeBytes: 1048576,
      checksumSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    };
    assert.equal(downlink.version, '2.0.0');

    /** @type {import('../dist/index.js').OtaProgressPayload} */
    const progress = {
      planId: 'plan-1',
      taskId: 'task-1',
      deviceNo: 'DEV-001',
      step: OtaStep.DOWNLOADING,
      progressPercent: 50,
      currentChunk: 5,
      totalChunks: 10,
    };
    assert.equal(progress.step, OtaStep.DOWNLOADING);
  });
});
