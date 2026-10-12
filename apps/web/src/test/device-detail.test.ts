import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateVoltage,
  validateTemperature,
  validateHeartbeatInterval,
  validateSecurityCode,
  getVoltageStatusMeta,
  getTemperatureStatusMeta,
  type DeviceConfigInput,
} from '../views/device/device-core.ts';
import {
  fetchDeviceDetailApi,
  updateDeviceConfigApi,
  rebootDeviceApi,
} from '../api/device.ts';

describe('Device Telemetry Diagnostics and Remote Configuration Test Suite (TDD)', () => {
  describe('1. Main Battery Voltage Health Evaluation (validateVoltage)', () => {
    it('evaluates normal operating voltages (11.5V ~ 15.0V) as NORMAL', () => {
      assert.strictEqual(validateVoltage(11.5), 'NORMAL');
      assert.strictEqual(validateVoltage(11.8), 'NORMAL');
      assert.strictEqual(validateVoltage(12.6), 'NORMAL');
      assert.strictEqual(validateVoltage(13.8), 'NORMAL');
      assert.strictEqual(validateVoltage(14.4), 'NORMAL');
      assert.strictEqual(validateVoltage(15.0), 'NORMAL');

      const meta = getVoltageStatusMeta(13.8);
      assert.strictEqual(meta.status, 'NORMAL');
      assert.strictEqual(meta.isAlert, false);
      assert.strictEqual(meta.color, '#52c41a');
    });

    it('evaluates low voltages (< 11.5V) as LOW and marks warning alert', () => {
      assert.strictEqual(validateVoltage(11.4), 'LOW');
      assert.strictEqual(validateVoltage(10.8), 'LOW');
      assert.strictEqual(validateVoltage(9.0), 'LOW');
      assert.strictEqual(validateVoltage(0), 'LOW');

      const meta = getVoltageStatusMeta(10.8);
      assert.strictEqual(meta.status, 'LOW');
      assert.strictEqual(meta.isAlert, true);
      assert.strictEqual(meta.alertType, 'warning');
      assert.strictEqual(meta.color, '#faad14');
    });

    it('evaluates excessive voltages (> 15.0V) as OVERVOLTAGE and marks error alert', () => {
      assert.strictEqual(validateVoltage(15.1), 'OVERVOLTAGE');
      assert.strictEqual(validateVoltage(16.5), 'OVERVOLTAGE');
      assert.strictEqual(validateVoltage(24.0), 'OVERVOLTAGE');

      const meta = getVoltageStatusMeta(15.5);
      assert.strictEqual(meta.status, 'OVERVOLTAGE');
      assert.strictEqual(meta.isAlert, true);
      assert.strictEqual(meta.alertType, 'error');
      assert.strictEqual(meta.color, '#ff4d4f');
    });

    it('handles undefined, null, and NaN safely as UNKNOWN', () => {
      assert.strictEqual(validateVoltage(undefined), 'UNKNOWN');
      assert.strictEqual(validateVoltage(null as any), 'UNKNOWN');
      assert.strictEqual(validateVoltage(Number.NaN), 'UNKNOWN');

      const meta = getVoltageStatusMeta(undefined);
      assert.strictEqual(meta.status, 'UNKNOWN');
      assert.strictEqual(meta.isAlert, false);
    });
  });

  describe('2. Chip Operating Temperature Evaluation (validateTemperature)', () => {
    it('evaluates safe temperatures (< 60°C) as NORMAL', () => {
      assert.strictEqual(validateTemperature(25), 'NORMAL');
      assert.strictEqual(validateTemperature(32), 'NORMAL');
      assert.strictEqual(validateTemperature(59.9), 'NORMAL');

      const meta = getTemperatureStatusMeta(35);
      assert.strictEqual(meta.status, 'NORMAL');
      assert.strictEqual(meta.isAlert, false);
      assert.strictEqual(meta.color, '#52c41a');
    });

    it('evaluates elevated temperatures (60°C ~ 75°C) as WARNING', () => {
      assert.strictEqual(validateTemperature(60), 'WARNING');
      assert.strictEqual(validateTemperature(68), 'WARNING');
      assert.strictEqual(validateTemperature(75), 'WARNING');

      const meta = getTemperatureStatusMeta(65);
      assert.strictEqual(meta.status, 'WARNING');
      assert.strictEqual(meta.isAlert, true);
      assert.strictEqual(meta.alertType, 'warning');
      assert.strictEqual(meta.color, '#fa8c16');
    });

    it('evaluates overheating (> 75°C) as OVERHEAT with critical alert', () => {
      assert.strictEqual(validateTemperature(75.1), 'OVERHEAT');
      assert.strictEqual(validateTemperature(82), 'OVERHEAT');
      assert.strictEqual(validateTemperature(105), 'OVERHEAT');

      const meta = getTemperatureStatusMeta(80);
      assert.strictEqual(meta.status, 'OVERHEAT');
      assert.strictEqual(meta.isAlert, true);
      assert.strictEqual(meta.alertType, 'error');
      assert.strictEqual(meta.color, '#ff4d4f');
    });

    it('handles undefined, null, and NaN as UNKNOWN', () => {
      assert.strictEqual(validateTemperature(undefined), 'UNKNOWN');
      assert.strictEqual(validateTemperature(null as any), 'UNKNOWN');
      assert.strictEqual(validateTemperature(Number.NaN), 'UNKNOWN');

      const meta = getTemperatureStatusMeta(undefined);
      assert.strictEqual(meta.status, 'UNKNOWN');
      assert.strictEqual(meta.isAlert, false);
    });
  });

  describe('3. Heartbeat Interval Parameter Validation (validateHeartbeatInterval)', () => {
    it('accepts valid intervals within [10, 3600] seconds range', () => {
      assert.strictEqual(validateHeartbeatInterval(10), true);
      assert.strictEqual(validateHeartbeatInterval(30), true);
      assert.strictEqual(validateHeartbeatInterval(60), true);
      assert.strictEqual(validateHeartbeatInterval(3600), true);
    });

    it('rejects values below 10 seconds or above 3600 seconds', () => {
      assert.strictEqual(validateHeartbeatInterval(9), false);
      assert.strictEqual(validateHeartbeatInterval(0), false);
      assert.strictEqual(validateHeartbeatInterval(-30), false);
      assert.strictEqual(validateHeartbeatInterval(3601), false);
      assert.strictEqual(validateHeartbeatInterval(10000), false);
    });

    it('rejects non-numeric, NaN, undefined, and null inputs', () => {
      assert.strictEqual(validateHeartbeatInterval(undefined), false);
      assert.strictEqual(validateHeartbeatInterval(null as any), false);
      assert.strictEqual(validateHeartbeatInterval(Number.NaN), false);
      assert.strictEqual(validateHeartbeatInterval('30' as any), false);
    });
  });

  describe('4. L2 Reboot Security Confirmation Code Validation (validateSecurityCode)', () => {
    it('accepts strictly matched "REBOOT"', () => {
      assert.strictEqual(validateSecurityCode('REBOOT'), true);
    });

    it('rejects case mismatches, extra spaces, and arbitrary strings', () => {
      assert.strictEqual(validateSecurityCode('reboot'), false);
      assert.strictEqual(validateSecurityCode('Reboot'), false);
      assert.strictEqual(validateSecurityCode('REBOOT '), false);
      assert.strictEqual(validateSecurityCode(' REBOOT'), false);
      assert.strictEqual(validateSecurityCode('CONFIRM'), false);
      assert.strictEqual(validateSecurityCode(''), false);
      assert.strictEqual(validateSecurityCode(undefined), false);
      assert.strictEqual(validateSecurityCode(null as any), false);
    });
  });

  describe('5. Device Detail and Remote Configuration API Client Integration', () => {
    it('fetchDeviceDetailApi retrieves comprehensive device telemetry and profile', async () => {
      const detail = await fetchDeviceDetailApi('dev-10001');
      assert.ok(detail);
      assert.strictEqual(detail.id, 'dev-10001');
      assert.strictEqual(detail.deviceNo, 'DEV_10001');
      assert.strictEqual(detail.mainVoltage, 13.8);
      assert.strictEqual(detail.backupBatteryPercent, 95);
      assert.strictEqual(detail.temperature, 32);
      assert.strictEqual(detail.onlineStatus, 'ONLINE');

      // 验证车载绑定卡片数据
      assert.ok(detail.boundVehicle);
      assert.strictEqual(detail.boundVehicle?.plate, '粤B·88888');
      assert.strictEqual(detail.boundVehicle?.vin, 'LFPH2E023N10001');
      assert.ok(detail.boundVehicle?.model);
      assert.ok(detail.boundVehicle?.ownerName);

      // 验证工况指标数据
      assert.ok(typeof detail.csq === 'number');
      assert.ok(detail.gpsCoordinates);
      assert.strictEqual(detail.gpsStatus, 'GPS已锁定');
      assert.strictEqual(detail.satelliteCount, 14);

      // 验证默认参数配置
      assert.ok(detail.config);
      assert.strictEqual(detail.config?.heartbeatInterval, 30);
      assert.strictEqual(detail.config?.apn, 'CMNET');
    });

    it('fetchDeviceDetailApi throws Error for non-existent device ID', async () => {
      await assert.rejects(
        async () => {
          await fetchDeviceDetailApi('dev-non-existent-99999');
        },
        /Device not found/
      );
    });

    it('updateDeviceConfigApi validates parameters and mutates device configuration in state pool', async () => {
      const targetId = 'dev-10002';
      const newConfig: DeviceConfigInput = {
        heartbeatInterval: 45,
        apn: 'UNINET',
        locationReportEnabled: true,
        locationReportInterval: 15,
        blePkeEnabled: true,
        blePkeSensitivity: 4,
      };

      const updated = await updateDeviceConfigApi(targetId, newConfig);
      assert.ok(updated);
      assert.strictEqual(updated.id, targetId);
      assert.strictEqual(updated.config?.heartbeatInterval, 45);
      assert.strictEqual(updated.config?.apn, 'UNINET');
      assert.strictEqual(updated.config?.blePkeSensitivity, 4);

      // 再次读取确认本地内存池已持久化更新
      const reFetched = await fetchDeviceDetailApi(targetId);
      assert.strictEqual(reFetched.config?.heartbeatInterval, 45);
      assert.strictEqual(reFetched.config?.apn, 'UNINET');
      assert.strictEqual(reFetched.config?.blePkeSensitivity, 4);
    });

    it('updateDeviceConfigApi rejects invalid heartbeatInterval out of [10, 3600] range', async () => {
      const invalidConfig: DeviceConfigInput = {
        heartbeatInterval: 5, // invalid < 10
        apn: 'CMNET',
      };

      await assert.rejects(
        async () => {
          await updateDeviceConfigApi('dev-10001', invalidConfig);
        },
        /心跳上报周期超出范围/
      );
    });

    it('rebootDeviceApi executes remote reboot with strictly matched "REBOOT" security code', async () => {
      const result = await rebootDeviceApi('dev-10001', 'REBOOT');
      assert.strictEqual(result.success, true);
      assert.match(result.message, /远程重启指令已下发/);
    });

    it('rebootDeviceApi rejects invalid security codes and protects device against accidental reboot', async () => {
      await assert.rejects(
        async () => {
          await rebootDeviceApi('dev-10001', 'WRONG_CODE');
        },
        /安全确认码错误/
      );

      await assert.rejects(
        async () => {
          await rebootDeviceApi('dev-10001', 'reboot');
        },
        /安全确认码错误/
      );
    });
  });
});
