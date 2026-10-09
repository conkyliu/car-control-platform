import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AlarmType,
  AlarmLevel,
  AlarmStatus,
  CommunicationDirection,
  CommunicationChannel,
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
});
