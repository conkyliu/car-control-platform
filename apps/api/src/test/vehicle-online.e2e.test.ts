import test from 'node:test';
import assert from 'node:assert/strict';
import { DeviceOnlineStatus } from '@car-control/domain-types';
import { DeviceRepository, VehicleRepository, TenantContext } from '@car-control/database';
import { TenantService } from '../tenant/tenant.service.js';
import { ProjectService } from '../project/project.service.js';
import { DeviceStatusService } from '../device/device-status.service.js';
import { AuditService } from '../audit/audit.service.js';
import { DeviceService } from '../device/device.service.js';
import { VehicleService } from '../vehicle/vehicle.service.js';

test('Gate 2: Vehicle Online (Device & Vehicle Management) Acceptance Suite', async (t) => {
  const tenantService = new TenantService();
  const projectService = new ProjectService();
  const deviceStatusService = new DeviceStatusService();
  const auditService = new AuditService();

  const deviceRepo = new DeviceRepository();
  const vehicleRepo = new VehicleRepository();

  const deviceService = new DeviceService(
    deviceRepo,
    vehicleRepo,
    tenantService,
    projectService,
    deviceStatusService,
    auditService
  );

  const vehicleService = new VehicleService(
    vehicleRepo,
    deviceRepo,
    projectService,
    deviceStatusService,
    auditService
  );

  const tenantSessionA = { tenantId: 'TENANT_DEFAULT', userId: 'user_admin_01' };
  const tenantSessionB = { tenantId: 'TENANT_B', userId: 'user_guest_01' };

  await t.test('1. Device creation and duplicate uniqueness constraints', async () => {
    await TenantContext.run(tenantSessionA, async () => {
      const dev = await deviceService.createDevice({
        deviceNo: 'TBOX_TEST_1001',
        imei: '868123456789001',
        productKey: 'CAR_DEMO_PK',
        projectId: 'proj_default_01',
      });

      assert.ok(dev.id);
      assert.equal(dev.deviceNo, 'TBOX_TEST_1001');
      assert.equal(dev.status, 'ACTIVE');

      // 尝试重复创建相同 deviceNo
      await assert.rejects(
        async () => {
          await deviceService.createDevice({
            deviceNo: 'TBOX_TEST_1001',
            imei: '868123456789002',
            productKey: 'CAR_DEMO_PK',
          });
        },
        {
          name: 'ConflictException',
          message: /already exists/,
        }
      );

      // 尝试重复创建相同 imei
      await assert.rejects(
        async () => {
          await deviceService.createDevice({
            deviceNo: 'TBOX_TEST_1002',
            imei: '868123456789001',
            productKey: 'CAR_DEMO_PK',
          });
        },
        {
          name: 'ConflictException',
          message: /already exists/,
        }
      );
    });
  });

  await t.test('2. Batch import devices with intra-batch duplicate check', async () => {
    await TenantContext.run(tenantSessionA, async () => {
      // 批次内部包含重复编号拦截
      await assert.rejects(
        async () => {
          await deviceService.batchImportDevices({
            devices: [
              { deviceNo: 'TBOX_BATCH_01', imei: '868000000000001', productKey: 'PK_1' },
              { deviceNo: 'TBOX_BATCH_01', imei: '868000000000002', productKey: 'PK_1' },
            ],
          });
        },
        {
          name: 'BadRequestException',
          message: /Duplicate deviceNo in batch/,
        }
      );

      // 正常批量导入
      const res = await deviceService.batchImportDevices({
        devices: [
          { deviceNo: 'TBOX_BATCH_01', imei: '868000000000001', productKey: 'PK_1' },
          { deviceNo: 'TBOX_BATCH_02', imei: '868000000000002', productKey: 'PK_1' },
        ],
      });

      assert.equal(res.total, 2);
      assert.equal(res.successCount, 2);
    });
  });

  await t.test('3. Vehicle creation and VIN uniqueness constraint', async () => {
    await TenantContext.run(tenantSessionA, async () => {
      const vehicle = await vehicleService.createVehicle({
        vin: 'LFV3A123456789001',
        plateNumber: '粤B12345',
        brandId: 'brand_tesla',
        modelId: 'model_y',
        projectId: 'proj_default_01',
      });

      assert.ok(vehicle.id);
      assert.equal(vehicle.vin, 'LFV3A123456789001');

      // 重复 VIN 拦截
      await assert.rejects(
        async () => {
          await vehicleService.createVehicle({
            vin: 'LFV3A123456789001',
            plateNumber: '粤B99999',
            brandId: 'brand_tesla',
            modelId: 'model_y',
            projectId: 'proj_default_01',
          });
        },
        {
          name: 'ConflictException',
          message: /already exists/,
        }
      );
    });
  });

  await t.test('4. Hardware binding and unbinding flow', async () => {
    await TenantContext.run(tenantSessionA, async () => {
      const device = await deviceRepo.findByDeviceNo('TBOX_TEST_1001');
      assert.ok(device);

      const vehicle = await vehicleRepo.findByVin('LFV3A123456789001');
      assert.ok(vehicle);

      // 绑定成功
      const bindResult = await vehicleService.bindDevice(vehicle!.id, device!.id);
      assert.equal(bindResult, true);

      // 验证绑定已建立
      const updatedVehicle = await vehicleService.getVehicleDetail(vehicle!.id);
      assert.equal(updatedVehicle.deviceId, device!.id);
      assert.equal(updatedVehicle.deviceNo, 'TBOX_TEST_1001');

      // 尝试绑定给另一台车，防占用冲突
      const vehicle2 = await vehicleService.createVehicle({
        vin: 'LFV3A123456789002',
        plateNumber: '粤B66666',
        brandId: 'brand_byd',
        modelId: 'model_han',
        projectId: 'proj_default_01',
      });

      await assert.rejects(
        async () => {
          await vehicleService.bindDevice(vehicle2.id, device!.id);
        },
        {
          name: 'BadRequestException',
          message: /already bound to vehicle/,
        }
      );

      // 解绑
      const unbindResult = await vehicleService.unbindDevice(vehicle!.id);
      assert.equal(unbindResult, true);

      const unbindDetail = await vehicleService.getVehicleDetail(vehicle!.id);
      assert.equal(unbindDetail.deviceId, undefined);

      // 解绑后设备可被 vehicle2 绑定
      const rebindResult = await vehicleService.bindDevice(vehicle2.id, device!.id);
      assert.equal(rebindResult, true);
    });
  });

  await t.test('5. Four-tier hierarchy traceability (Device -> Vehicle -> Project -> Tenant)', async () => {
    await TenantContext.run(tenantSessionA, async () => {
      const hierarchy = await deviceService.resolveHierarchy('TBOX_TEST_1001');

      assert.equal(hierarchy.deviceNo, 'TBOX_TEST_1001');
      assert.equal(hierarchy.tenant.name, '示范网约车集团');
      assert.equal(hierarchy.project?.name, '鹏程网约车一期');
      assert.ok(hierarchy.vehicle);
      assert.equal(hierarchy.vehicle?.vin, 'LFV3A123456789002');
      assert.equal(hierarchy.vehicle?.plateNumber, '粤B66666');
    });
  });

  await t.test('6. Cross-tenant hardware binding guard', async () => {
    // 租户 B 创建一辆车
    await TenantContext.run(tenantSessionB, async () => {
      const vehicleB = await vehicleService.createVehicle({
        vin: 'VIN_TENANT_B_888',
        plateNumber: '粤B8888B',
        brandId: 'brand_audi',
        modelId: 'model_a6',
        projectId: 'proj_b_01',
      });

      // 租户 B 试图绑定租户 A 的设备
      const deviceA = await TenantContext.run(tenantSessionA, async () =>
        deviceRepo.findByDeviceNo('TBOX_TEST_1001')
      );
      assert.ok(deviceA);

      await assert.rejects(
        async () => {
          await vehicleService.bindDevice(vehicleB.id, deviceA!.id);
        },
        {
          name: 'NotFoundException',
          message: /not found in current tenant/,
        }
      );
    });
  });

  await t.test('7. Realtime online status linkage', async () => {
    await TenantContext.run(tenantSessionA, async () => {
      // 模拟车载设备上线心跳
      deviceStatusService.recordHeartbeat('TBOX_TEST_1001', Date.now());

      const vehicle2 = await vehicleRepo.findByVin('LFV3A123456789002');
      const detail = await vehicleService.getVehicleDetail(vehicle2!.id);

      assert.equal(detail.onlineStatus, 'ONLINE');
    });
  });
});
