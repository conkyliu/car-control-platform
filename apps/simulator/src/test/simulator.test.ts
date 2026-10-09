import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MqttTopicBuilder,
  CommandCode,
  DeviceCommandDownlinkPayload,
  DeviceCommandAckUplinkPayload,
  AlarmType,
  AlarmLevel,
  TelemetryLocationPayload,
  UplinkAlarmPayload,
} from '@car-control/contracts';
import { DeviceSimulator, InMemoryTransport } from '../index.js';

test('DeviceSimulator test suite', async (t) => {
  const productKey = 'PK_TEST';
  const deviceNo = 'DEV_001';

  await t.test('publishes online status on start', async () => {
    const transport = new InMemoryTransport();
    let statusReceived: any = null;

    const statusTopic = MqttTopicBuilder.status(productKey, deviceNo);
    await transport.subscribe(statusTopic, (_topic, payload) => {
      statusReceived = JSON.parse(payload.toString());
    });

    const sim = new DeviceSimulator({ productKey, deviceNo }, transport);
    await sim.start();

    // 等待微任务派发
    await new Promise((r) => setTimeout(r, 50));

    assert.ok(statusReceived);
    assert.equal(statusReceived.online, true);
    assert.equal(statusReceived.deviceNo, deviceNo);

    await sim.stop();
  });

  await t.test('receives command and responds with SUCCESS ACK', async () => {
    const transport = new InMemoryTransport();
    let ackReceived: any = null;

    const ackTopic = MqttTopicBuilder.commandAck(productKey, deviceNo);
    await transport.subscribe(ackTopic, (_topic, payload) => {
      ackReceived = JSON.parse(payload.toString());
    });

    const sim = new DeviceSimulator(
      {
        productKey,
        deviceNo,
        defaultLatencyMs: 20,
      },
      transport
    );
    await sim.start();

    const cmdDownTopic = MqttTopicBuilder.commandDown(productKey, deviceNo);
    const downlink: DeviceCommandDownlinkPayload = {
      traceId: 'trace-1',
      requestId: 'req-1',
      commandId: 'cmd-1',
      commandCode: CommandCode.CMD_UNLOCK,
      timestamp: Date.now(),
    };

    await transport.publish(cmdDownTopic, downlink);

    // 等待模拟器处理并返回 ACK
    await new Promise((r) => setTimeout(r, 80));

    assert.ok(ackReceived);
    assert.equal(ackReceived!.commandId, 'cmd-1');
    assert.equal(ackReceived!.commandCode, CommandCode.CMD_UNLOCK);
    assert.equal(ackReceived!.code, 0);
    assert.equal(ackReceived!.message, 'SUCCESS');

    await sim.stop();
  });

  await t.test('rejects command if specified in rejectCommands', async () => {
    const transport = new InMemoryTransport();
    let ackReceived: any = null;

    const ackTopic = MqttTopicBuilder.commandAck(productKey, deviceNo);
    await transport.subscribe(ackTopic, (_topic, payload) => {
      ackReceived = JSON.parse(payload.toString());
    });

    const sim = new DeviceSimulator(
      {
        productKey,
        deviceNo,
        defaultLatencyMs: 10,
        rejectCommands: [CommandCode.CMD_ENGINE_START],
      },
      transport
    );
    await sim.start();

    const cmdDownTopic = MqttTopicBuilder.commandDown(productKey, deviceNo);
    await transport.publish(cmdDownTopic, {
      traceId: 'trace-2',
      requestId: 'req-2',
      commandId: 'cmd-2',
      commandCode: CommandCode.CMD_ENGINE_START,
      timestamp: Date.now(),
    });

    await new Promise((r) => setTimeout(r, 60));

    assert.ok(ackReceived);
    assert.equal(ackReceived!.code, 1001);
    assert.match(ackReceived!.message, /DEVICE_REJECTED/);

    await sim.stop();
  });

  await t.test('drops ACK when dropAck is enabled', async () => {
    const transport = new InMemoryTransport();
    let ackReceived = false;

    const ackTopic = MqttTopicBuilder.commandAck(productKey, deviceNo);
    await transport.subscribe(ackTopic, () => {
      ackReceived = true;
    });

    const sim = new DeviceSimulator(
      {
        productKey,
        deviceNo,
        dropAck: true,
      },
      transport
    );
    await sim.start();

    const cmdDownTopic = MqttTopicBuilder.commandDown(productKey, deviceNo);
    await transport.publish(cmdDownTopic, {
      traceId: 'trace-3',
      requestId: 'req-3',
      commandId: 'cmd-3',
      commandCode: CommandCode.CMD_LOCK,
      timestamp: Date.now(),
    });

    await new Promise((r) => setTimeout(r, 60));

    assert.equal(ackReceived, false);
    assert.equal(sim.getTelemetry().acksDropped, 1);

    await sim.stop();
  });

  await t.test('reports location with defaults and publishes to MQTT topics', async () => {
    const transport = new InMemoryTransport();
    let standardLocationReceived: TelemetryLocationPayload | null = null;
    let legacyLocationReceived: TelemetryLocationPayload | null = null;

    const standardTopic = MqttTopicBuilder.location(productKey, deviceNo);
    const legacyTopic = `car/up/${productKey}/${deviceNo}/telemetry/location`;

    await transport.subscribe(standardTopic, (_topic, payload) => {
      standardLocationReceived = JSON.parse(payload.toString());
    });
    await transport.subscribe(legacyTopic, (_topic, payload) => {
      legacyLocationReceived = JSON.parse(payload.toString());
    });

    const sim = new DeviceSimulator({ productKey, deviceNo }, transport);
    await sim.start();

    const result = await sim.reportLocation();

    // 等待微任务派发
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(result.lat, 22.54286);
    assert.equal(result.lng, 114.05956);
    assert.equal(result.speed, 60);
    assert.equal(result.heading, 90);
    assert.equal(result.gpsValid, true);
    assert.ok(result.timestamp > 0);

    assert.deepEqual(standardLocationReceived, result);
    assert.deepEqual(legacyLocationReceived, result);

    await sim.stop();
  });

  await t.test('reports location with custom parameters', async () => {
    const transport = new InMemoryTransport();
    let receivedPayload: TelemetryLocationPayload | null = null;

    const standardTopic = MqttTopicBuilder.location(productKey, deviceNo);
    await transport.subscribe(standardTopic, (_topic, payload) => {
      receivedPayload = JSON.parse(payload.toString());
    });

    const sim = new DeviceSimulator({ productKey, deviceNo }, transport);
    await sim.start();

    const customData: Partial<TelemetryLocationPayload> = {
      lat: 31.2304,
      lng: 121.4737,
      speed: 75,
      heading: 180,
      altitude: 15,
      mileage: 12345.6,
      gpsValid: false,
    };

    const result = await sim.reportLocation(customData);
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(result.lat, 31.2304);
    assert.equal(result.lng, 121.4737);
    assert.equal(result.speed, 75);
    assert.equal(result.heading, 180);
    assert.equal(result.altitude, 15);
    assert.equal(result.mileage, 12345.6);
    assert.equal(result.gpsValid, false);
    assert.ok(result.timestamp > 0);

    assert.deepEqual(receivedPayload, result);

    await sim.stop();
  });

  await t.test('reports alarm with coords and publishes to MQTT topics', async () => {
    const transport = new InMemoryTransport();
    let standardAlarmReceived: UplinkAlarmPayload | null = null;
    let legacyAlarmReceived: UplinkAlarmPayload | null = null;

    const standardTopic = MqttTopicBuilder.alarm(productKey, deviceNo);
    const legacyTopic = `car/up/${productKey}/${deviceNo}/alarm/report`;

    await transport.subscribe(standardTopic, (_topic, payload) => {
      standardAlarmReceived = JSON.parse(payload.toString());
    });
    await transport.subscribe(legacyTopic, (_topic, payload) => {
      legacyAlarmReceived = JSON.parse(payload.toString());
    });

    const sim = new DeviceSimulator({ productKey, deviceNo }, transport);
    await sim.start();

    const result = await sim.reportAlarm(
      AlarmType.LOW_BATTERY,
      AlarmLevel.WARNING,
      'Low 12V battery voltage',
      { lat: 22.54286, lng: 114.05956 }
    );

    await new Promise((r) => setTimeout(r, 50));

    assert.equal(result.alarmType, AlarmType.LOW_BATTERY);
    assert.equal(result.alarmLevel, AlarmLevel.WARNING);
    assert.equal(result.message, 'Low 12V battery voltage');
    assert.equal(result.lat, 22.54286);
    assert.equal(result.lng, 114.05956);
    assert.ok(result.timestamp > 0);

    assert.deepEqual(standardAlarmReceived, result);
    assert.deepEqual(legacyAlarmReceived, result);

    await sim.stop();
  });

  await t.test('reports alarm without optional coords or message', async () => {
    const transport = new InMemoryTransport();
    let standardAlarmReceived: UplinkAlarmPayload | null = null;

    const standardTopic = MqttTopicBuilder.alarm(productKey, deviceNo);
    await transport.subscribe(standardTopic, (_topic, payload) => {
      standardAlarmReceived = JSON.parse(payload.toString());
    });

    const sim = new DeviceSimulator({ productKey, deviceNo }, transport);
    await sim.start();

    const result = await sim.reportAlarm(AlarmType.SOS, AlarmLevel.CRITICAL);

    await new Promise((r) => setTimeout(r, 50));

    assert.equal(result.alarmType, AlarmType.SOS);
    assert.equal(result.alarmLevel, AlarmLevel.CRITICAL);
    assert.equal(result.message, undefined);
    assert.equal(result.lat, undefined);
    assert.equal(result.lng, undefined);
    assert.ok(result.timestamp > 0);

    assert.deepEqual(standardAlarmReceived, result);

    await sim.stop();
  });
});
