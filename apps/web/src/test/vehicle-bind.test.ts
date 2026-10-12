import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateBindingPair,
  UNBIND_REASONS,
  UNBIND_REASON_OPTIONS,
  validateUnbindReason,
  applyBindingChange,
  type UnbindReason,
} from '../views/vehicle/vehicle-bind-core.ts';
import {
  bindDeviceApi,
  unbindDeviceApi,
  fetchAvailableDevicesApi,
  getInMemoryVehicles,
  setInMemoryVehicles,
} from '../api/vehicle.ts';
import { getInMemoryDevices, setInMemoryDevices } from '../api/device.ts';
import { ApiError, http } from '../api/client.ts';
import type { VehicleDto } from '../views/vehicle/vehicle-core.ts';
import type { DeviceDto } from '../views/device/device-core.ts';

describe('Vehicle & Device Hardware Binding Management Center (TDD)', () => {
  const mockVehicle: VehicleDto = {
    id: 'veh-test-01',
    vin: 'LFPH2E023N1000999',
    plateNumber: '粤B·99999',
    tenantId: 'tenant-001',
    projectId: 'proj-sz-01',
    projectName: '深圳极速智慧车队',
    brandId: 'brand-byd',
    brandName: '比亚迪',
    modelId: 'model-byd-han',
    modelName: '汉 EV',
    deviceId: null,
    deviceNo: null,
    deviceOnlineStatus: undefined,
    status: 'NORMAL',
    telemetry: {
      batteryVoltage: 12.6,
      speed: 0,
      mileage: 1000,
    },
    ownerName: '测试车主',
    ownerPhone: '13800000000',
  };

  const mockDevice: DeviceDto = {
    id: 'dev-test-01',
    deviceNo: 'DEV_TEST_01',
    imei: '868123045678999',
    productKey: 'TBOX-G4-STD',
    productName: '4G 智慧车载终端 (标准版)',
    projectId: 'proj-sz-01',
    projectName: '深圳极速智慧车队',
    tenantId: 'tenant-001',
    boundVehiclePlate: null,
    boundVin: null,
    onlineStatus: 'ONLINE',
    signalRsrp: -75,
    firmwareVersion: 'v2.1.0',
    status: 'ACTIVE',
  };

  describe('1. Binding Pre-Validation Rules (validateBindingPair)', () => {
    it('passes validation when vehicle and device have matching tenant, valid status, and free state', () => {
      const result = validateBindingPair(mockVehicle, mockDevice);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.error, undefined);
      assert.strictEqual(result.warning, undefined);
    });

    it('intercepts cross-tenant pairing attempts with strict error', () => {
      const crossTenantDevice: DeviceDto = {
        ...mockDevice,
        tenantId: 'tenant-002',
      };
      const result = validateBindingPair(mockVehicle, crossTenantDevice);
      assert.strictEqual(result.valid, false);
      assert.match(result.error || '', /跨租户拦截/);
    });

    it('intercepts pairing when vehicle is in terminal SCRAPPED status', () => {
      const scrappedVehicle: VehicleDto = {
        ...mockVehicle,
        status: 'SCRAPPED',
      };
      const result = validateBindingPair(scrappedVehicle, mockDevice);
      assert.strictEqual(result.valid, false);
      assert.match(result.error || '', /报废车辆/);
    });

    it('intercepts pairing when target device is DECOMMISSIONED', () => {
      const decommissionedDevice: DeviceDto = {
        ...mockDevice,
        status: 'DECOMMISSIONED',
      };
      const result = validateBindingPair(mockVehicle, decommissionedDevice);
      assert.strictEqual(result.valid, false);
      assert.match(result.error || '', /报废设备/);
    });

    it('intercepts pairing when target device is already occupied by another vehicle', () => {
      const occupiedDevice: DeviceDto = {
        ...mockDevice,
        boundVehiclePlate: '粤A·12345',
        boundVin: 'LFPH2E023N1000888',
      };
      const result = validateBindingPair(mockVehicle, occupiedDevice);
      assert.strictEqual(result.valid, false);
      assert.match(result.error || '', /设备占用冲突/);
      assert.match(result.error || '', /粤A·12345/);
      assert.match(result.error || '', /LFPH2E023N1000888/);
    });

    it('generates friendly warning when vehicle project and device project do not match', () => {
      const crossProjectDevice: DeviceDto = {
        ...mockDevice,
        projectId: 'proj-gz-02',
        projectName: '广州网约出行运营二期',
      };
      const result = validateBindingPair(mockVehicle, crossProjectDevice);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.error, undefined);
      assert.ok(result.warning);
      assert.match(result.warning || '', /项目归属提示/);
      assert.match(result.warning || '', /深圳极速智慧车队/);
      assert.match(result.warning || '', /广州网约出行运营二期/);
    });
  });

  describe('2. Unbind Reasons Dictionary & Validation (UNBIND_REASONS)', () => {
    it('defines all 5 standard unbinding reasons with human-friendly descriptions', () => {
      const expectedReasons: UnbindReason[] = [
        'MAINTENANCE',
        'HARDWARE_UPGRADE',
        'VEHICLE_SCRAPPED',
        'OWNERSHIP_TRANSFER',
        'OTHER',
      ];

      for (const reason of expectedReasons) {
        assert.ok(UNBIND_REASONS[reason], `Missing unbind reason: ${reason}`);
        assert.ok(UNBIND_REASONS[reason].label.length > 0);
        assert.ok(UNBIND_REASONS[reason].description.length > 0);
      }
    });

    it('validates unbind reasons correctly via validateUnbindReason', () => {
      assert.strictEqual(validateUnbindReason('MAINTENANCE'), true);
      assert.strictEqual(validateUnbindReason('HARDWARE_UPGRADE'), true);
      assert.strictEqual(validateUnbindReason('VEHICLE_SCRAPPED'), true);
      assert.strictEqual(validateUnbindReason('OWNERSHIP_TRANSFER'), true);
      assert.strictEqual(validateUnbindReason('OTHER'), true);

      assert.strictEqual(validateUnbindReason('INVALID_REASON'), false);
      assert.strictEqual(validateUnbindReason(''), false);
      assert.strictEqual(validateUnbindReason(null), false);
      assert.strictEqual(validateUnbindReason(undefined), false);
    });

    it('provides UNBIND_REASON_OPTIONS formatted for Ant Design Select', () => {
      assert.strictEqual(UNBIND_REASON_OPTIONS.length, 5);
      const first = UNBIND_REASON_OPTIONS[0];
      assert.ok(first?.value);
      assert.ok(first?.label);
      assert.ok(first?.description);
    });
  });

  describe('3. Immutable State Pool Synchronization (applyBindingChange)', () => {
    it('binds an unbound vehicle to an available device atomically', () => {
      const vehicles = [{ ...mockVehicle }];
      const devices = [{ ...mockDevice }];

      const result = applyBindingChange(vehicles, devices, mockVehicle.id, mockDevice.id);

      assert.notStrictEqual(result.vehicles, vehicles);
      assert.notStrictEqual(result.devices, devices);

      const updatedVehicle = result.vehicles.find((v) => v.id === mockVehicle.id);
      const updatedDevice = result.devices.find((d) => d.id === mockDevice.id);

      assert.ok(updatedVehicle);
      assert.strictEqual(updatedVehicle?.deviceId, mockDevice.id);
      assert.strictEqual(updatedVehicle?.deviceNo, mockDevice.deviceNo);
      assert.strictEqual(updatedVehicle?.deviceOnlineStatus, mockDevice.onlineStatus);

      assert.ok(updatedDevice);
      assert.strictEqual(updatedDevice?.boundVehiclePlate, mockVehicle.plateNumber);
      assert.strictEqual(updatedDevice?.boundVin, mockVehicle.vin);
      assert.strictEqual(updatedDevice?.boundVehicle?.plate, mockVehicle.plateNumber);
      assert.strictEqual(updatedDevice?.boundVehicle?.vin, mockVehicle.vin);
    });

    it('unbinds a bound vehicle and releases the device back to available pool', () => {
      const boundVehicle: VehicleDto = {
        ...mockVehicle,
        deviceId: mockDevice.id,
        deviceNo: mockDevice.deviceNo,
        deviceOnlineStatus: 'ONLINE',
      };
      const boundDevice: DeviceDto = {
        ...mockDevice,
        boundVehiclePlate: mockVehicle.plateNumber,
        boundVin: mockVehicle.vin,
      };

      const vehicles = [boundVehicle];
      const devices = [boundDevice];

      const result = applyBindingChange(vehicles, devices, boundVehicle.id, null, 'MAINTENANCE');

      const updatedVehicle = result.vehicles.find((v) => v.id === boundVehicle.id);
      const updatedDevice = result.devices.find((d) => d.id === boundDevice.id);

      assert.ok(updatedVehicle);
      assert.strictEqual(updatedVehicle?.deviceId, null);
      assert.strictEqual(updatedVehicle?.deviceNo, null);
      assert.strictEqual(updatedVehicle?.deviceOnlineStatus, undefined);

      assert.ok(updatedDevice);
      assert.strictEqual(updatedDevice?.boundVehiclePlate, null);
      assert.strictEqual(updatedDevice?.boundVin, null);
      assert.strictEqual(updatedDevice?.boundVehicle, null);
    });

    it('rebinds vehicle to a new device by atomically releasing old device and binding new device', () => {
      const oldDevice: DeviceDto = {
        ...mockDevice,
        id: 'dev-old-01',
        deviceNo: 'DEV_OLD_01',
        boundVehiclePlate: mockVehicle.plateNumber,
        boundVin: mockVehicle.vin,
      };
      const newDevice: DeviceDto = {
        ...mockDevice,
        id: 'dev-new-02',
        deviceNo: 'DEV_NEW_02',
        boundVehiclePlate: null,
        boundVin: null,
      };
      const boundVehicle: VehicleDto = {
        ...mockVehicle,
        deviceId: oldDevice.id,
        deviceNo: oldDevice.deviceNo,
      };

      const vehicles = [boundVehicle];
      const devices = [oldDevice, newDevice];

      const result = applyBindingChange(vehicles, devices, boundVehicle.id, newDevice.id);

      const updatedVehicle = result.vehicles.find((v) => v.id === boundVehicle.id);
      const updatedOldDev = result.devices.find((d) => d.id === oldDevice.id);
      const updatedNewDev = result.devices.find((d) => d.id === newDevice.id);

      assert.strictEqual(updatedVehicle?.deviceId, newDevice.id);
      assert.strictEqual(updatedVehicle?.deviceNo, newDevice.deviceNo);

      assert.strictEqual(updatedOldDev?.boundVehiclePlate, null);
      assert.strictEqual(updatedOldDev?.boundVin, null);

      assert.strictEqual(updatedNewDev?.boundVehiclePlate, mockVehicle.plateNumber);
      assert.strictEqual(updatedNewDev?.boundVin, mockVehicle.vin);
    });

    it('throws error when vehicleId does not exist in pool', () => {
      assert.throws(
        () => applyBindingChange([], [], 'non-existent-veh', mockDevice.id),
        /车辆 ID "non-existent-veh" 未找到/
      );
    });

    it('throws error when newDeviceId does not exist in pool', () => {
      assert.throws(
        () => applyBindingChange([mockVehicle], [], mockVehicle.id, 'non-existent-dev'),
        /设备 ID "non-existent-dev" 未找到/
      );
    });
  });

  describe('4. API Client Methods & Offline Fallback (bindDeviceApi, unbindDeviceApi, fetchAvailableDevicesApi)', () => {
    beforeEach(() => {
      setInMemoryVehicles([{ ...mockVehicle }]);
      setInMemoryDevices([{ ...mockDevice }]);
    });

    it('fetchAvailableDevicesApi retrieves unbound active devices and filters by projectId', async () => {
      const dev1: DeviceDto = { ...mockDevice, id: 'dev-free-01', projectId: 'proj-sz-01' };
      const dev2: DeviceDto = { ...mockDevice, id: 'dev-free-02', projectId: 'proj-gz-02' };
      const devOccupied: DeviceDto = {
        ...mockDevice,
        id: 'dev-occ-03',
        projectId: 'proj-sz-01',
        boundVehiclePlate: '粤B·11111',
      };
      setInMemoryDevices([dev1, dev2, devOccupied]);

      const allAvailable = await fetchAvailableDevicesApi();
      assert.strictEqual(allAvailable.length, 2);
      assert.ok(allAvailable.some((d) => d.id === 'dev-free-01'));
      assert.ok(allAvailable.some((d) => d.id === 'dev-free-02'));
      assert.ok(!allAvailable.some((d) => d.id === 'dev-occ-03'));

      const szAvailable = await fetchAvailableDevicesApi('proj-sz-01');
      assert.strictEqual(szAvailable.length, 1);
      assert.strictEqual(szAvailable[0]?.id, 'dev-free-01');
    });

    it('bindDeviceApi updates in-memory vehicle and device atomically in offline fallback', async () => {
      const res = await bindDeviceApi(mockVehicle.id, mockDevice.id, '产线PDI加装');
      assert.strictEqual(res.success, true);
      assert.match(res.message, /绑定成功/);

      const vehicles = getInMemoryVehicles();
      const devices = getInMemoryDevices();

      const v = vehicles.find((item) => item.id === mockVehicle.id);
      const d = devices.find((item) => item.id === mockDevice.id);

      assert.strictEqual(v?.deviceId, mockDevice.id);
      assert.strictEqual(v?.deviceNo, mockDevice.deviceNo);
      assert.strictEqual(d?.boundVehiclePlate, mockVehicle.plateNumber);
      assert.strictEqual(d?.boundVin, mockVehicle.vin);
    });

    it('unbindDeviceApi clears pairing and releases device in offline fallback', async () => {
      // First bind
      await bindDeviceApi(mockVehicle.id, mockDevice.id);

      // Then unbind
      const res = await unbindDeviceApi(mockVehicle.id, 'MAINTENANCE');
      assert.strictEqual(res.success, true);
      assert.match(res.message, /解绑成功/);

      const vehicles = getInMemoryVehicles();
      const devices = getInMemoryDevices();

      const v = vehicles.find((item) => item.id === mockVehicle.id);
      const d = devices.find((item) => item.id === mockDevice.id);

      assert.strictEqual(v?.deviceId, null);
      assert.strictEqual(v?.deviceNo, null);
      assert.strictEqual(d?.boundVehiclePlate, null);
      assert.strictEqual(d?.boundVin, null);
    });

    it('does not swallow ApiError thrown by server request', async () => {
      const origPost = http.post;
      http.post = async () => {
        throw new ApiError('设备硬件校验失败：该设备处于物理黑名单', 422);
      };

      try {
        await assert.rejects(
          async () => {
            await bindDeviceApi(mockVehicle.id, mockDevice.id);
          },
          (err: any) => {
            assert.strictEqual(err.statusCode, 422);
            assert.match(err.message, /物理黑名单/);
            return true;
          }
        );
      } finally {
        http.post = origPost;
      }
    });
  });
});
