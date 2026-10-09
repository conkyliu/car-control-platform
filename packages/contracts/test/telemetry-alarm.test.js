import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AlarmType,
  AlarmLevel,
  AlarmStatus,
  WebSocketEvent,
  CommunicationDirection,
  CommunicationChannel,
  canTransitionAlarmStatus,
  isTerminalAlarmStatus,
  TrajectoryTolerance,
} from '../dist/index.js';

test('Telemetry, Alarm, and Communication Log Contracts Suite', async (t) => {
  await t.test('AlarmType enum exports all 8 standard alarm types', () => {
    assert.equal(AlarmType.LOW_BATTERY, 'LOW_BATTERY');
    assert.equal(AlarmType.VIBRATION, 'VIBRATION');
    assert.equal(AlarmType.OVERSPEED, 'OVERSPEED');
    assert.equal(AlarmType.POWER_CUT, 'POWER_CUT');
    assert.equal(AlarmType.SOS, 'SOS');
    assert.equal(AlarmType.TOW_AWAY, 'TOW_AWAY');
    assert.equal(AlarmType.GEOFENCE_IN, 'GEOFENCE_IN');
    assert.equal(AlarmType.GEOFENCE_OUT, 'GEOFENCE_OUT');
  });

  await t.test('AlarmLevel enum exports 3 severity levels', () => {
    assert.equal(AlarmLevel.INFO, 'INFO');
    assert.equal(AlarmLevel.WARNING, 'WARNING');
    assert.equal(AlarmLevel.CRITICAL, 'CRITICAL');
  });

  await t.test('AlarmStatus enum exports lifecycle statuses', () => {
    assert.equal(AlarmStatus.PENDING, 'PENDING');
    assert.equal(AlarmStatus.PROCESSED, 'PROCESSED');
    assert.equal(AlarmStatus.IGNORED, 'IGNORED');
  });

  await t.test('AlarmStatus transition and terminal state rules', () => {
    assert.equal(isTerminalAlarmStatus(AlarmStatus.PENDING), false);
    assert.equal(isTerminalAlarmStatus(AlarmStatus.PROCESSED), true);
    assert.equal(isTerminalAlarmStatus(AlarmStatus.IGNORED), true);

    assert.equal(canTransitionAlarmStatus(AlarmStatus.PENDING, AlarmStatus.PROCESSED), true);
    assert.equal(canTransitionAlarmStatus(AlarmStatus.PENDING, AlarmStatus.IGNORED), true);
    assert.equal(canTransitionAlarmStatus(AlarmStatus.PROCESSED, AlarmStatus.PENDING), false);
    assert.equal(canTransitionAlarmStatus(AlarmStatus.IGNORED, AlarmStatus.PROCESSED), false);
    assert.equal(canTransitionAlarmStatus(AlarmStatus.PROCESSED, AlarmStatus.IGNORED), false);
  });

  await t.test('WebSocketEvent includes required gate 4 events', () => {
    assert.equal(WebSocketEvent.LOCATION_UPDATED, 'location.updated');
    assert.equal(WebSocketEvent.ALARM_TRIGGERED, 'alarm.triggered');
    assert.equal(WebSocketEvent.ALARM_PROCESSED, 'alarm.processed');
  });

  await t.test('Communication logs direction and channel enums', () => {
    assert.equal(CommunicationDirection.UPLINK, 'UPLINK');
    assert.equal(CommunicationDirection.DOWNLINK, 'DOWNLINK');
    assert.equal(CommunicationChannel.MQTT, 'MQTT');
    assert.equal(CommunicationChannel.TCP, 'TCP');
    assert.equal(CommunicationChannel.HTTP, 'HTTP');
  });

  await t.test('TrajectoryTolerance defines standard epsilon values', () => {
    assert.equal(TrajectoryTolerance.HIGH_PRECISION, 0.00003);
    assert.equal(TrajectoryTolerance.DEFAULT, 0.0001);
    assert.equal(TrajectoryTolerance.OVERVIEW, 0.0005);
  });
});
