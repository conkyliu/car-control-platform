import test from 'node:test';
import assert from 'node:assert/strict';
import { VehicleRepository, DeviceRepository, TenantContext } from '@car-control/database';
import { ProjectService } from '../project/project.service.js';
import { DeviceStatusService } from '../device/device-status.service.js';
import { AuditService } from '../audit/audit.service.js';
import { VehicleService } from '../vehicle/vehicle.service.js';
import { VehicleController } from '../vehicle/vehicle.controller.js';
import { Permission } from '@car-control/contracts';
import { Reflector } from '@nestjs/core';

test('Vehicle Brands and Models API Unit Suite', async (t) => {
  const vehicleRepo = new VehicleRepository();
  const deviceRepo = new DeviceRepository();
  const projectService = new ProjectService();
  const deviceStatusService = new DeviceStatusService();
  const auditService = new AuditService();

  const service = new VehicleService(
    vehicleRepo,
    deviceRepo,
    projectService,
    deviceStatusService,
    auditService
  );

  const controller = new VehicleController(service);

  await t.test('1. Get brands returns list of brands without triggering vehicle detail lookup', async () => {
    const brands = await service.listBrands();
    assert.ok(Array.isArray(brands));
    assert.ok(brands.length >= 3, 'Should have at least 3 seed brands');
    const brandCodes = brands.map((b) => b.code);
    assert.ok(brandCodes.includes('TESLA'));
    assert.ok(brandCodes.includes('BYD'));
    assert.ok(brandCodes.includes('NIO'));
  });

  await t.test('2. Get models returns list and filters by brandId', async () => {
    const allModels = await service.listModels();
    assert.ok(Array.isArray(allModels));
    assert.ok(allModels.length >= 3, 'Should have at least 3 seed models');

    const teslaModels = await service.listModels('brand-tesla');
    assert.ok(Array.isArray(teslaModels));
    assert.ok(teslaModels.length > 0);
    assert.ok(teslaModels.every((m) => m.brandId === 'brand-tesla'));
    assert.ok(teslaModels.some((m) => m.name.includes('Model Y')));

    const emptyModels = await service.listModels('non-existent-brand');
    assert.deepEqual(emptyModels, []);
  });

  await t.test('3. Create brand and create model dynamically updates lists', async () => {
    const newBrand = await service.createBrand({
      name: '小鹏汽车',
      code: 'XPENG',
      country: '自主新势力',
    });
    assert.ok(newBrand.id);
    assert.equal(newBrand.name, '小鹏汽车');
    assert.equal(newBrand.code, 'XPENG');

    const brands = await service.listBrands();
    assert.ok(brands.some((b) => b.code === 'XPENG'));

    const newModel = await service.createModel({
      brandId: newBrand.id,
      name: '小鹏 G9',
      code: '0x0601',
      powertrain: 'EV',
      capabilityTemplateId: 'tpl-std-ev',
      capabilityTemplateName: '纯电标准控车模板',
    });
    assert.ok(newModel.id);
    assert.equal(newModel.brandId, newBrand.id);
    assert.equal(newModel.name, '小鹏 G9');
    assert.equal(newModel.brandName, '小鹏汽车');

    const xpengModels = await service.listModels(newBrand.id);
    assert.equal(xpengModels.length, 1);
    assert.equal(xpengModels[0].name, '小鹏 G9');
  });

  await t.test('4. Controller delegates to service and routes correctly without route conflict', async () => {
    const controllerBrands = await controller.listBrands();
    assert.ok(Array.isArray(controllerBrands));
    assert.ok(controllerBrands.some((b) => b.code === 'BYD'));

    const controllerModels = await controller.listModels('brand-byd');
    assert.ok(Array.isArray(controllerModels));
    assert.ok(controllerModels.every((m) => m.brandId === 'brand-byd'));

    const tenantSession = { tenantId: 'TENANT_DEFAULT', userId: 'user_admin_01' };
    await TenantContext.run(tenantSession, async () => {
      await assert.rejects(
        async () => {
          await controller.getVehicleDetail('brands');
        },
        {
          name: 'NotFoundException',
          message: 'Vehicle with id brands not found',
        }
      );
    });
  });

  await t.test('5. RBAC permission metadata check on controller endpoints', async () => {
    const reflector = new Reflector();
    const listBrandsPerm = reflector.get('permissions', controller.listBrands);
    assert.deepEqual(listBrandsPerm, [Permission.VEHICLE_READ]);

    const createBrandPerm = reflector.get('permissions', controller.createBrand);
    assert.deepEqual(createBrandPerm, [Permission.VEHICLE_WRITE]);

    const listModelsPerm = reflector.get('permissions', controller.listModels);
    assert.deepEqual(listModelsPerm, [Permission.VEHICLE_READ]);

    const createModelPerm = reflector.get('permissions', controller.createModel);
    assert.deepEqual(createModelPerm, [Permission.VEHICLE_WRITE]);
  });
});
