import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MqttTopicBuilder,
  CommandCode,
  DeviceCommandDownlinkPayload,
  DeviceCommandAckUplinkPayload,
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
});
