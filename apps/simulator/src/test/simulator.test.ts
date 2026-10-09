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
  OtaStep,
  OtaUpgradeDownlinkPayload,
  OtaProgressPayload,
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

  await t.test('OTA upgrade happy path: completes download, verify, flash, success and updates firmwareVersion', async () => {
    const transport = new InMemoryTransport();
    const progressList: OtaProgressPayload[] = [];
    const legacyProgressList: OtaProgressPayload[] = [];

    const progressTopic = MqttTopicBuilder.otaProgress(productKey, deviceNo);
    const legacyProgressTopic = `car/up/${productKey}/${deviceNo}/ota/progress`;

    await transport.subscribe(progressTopic, (_topic, payload) => {
      progressList.push(JSON.parse(payload.toString()));
    });
    await transport.subscribe(legacyProgressTopic, (_topic, payload) => {
      legacyProgressList.push(JSON.parse(payload.toString()));
    });

    const sim = new DeviceSimulator(
      {
        productKey,
        deviceNo,
        currentFirmwareVersion: 'v1.0.0-sim',
        simulatedBatteryVoltage: 12.8,
        otaDownloadIntervalMs: 5,
      },
      transport
    );
    await sim.start();

    const otaDownTopic = MqttTopicBuilder.otaUpgrade(productKey, deviceNo);
    const downlink: OtaUpgradeDownlinkPayload = {
      traceId: 'trace-ota-1',
      planId: 'plan-101',
      taskId: 'task-101',
      version: 'v2.0.0',
      fileUrl: 'https://cdn.example.com/firmware/v2.0.0.bin',
      fileSizeBytes: 1048576,
      checksumSha256: 'a1b2c3d4e5f60000000000000000000000000000000000000000000000000000',
    };

    await transport.publish(otaDownTopic, downlink);

    // 等待 OTA 仿真流程完成 (6 步 * 5ms + overhead)
    await new Promise((r) => setTimeout(r, 100));

    // 验证上报进度序列
    assert.equal(progressList.length, 6);
    assert.deepEqual(
      progressList.map((p) => ({ step: p.step, percent: p.progressPercent, chunk: p.currentChunk })),
      [
        { step: OtaStep.DOWNLOADING, percent: 25, chunk: 1 },
        { step: OtaStep.DOWNLOADING, percent: 50, chunk: 2 },
        { step: OtaStep.DOWNLOADING, percent: 100, chunk: 4 },
        { step: OtaStep.VERIFYING, percent: 100, chunk: undefined },
        { step: OtaStep.FLASHING, percent: 100, chunk: undefined },
        { step: OtaStep.SUCCESS, percent: 100, chunk: undefined },
      ]
    );

    // 验证兼容别名 Topic 同样收到全部消息
    assert.equal(legacyProgressList.length, 6);
    assert.deepEqual(progressList, legacyProgressList);

    // 验证遥测状态更新
    const telemetry = sim.getTelemetry();
    assert.equal(telemetry.firmwareVersion, 'v2.0.0');
    assert.equal(telemetry.otaTasksReceived, 1);
    assert.equal(telemetry.otaProgressSent, 6);
    assert.equal(telemetry.lastOtaStep, OtaStep.SUCCESS);

    await sim.stop();
  });

  await t.test('OTA upgrade safety pre-check rejects when simulatedEngineRunning is true', async () => {
    const transport = new InMemoryTransport();
    const progressList: OtaProgressPayload[] = [];

    const progressTopic = MqttTopicBuilder.otaProgress(productKey, deviceNo);
    await transport.subscribe(progressTopic, (_topic, payload) => {
      progressList.push(JSON.parse(payload.toString()));
    });

    const sim = new DeviceSimulator(
      {
        productKey,
        deviceNo,
        simulatedEngineRunning: true,
        simulatedBatteryVoltage: 12.6,
        currentFirmwareVersion: 'v1.0.0',
      },
      transport
    );
    await sim.start();

    const otaDownTopic = MqttTopicBuilder.otaUpgrade(productKey, deviceNo);
    await transport.publish(otaDownTopic, {
      traceId: 'trace-ota-engine',
      planId: 'plan-102',
      taskId: 'task-102',
      version: 'v2.0.0',
      fileUrl: 'https://cdn.example.com/fw.bin',
      fileSizeBytes: 1024,
      checksumSha256: 'deadbeef',
    });

    await new Promise((r) => setTimeout(r, 50));

    assert.equal(progressList.length, 1);
    const p = progressList[0];
    assert.equal(p.step, OtaStep.FAILED);
    assert.equal(p.progressPercent, 0);
    assert.equal(p.errorCode, 1002);
    assert.equal(p.errorMessage, 'PRECHECK_FAILED_ENGINE_ON');

    const telemetry = sim.getTelemetry();
    assert.equal(telemetry.firmwareVersion, 'v1.0.0');
    assert.equal(telemetry.otaTasksReceived, 1);
    assert.equal(telemetry.otaProgressSent, 1);
    assert.equal(telemetry.lastOtaStep, OtaStep.FAILED);

    await sim.stop();
  });

  await t.test('OTA upgrade safety pre-check rejects when simulatedBatteryVoltage is < 12.0', async () => {
    const transport = new InMemoryTransport();
    const progressList: OtaProgressPayload[] = [];

    const progressTopic = MqttTopicBuilder.otaProgress(productKey, deviceNo);
    await transport.subscribe(progressTopic, (_topic, payload) => {
      progressList.push(JSON.parse(payload.toString()));
    });

    const sim = new DeviceSimulator(
      {
        productKey,
        deviceNo,
        simulatedBatteryVoltage: 11.5,
        currentFirmwareVersion: 'v1.0.0',
      },
      transport
    );
    await sim.start();

    const otaDownTopic = MqttTopicBuilder.otaUpgrade(productKey, deviceNo);
    await transport.publish(otaDownTopic, {
      traceId: 'trace-ota-battery',
      planId: 'plan-103',
      taskId: 'task-103',
      version: 'v2.0.0',
      fileUrl: 'https://cdn.example.com/fw.bin',
      fileSizeBytes: 1024,
      checksumSha256: 'deadbeef',
    });

    await new Promise((r) => setTimeout(r, 50));

    assert.equal(progressList.length, 1);
    const p = progressList[0];
    assert.equal(p.step, OtaStep.FAILED);
    assert.equal(p.progressPercent, 0);
    assert.equal(p.errorCode, 1001);
    assert.equal(p.errorMessage, 'PRECHECK_FAILED_LOW_VOLTAGE');

    const telemetry = sim.getTelemetry();
    assert.equal(telemetry.batteryVoltage, 11.5);
    assert.equal(telemetry.firmwareVersion, 'v1.0.0');
    assert.equal(telemetry.otaTasksReceived, 1);
    assert.equal(telemetry.otaProgressSent, 1);
    assert.equal(telemetry.lastOtaStep, OtaStep.FAILED);

    await sim.stop();
  });

  await t.test('OTA upgrade failure simulation at DOWNLOADING, VERIFYING, and FLASHING steps', async () => {
    // 1. Fail at DOWNLOADING
    {
      const transport = new InMemoryTransport();
      const progressList: OtaProgressPayload[] = [];
      const progressTopic = MqttTopicBuilder.otaProgress(productKey, deviceNo);
      await transport.subscribe(progressTopic, (_topic, payload) => {
        progressList.push(JSON.parse(payload.toString()));
      });

      const sim = new DeviceSimulator(
        { productKey, deviceNo, failOtaAtStep: OtaStep.DOWNLOADING, otaDownloadIntervalMs: 5 },
        transport
      );
      await sim.start();

      await transport.publish(MqttTopicBuilder.otaUpgrade(productKey, deviceNo), {
        traceId: 'trace-dl-fail',
        planId: 'plan-dl',
        taskId: 'task-dl',
        version: 'v2.0.0',
        fileUrl: 'https://cdn.example.com/fw.bin',
        fileSizeBytes: 1024,
        checksumSha256: 'deadbeef',
      });

      await new Promise((r) => setTimeout(r, 50));

      assert.equal(progressList.length, 1);
      assert.equal(progressList[0].step, OtaStep.FAILED);
      assert.equal(progressList[0].errorCode, 2001);
      assert.equal(progressList[0].errorMessage, 'DOWNLOAD_FAILED');
      assert.equal(sim.getTelemetry().lastOtaStep, OtaStep.FAILED);

      await sim.stop();
    }

    // 2. Fail at VERIFYING
    {
      const transport = new InMemoryTransport();
      const progressList: OtaProgressPayload[] = [];
      const progressTopic = MqttTopicBuilder.otaProgress(productKey, deviceNo);
      await transport.subscribe(progressTopic, (_topic, payload) => {
        progressList.push(JSON.parse(payload.toString()));
      });

      const sim = new DeviceSimulator(
        { productKey, deviceNo, failOtaAtStep: OtaStep.VERIFYING, otaDownloadIntervalMs: 5 },
        transport
      );
      await sim.start();

      await transport.publish(MqttTopicBuilder.otaUpgrade(productKey, deviceNo), {
        traceId: 'trace-ver-fail',
        planId: 'plan-ver',
        taskId: 'task-ver',
        version: 'v2.0.0',
        fileUrl: 'https://cdn.example.com/fw.bin',
        fileSizeBytes: 1024,
        checksumSha256: 'deadbeef',
      });

      await new Promise((r) => setTimeout(r, 60));

      // 3 DOWNLOADING chunks (25, 50, 100) + 1 FAILED
      assert.equal(progressList.length, 4);
      const last = progressList[progressList.length - 1];
      assert.equal(last.step, OtaStep.FAILED);
      assert.equal(last.errorCode, 3001);
      assert.equal(last.errorMessage, 'CHECKSUM_MISMATCH');
      assert.equal(sim.getTelemetry().lastOtaStep, OtaStep.FAILED);

      await sim.stop();
    }

    // 3. Fail at FLASHING
    {
      const transport = new InMemoryTransport();
      const progressList: OtaProgressPayload[] = [];
      const progressTopic = MqttTopicBuilder.otaProgress(productKey, deviceNo);
      await transport.subscribe(progressTopic, (_topic, payload) => {
        progressList.push(JSON.parse(payload.toString()));
      });

      const sim = new DeviceSimulator(
        { productKey, deviceNo, failOtaAtStep: OtaStep.FLASHING, otaDownloadIntervalMs: 5 },
        transport
      );
      await sim.start();

      await transport.publish(MqttTopicBuilder.otaUpgrade(productKey, deviceNo), {
        traceId: 'trace-flash-fail',
        planId: 'plan-flash',
        taskId: 'task-flash',
        version: 'v2.0.0',
        fileUrl: 'https://cdn.example.com/fw.bin',
        fileSizeBytes: 1024,
        checksumSha256: 'deadbeef',
      });

      await new Promise((r) => setTimeout(r, 70));

      // 3 DOWNLOADING chunks + 1 VERIFYING + 1 FAILED = 5
      assert.equal(progressList.length, 5);
      const last = progressList[progressList.length - 1];
      assert.equal(last.step, OtaStep.FAILED);
      assert.equal(last.errorCode, 4001);
      assert.equal(last.errorMessage, 'FLASH_WRITE_ERROR');
      assert.equal(sim.getTelemetry().lastOtaStep, OtaStep.FAILED);

      await sim.stop();
    }
  });

  await t.test('OTA upgrade triggers via legacy downlink alias topic', async () => {
    const transport = new InMemoryTransport();
    const progressList: OtaProgressPayload[] = [];

    const progressTopic = MqttTopicBuilder.otaProgress(productKey, deviceNo);
    await transport.subscribe(progressTopic, (_topic, payload) => {
      progressList.push(JSON.parse(payload.toString()));
    });

    const sim = new DeviceSimulator(
      { productKey, deviceNo, otaDownloadIntervalMs: 5 },
      transport
    );
    await sim.start();

    const legacyDownTopic = `car/down/${productKey}/${deviceNo}/ota/upgrade`;
    await transport.publish(legacyDownTopic, {
      traceId: 'trace-legacy',
      planId: 'plan-leg',
      taskId: 'task-leg',
      version: 'v1.5.0',
      fileUrl: 'https://cdn.example.com/fw.bin',
      fileSizeBytes: 1024,
      checksumSha256: 'beefcafe',
    });

    await new Promise((r) => setTimeout(r, 80));

    assert.equal(progressList.length, 6);
    assert.equal(progressList[progressList.length - 1].step, OtaStep.SUCCESS);
    assert.equal(sim.getTelemetry().firmwareVersion, 'v1.5.0');

    await sim.stop();
  });
});
