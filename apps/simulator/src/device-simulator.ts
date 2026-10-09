import {
  MqttTopicBuilder,
  DeviceCommandDownlinkPayload,
  DeviceCommandAckUplinkPayload,
  CommandCode,
  TelemetryLocationPayload,
  AlarmType,
  AlarmLevel,
  UplinkAlarmPayload,
  OtaStep,
  OtaUpgradeDownlinkPayload,
  OtaProgressPayload,
} from '@car-control/contracts';
import { DeviceSimulatorOptions, SimulatorTelemetry } from './types.js';
import { SimulatorTransport, InMemoryTransport } from './transport.js';

export class DeviceSimulator {
  private transport: SimulatorTransport;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private telemetry: SimulatorTelemetry;

  constructor(
    public readonly options: DeviceSimulatorOptions,
    transport?: SimulatorTransport
  ) {
    this.transport = transport || new InMemoryTransport();
    this.telemetry = {
      online: false,
      commandsReceived: 0,
      acksSent: 0,
      acksDropped: 0,
      batteryVoltage: this.options.simulatedBatteryVoltage ?? 12.6,
      firmwareVersion: this.options.currentFirmwareVersion ?? 'v1.0.0-sim',
      otaTasksReceived: 0,
      otaProgressSent: 0,
    };
  }

  /**
   * 启动模拟器：设备上线并开始监听控制指令
   */
  async start(): Promise<void> {
    this.telemetry.online = true;

    // 1. 上报设备上线状态
    const statusTopic = MqttTopicBuilder.status(this.options.productKey, this.options.deviceNo);
    await this.transport.publish(statusTopic, {
      productKey: this.options.productKey,
      deviceNo: this.options.deviceNo,
      online: true,
      batteryVoltage: this.telemetry.batteryVoltage,
      firmwareVersion: this.telemetry.firmwareVersion,
      timestamp: Date.now(),
    });

    // 2. 启动周期心跳
    const interval = this.options.heartbeatIntervalMs ?? 30000;
    this.sendHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, interval);

    // 3. 订阅下行控制指令 Topic: /sys/{productKey}/{deviceNo}/cmd/down
    const cmdDownTopic = MqttTopicBuilder.commandDown(this.options.productKey, this.options.deviceNo);
    await this.transport.subscribe(cmdDownTopic, async (_topic, rawPayload) => {
      try {
        const payloadStr = typeof rawPayload === 'string' ? rawPayload : rawPayload.toString('utf-8');
        const downlink: DeviceCommandDownlinkPayload = JSON.parse(payloadStr);
        await this.handleDownlinkCommand(downlink);
      } catch (err) {
        console.error(`[Simulator:${this.options.deviceNo}] Failed to parse command:`, err);
      }
    });

    // 4. 订阅下行固件升级指令 Topic: /sys/{productKey}/{deviceNo}/ota/upgrade 及兼容别名
    const handleOta = async (_topic: string, rawPayload: any) => {
      try {
        const payloadStr = typeof rawPayload === 'string' ? rawPayload : rawPayload.toString('utf-8');
        const downlink: OtaUpgradeDownlinkPayload = JSON.parse(payloadStr);
        await this.handleDownlinkOtaUpgrade(downlink);
      } catch (err) {
        console.error(`[Simulator:${this.options.deviceNo}] Failed to parse OTA upgrade command:`, err);
      }
    };

    const otaDownTopic = MqttTopicBuilder.otaUpgrade(this.options.productKey, this.options.deviceNo);
    const legacyOtaDownTopic = `car/down/${this.options.productKey}/${this.options.deviceNo}/ota/upgrade`;
    await this.transport.subscribe(otaDownTopic, handleOta);
    if (legacyOtaDownTopic !== otaDownTopic) {
      await this.transport.subscribe(legacyOtaDownTopic, handleOta);
    }
  }

  /**
   * 停止模拟器：上报下线状态并清理定时器
   */
  async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.telemetry.online = false;

    const statusTopic = MqttTopicBuilder.status(this.options.productKey, this.options.deviceNo);
    await this.transport.publish(statusTopic, {
      productKey: this.options.productKey,
      deviceNo: this.options.deviceNo,
      online: false,
      timestamp: Date.now(),
    });

    await this.transport.disconnect();
  }

  /**
   * 发送心跳包
   */
  async sendHeartbeat(): Promise<void> {
    if (!this.telemetry.online) return;
    this.telemetry.lastHeartbeat = Date.now();
    const heartbeatTopic = MqttTopicBuilder.heartbeat(this.options.productKey, this.options.deviceNo);
    await this.transport.publish(heartbeatTopic, {
      productKey: this.options.productKey,
      deviceNo: this.options.deviceNo,
      timestamp: this.telemetry.lastHeartbeat,
      batteryVoltage: this.telemetry.batteryVoltage,
      rssi: -65,
    });
  }

  /**
   * 上报遥测定位数据
   * 构造完整 TelemetryLocationPayload 并发布到 MQTT 定位 Topic
   */
  async reportLocation(payload: Partial<TelemetryLocationPayload> = {}): Promise<TelemetryLocationPayload> {
    const fullPayload: TelemetryLocationPayload = {
      lat: 22.54286,
      lng: 114.05956,
      speed: 60,
      heading: 90,
      gpsValid: true,
      timestamp: Date.now(),
      ...payload,
    };

    const standardTopic = MqttTopicBuilder.location(this.options.productKey, this.options.deviceNo);
    const legacyTopic = `car/up/${this.options.productKey}/${this.options.deviceNo}/telemetry/location`;

    await this.transport.publish(standardTopic, fullPayload);
    if (legacyTopic !== standardTopic) {
      await this.transport.publish(legacyTopic, fullPayload);
    }

    return fullPayload;
  }

  /**
   * 上报车辆异常报警
   * 构造完整 UplinkAlarmPayload 并发布到 MQTT 告警 Topic
   */
  async reportAlarm(
    alarmType: AlarmType,
    alarmLevel: AlarmLevel,
    message?: string,
    coords?: { lat: number; lng: number }
  ): Promise<UplinkAlarmPayload> {
    const uplinkAlarm: UplinkAlarmPayload = {
      alarmType,
      alarmLevel,
      timestamp: Date.now(),
      ...(message !== undefined ? { message } : {}),
      ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
    };

    const standardTopic = MqttTopicBuilder.alarm(this.options.productKey, this.options.deviceNo);
    const legacyTopic = `car/up/${this.options.productKey}/${this.options.deviceNo}/alarm/report`;

    await this.transport.publish(standardTopic, uplinkAlarm);
    if (legacyTopic !== standardTopic) {
      await this.transport.publish(legacyTopic, uplinkAlarm);
    }

    return uplinkAlarm;
  }

  /**
   * 处理云端下发的控车指令并根据仿真配置返回 ACK
   */
  private async handleDownlinkCommand(downlink: DeviceCommandDownlinkPayload): Promise<void> {
    this.telemetry.commandsReceived += 1;

    // 1. 模拟网络丢包 (dropAck)
    if (this.options.dropAck) {
      this.telemetry.acksDropped += 1;
      return;
    }

    const latency = this.options.lateAckMs ?? this.options.defaultLatencyMs ?? 200;

    // 模拟执行时延
    await new Promise((resolve) => setTimeout(resolve, latency));

    // 2. 模拟业务拒绝 (rejectCommands)
    const isRejected = this.options.rejectCommands?.includes(downlink.commandCode);
    const ackTopic = MqttTopicBuilder.commandAck(this.options.productKey, this.options.deviceNo);

    const ackPayload: DeviceCommandAckUplinkPayload = {
      traceId: downlink.traceId,
      requestId: downlink.requestId,
      commandId: downlink.commandId,
      commandCode: downlink.commandCode,
      timestamp: Date.now(),
      code: isRejected ? 1001 : 0,
      message: isRejected ? 'DEVICE_REJECTED: Vehicle speed > 0 or ignition on' : 'SUCCESS',
      data: {
        executionTimeMs: latency,
        status: isRejected ? 'REJECTED' : 'EXECUTED',
      },
    };

    // 3. 发布 ACK
    await this.transport.publish(ackTopic, ackPayload);
    this.telemetry.acksSent += 1;

    // 4. 模拟重复 ACK (duplicateAck)
    if (this.options.duplicateAck) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      await this.transport.publish(ackTopic, ackPayload);
      this.telemetry.acksSent += 1;
    }
  }

  /**
   * 上报 OTA 固件升级进度并更新遥测指标
   */
  private async publishOtaProgress(payload: OtaProgressPayload): Promise<void> {
    const standardTopic = MqttTopicBuilder.otaProgress(this.options.productKey, this.options.deviceNo);
    const legacyTopic = `car/up/${this.options.productKey}/${this.options.deviceNo}/ota/progress`;

    await this.transport.publish(standardTopic, payload);
    if (legacyTopic !== standardTopic) {
      await this.transport.publish(legacyTopic, payload);
    }

    this.telemetry.otaProgressSent += 1;
    this.telemetry.lastOtaStep = payload.step;
  }

  /**
   * 处理云端下发的 OTA 固件升级指令并仿真执行全生命周期
   */
  async handleDownlinkOtaUpgrade(downlink: OtaUpgradeDownlinkPayload): Promise<void> {
    this.telemetry.otaTasksReceived += 1;

    // 1. 安全前置检查 (Safety Pre-checks)
    if (this.options.simulatedEngineRunning === true) {
      await this.publishOtaProgress({
        planId: downlink.planId,
        taskId: downlink.taskId,
        deviceNo: this.options.deviceNo,
        step: OtaStep.FAILED,
        progressPercent: 0,
        errorCode: 1002,
        errorMessage: 'PRECHECK_FAILED_ENGINE_ON',
      });
      return;
    }

    const currentVoltage = this.options.simulatedBatteryVoltage ?? this.telemetry.batteryVoltage;
    if (currentVoltage < 12.0) {
      await this.publishOtaProgress({
        planId: downlink.planId,
        taskId: downlink.taskId,
        deviceNo: this.options.deviceNo,
        step: OtaStep.FAILED,
        progressPercent: 0,
        errorCode: 1001,
        errorMessage: 'PRECHECK_FAILED_LOW_VOLTAGE',
      });
      return;
    }

    const interval = this.options.otaDownloadIntervalMs ?? 10;
    const delay = (ms: number) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

    // 2. Step 1: DOWNLOADING (分片进度模拟 25% -> 50% -> 100%)
    if (this.options.failOtaAtStep === OtaStep.DOWNLOADING) {
      await this.publishOtaProgress({
        planId: downlink.planId,
        taskId: downlink.taskId,
        deviceNo: this.options.deviceNo,
        step: OtaStep.FAILED,
        progressPercent: 0,
        errorCode: 2001,
        errorMessage: 'DOWNLOAD_FAILED',
      });
      return;
    }

    const downloadChunks = [
      { currentChunk: 1, totalChunks: 4, percent: 25 },
      { currentChunk: 2, totalChunks: 4, percent: 50 },
      { currentChunk: 4, totalChunks: 4, percent: 100 },
    ];

    for (const chunk of downloadChunks) {
      await delay(interval);
      await this.publishOtaProgress({
        planId: downlink.planId,
        taskId: downlink.taskId,
        deviceNo: this.options.deviceNo,
        step: OtaStep.DOWNLOADING,
        progressPercent: chunk.percent,
        currentChunk: chunk.currentChunk,
        totalChunks: chunk.totalChunks,
      });
    }

    // 3. Step 2: VERIFYING (完整性校验)
    await delay(interval);
    if (this.options.failOtaAtStep === OtaStep.VERIFYING) {
      await this.publishOtaProgress({
        planId: downlink.planId,
        taskId: downlink.taskId,
        deviceNo: this.options.deviceNo,
        step: OtaStep.FAILED,
        progressPercent: 0,
        errorCode: 3001,
        errorMessage: 'CHECKSUM_MISMATCH',
      });
      return;
    }

    await this.publishOtaProgress({
      planId: downlink.planId,
      taskId: downlink.taskId,
      deviceNo: this.options.deviceNo,
      step: OtaStep.VERIFYING,
      progressPercent: 100,
    });

    // 4. Step 3: FLASHING (固件刷写)
    await delay(interval);
    if (this.options.failOtaAtStep === OtaStep.FLASHING) {
      await this.publishOtaProgress({
        planId: downlink.planId,
        taskId: downlink.taskId,
        deviceNo: this.options.deviceNo,
        step: OtaStep.FAILED,
        progressPercent: 0,
        errorCode: 4001,
        errorMessage: 'FLASH_WRITE_ERROR',
      });
      return;
    }

    await this.publishOtaProgress({
      planId: downlink.planId,
      taskId: downlink.taskId,
      deviceNo: this.options.deviceNo,
      step: OtaStep.FLASHING,
      progressPercent: 100,
    });

    // 5. Step 4: SUCCESS (升级完成并更新本地固件版本)
    await delay(interval);
    await this.publishOtaProgress({
      planId: downlink.planId,
      taskId: downlink.taskId,
      deviceNo: this.options.deviceNo,
      step: OtaStep.SUCCESS,
      progressPercent: 100,
    });

    this.telemetry.firmwareVersion = downlink.version;
  }

  getTelemetry(): Readonly<SimulatorTelemetry> {
    return { ...this.telemetry };
  }
}
