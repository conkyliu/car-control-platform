import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AlarmType,
  AlarmLevel,
  AlarmStatus,
  CommunicationDirection,
  CommunicationChannel,
  OtaPlanStatus,
  OtaTaskStatus,
  OtaStep,
  FirmwareStatus,
  OtaTargetType,
} from '@car-control/contracts';

test('Domain types entities verification', async (t) => {
  await t.test('instantiates valid AlarmRecord shape', () => {
    /** @type {import('../dist/index.js').AlarmRecord} */
    const alarm = {
      id: 'alm-001',
      tenantId: 'tenant-1',
      projectId: 'proj-1',
      vehicleId: 'veh-1',
      deviceNo: 'DEV123456',
      alarmType: AlarmType.LOW_BATTERY,
      alarmLevel: AlarmLevel.WARNING,
      lat: 31.23,
      lng: 121.47,
      speed: 0,
      status: AlarmStatus.PENDING,
      message: 'Battery low',
      triggeredAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    assert.equal(alarm.id, 'alm-001');
    assert.equal(alarm.alarmType, AlarmType.LOW_BATTERY);
    assert.equal(alarm.alarmLevel, AlarmLevel.WARNING);
    assert.equal(alarm.status, AlarmStatus.PENDING);
  });

  await t.test('instantiates valid LocationRecord shape', () => {
    /** @type {import('../dist/index.js').LocationRecord} */
    const location = {
      id: 'loc-001',
      tenantId: 'tenant-1',
      vehicleId: 'veh-1',
      deviceNo: 'DEV123456',
      lat: 31.230416,
      lng: 121.473701,
      speed: 60.5,
      gpsValid: true,
      timestamp: Date.now(),
      createdAt: new Date(),
    };

    assert.equal(location.lat, 31.230416);
    assert.equal(location.gpsValid, true);
  });

  await t.test('instantiates valid CommunicationLog shape', () => {
    /** @type {import('../dist/index.js').CommunicationLog} */
    const log = {
      id: 'log-001',
      tenantId: 'tenant-1',
      vehicleId: 'veh-1',
      deviceNo: 'DEV123456',
      direction: CommunicationDirection.UPLINK,
      channel: CommunicationChannel.MQTT,
      topic: '/sys/PK123/DEV123456/location',
      payload: { lat: 31.23, lng: 121.47 },
      createdAt: new Date(),
    };

    assert.equal(log.direction, 'UPLINK');
    assert.equal(log.channel, 'MQTT');
  });

  await t.test('instantiates valid FirmwarePackage entity', () => {
    /** @type {import('../dist/index.js').FirmwarePackage} */
    const firmware = {
      id: 'fw-001',
      tenantId: 'tenant-1',
      name: 'T-Box Release v2.1.0',
      version: '2.1.0',
      targetModelId: 'model-suv-01',
      hardwareVersion: 'HW-TBOX-V2.1',
      fileUrl: 'https://cdn.example.com/fw/tbox-v2.1.0.bin',
      fileSizeBytes: 10485760,
      checksumSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      checksumMd5: 'd41d8cd98f00b204e9800998ecf8427e',
      description: 'Production firmware release with power optimization',
      status: FirmwareStatus.ACTIVE,
      createdAt: new Date(),
    };

    assert.equal(firmware.id, 'fw-001');
    assert.equal(firmware.version, '2.1.0');
    assert.equal(firmware.status, 'ACTIVE');
  });

  await t.test('instantiates valid OtaPlan entity', () => {
    /** @type {import('../dist/index.js').OtaPlan} */
    const plan = {
      id: 'plan-001',
      tenantId: 'tenant-1',
      name: '2026 Q4 TBox OTA Rollout',
      firmwareId: 'fw-001',
      targetType: OtaTargetType.MODEL,
      targetIds: ['model-suv-01'],
      status: OtaPlanStatus.SCHEDULED,
      batchSize: 100,
      batchIntervalSec: 30,
      maxRetries: 3,
      preCheckRequired: { engineOff: true, minBatteryVoltage: 12.0 },
      totalDevices: 500,
      successDevices: 0,
      failedDevices: 0,
      createdAt: new Date(),
    };

    assert.equal(plan.id, 'plan-001');
    assert.equal(plan.targetType, 'MODEL');
    assert.equal(plan.status, 'SCHEDULED');
    assert.equal(plan.preCheckRequired.minBatteryVoltage, 12.0);
  });

  await t.test('instantiates valid OtaDeviceTask entity', () => {
    /** @type {import('../dist/index.js').OtaDeviceTask} */
    const task = {
      id: 'task-001',
      tenantId: 'tenant-1',
      planId: 'plan-001',
      vehicleId: 'veh-001',
      deviceNo: 'DEV-TBOX-00123',
      firmwareVersion: '2.1.0',
      status: OtaTaskStatus.QUEUED,
      currentStep: OtaStep.DOWNLOADING,
      progressPercent: 0,
      retryCount: 0,
      createdAt: new Date(),
    };

    assert.equal(task.id, 'task-001');
    assert.equal(task.status, 'QUEUED');
    assert.equal(task.currentStep, 'DOWNLOADING');
  });
});
