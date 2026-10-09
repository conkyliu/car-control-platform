import { Injectable, Optional } from '@nestjs/common';
import { LocationRepository } from '@car-control/database';

export interface SafetyCheckResult {
  safe: boolean;
  errorCode?: number;
  reason?: string;
}

export interface DeviceTelemetryProbe {
  engineRunning?: boolean;
  batteryVoltage?: number;
}

@Injectable()
export class OtaSafetyService {
  private deviceTelemetryMap: Map<string, DeviceTelemetryProbe> = new Map();

  constructor(
    @Optional() private readonly locationRepo?: LocationRepository
  ) {}

  /**
   * 模拟/设置设备实时遥测状态（行车运行状态与电瓶电压）
   */
  setDeviceTelemetry(deviceNo: string, telemetry: DeviceTelemetryProbe): void {
    const current = this.deviceTelemetryMap.get(deviceNo) || {};
    this.deviceTelemetryMap.set(deviceNo, {
      ...current,
      ...telemetry,
    });
  }

  /**
   * 获取设备当前遥测安全状态
   */
  getDeviceTelemetry(deviceNo: string): DeviceTelemetryProbe | undefined {
    return this.deviceTelemetryMap.get(deviceNo);
  }

  /**
   * 清除设备遥测缓存
   */
  clearDeviceTelemetry(deviceNo?: string): void {
    if (deviceNo) {
      this.deviceTelemetryMap.delete(deviceNo);
    } else {
      this.deviceTelemetryMap.clear();
    }
  }

  /**
   * 升级安全前置门禁检查 (ADR-013 & Gate 5 AC-3)
   * 1. 车辆熄火防线: 发动机运转/行车中 (engineRunning === true) 严禁下发或执行 OTA
   * 2. 电压防线: 小蓄电池电压低于 12.0V 严禁执行 OTA
   */
  async checkSafety(
    deviceNo: string,
    options?: DeviceTelemetryProbe
  ): Promise<SafetyCheckResult> {
    const probe = options ?? this.deviceTelemetryMap.get(deviceNo) ?? {};

    // 1. 行车中/点火校验
    if (probe.engineRunning === true) {
      return {
        safe: false,
        errorCode: 1002,
        reason: 'PRECHECK_FAILED_ENGINE_ON',
      };
    }

    // 2. 小蓄电池电瓶低压校验
    if (probe.batteryVoltage !== undefined && probe.batteryVoltage < 12.0) {
      return {
        safe: false,
        errorCode: 1001,
        reason: 'PRECHECK_FAILED_LOW_VOLTAGE',
      };
    }

    return { safe: true };
  }
}
