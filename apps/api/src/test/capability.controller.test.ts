import test from 'node:test';
import assert from 'node:assert/strict';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  CommandCode,
  SecurityLevel,
  Permission,
  RoleCode,
  ModelTemplateDto,
  ProjectOverrideDto,
  VehicleCapabilityOverrideDto,
  EffectiveCapabilityDto,
} from '@car-control/contracts';
import {
  CapabilityRepository,
  VehicleRepository,
  TenantContext,
} from '@car-control/database';
import { CapabilityEngine } from '../capability/capability.engine.js';
import { CapabilityController } from '../capability/capability.controller.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';

test('CapabilityController & 3-Tier Inheritance Acceptance Suite', async (t) => {
  const capabilityRepo = new CapabilityRepository();
  const vehicleRepo = new VehicleRepository();
  const capabilityEngine = new CapabilityEngine(capabilityRepo, vehicleRepo);
  const capabilityController = new CapabilityController(
    capabilityRepo,
    capabilityEngine,
    vehicleRepo
  );
  const reflector = new Reflector();

  const mockAdminUser = {
    sub: 'usr_admin',
    tenantId: 'TENANT_DEFAULT',
    roles: [RoleCode.SUPER_ADMIN],
    permissions: [Permission.VEHICLE_READ, Permission.VEHICLE_WRITE],
  };

  const mockAdminReq = { user: mockAdminUser };

  await t.test('1. CapabilityRepository realistic default seed templates', async () => {
    const templates = await capabilityRepo.listModelTemplates();
    assert.ok(templates.length >= 3, 'Should have at least 3 seed templates');

    const stdEv = await capabilityRepo.getModelTemplateById('tpl-std-ev');
    assert.ok(stdEv, 'tpl-std-ev must exist in seed templates');
    assert.equal(stdEv.modelName, '纯电标准控车模板');
    assert.equal(stdEv.capabilities[CommandCode.CMD_LOCK]?.supported, true);
    assert.equal(stdEv.capabilities[CommandCode.CMD_ENGINE_START]?.supported, false);

    const perfEv = await capabilityRepo.getModelTemplateById('tpl-perf-ev');
    assert.ok(perfEv, 'tpl-perf-ev must exist in seed templates');
    assert.equal(perfEv.modelName, '纯电高性能双电机模板');
    assert.equal(perfEv.capabilities[CommandCode.CMD_SEAT_HEAT]?.supported, true);
    assert.equal(perfEv.capabilities[CommandCode.CMD_ENGINE_START]?.supported, false);

    const phevStd = await capabilityRepo.getModelTemplateById('tpl-phev-std');
    assert.ok(phevStd, 'tpl-phev-std must exist in seed templates');
    assert.equal(phevStd.modelName, '插电混动旗舰模板');
    assert.equal(phevStd.capabilities[CommandCode.CMD_ENGINE_START]?.supported, true);
  });

  await t.test('2. Model template CRUD, clone, and lookup by modelId', async () => {
    // 2.1 List templates
    const list = await capabilityController.listTemplates();
    assert.ok(Array.isArray(list));
    assert.ok(list.some((t) => t.id === 'tpl-std-ev'));

    // 2.2 Get by modelId
    const byModel = await capabilityController.getTemplateByModel('model-std-ev');
    assert.ok(byModel);
    assert.equal(byModel.id, 'tpl-std-ev');

    const notFoundModel = await capabilityController.getTemplateByModel('model-non-existent');
    assert.equal(notFoundModel, null);

    // 2.3 Get by id
    const byId = await capabilityController.getTemplateById('tpl-std-ev');
    assert.equal(byId.id, 'tpl-std-ev');

    await assert.rejects(
      async () => capabilityController.getTemplateById('tpl-non-existent'),
      (err: any) => err instanceof NotFoundException
    );

    // 2.4 Create new template
    const created = await capabilityController.createTemplate(
      {
        modelId: 'model-suv-neo',
        modelName: '未来猎装 SUV',
        protocolCode: '0x0005',
        powertrain: 'EV',
        description: '未来猎装 SUV 全功能模板',
        baseTemplateId: 'tpl-perf-ev',
        capabilities: {
          [CommandCode.CMD_SUNROOF_CONTROL]: {
            supported: false,
            securityLevel: SecurityLevel.L1,
            timeoutMs: 10000,
            frequencyLimitSeconds: 5,
            description: '无天窗配置',
          },
        },
      },
      mockAdminReq
    );
    assert.ok(created.id);
    assert.equal(created.modelId, 'model-suv-neo');
    assert.equal(created.capabilities[CommandCode.CMD_SUNROOF_CONTROL]?.supported, false);
    assert.equal(created.capabilities[CommandCode.CMD_LOCK]?.supported, true); // Inherited from base

    // 2.5 Update template (PATCH / PUT)
    const updated = await capabilityController.updateTemplate(
      created.id,
      {
        capabilities: {
          ...created.capabilities,
          [CommandCode.CMD_SUNROOF_CONTROL]: {
            supported: true,
            securityLevel: SecurityLevel.L1,
            timeoutMs: 12000,
            frequencyLimitSeconds: 5,
          },
        },
      },
      mockAdminReq
    );
    assert.equal(updated.capabilities[CommandCode.CMD_SUNROOF_CONTROL]?.supported, true);

    // 2.6 Clone template
    const cloned = await capabilityController.cloneTemplate(
      'tpl-std-ev',
      {
        targetModelId: 'model-cloned-std',
        targetModelName: '标准纯电克隆版',
        targetProtocolCode: '0x0001',
      },
      mockAdminReq
    );
    assert.ok(cloned.id);
    assert.equal(cloned.modelId, 'model-cloned-std');
    assert.equal(cloned.modelName, '标准纯电克隆版');
    assert.equal(cloned.capabilities[CommandCode.CMD_LOCK]?.supported, true);
    assert.equal(cloned.capabilities[CommandCode.CMD_ENGINE_START]?.supported, false);

    // 2.7 Delete template
    const delResult = await capabilityController.deleteTemplate(created.id!);
    assert.equal(delResult.success, true);
    await assert.rejects(
      async () => capabilityController.getTemplateById(created.id!),
      (err: any) => err instanceof NotFoundException
    );
  });

  await t.test('3. Project capability override CRUD', async () => {
    const projId = 'proj-shenzhen-01';

    // 3.1 Initial query returns null
    const initial = await capabilityController.getProjectOverride(projId);
    assert.equal(initial, null);

    // 3.2 Put project override
    const saved = await capabilityController.putProjectOverride(
      projId,
      {
        overrides: {
          [CommandCode.CMD_WINDOW_OPEN]: {
            supported: false,
            securityLevel: SecurityLevel.L1,
            timeoutMs: 10000,
            frequencyLimitSeconds: 5,
            description: '市政项目禁开车窗防尘降噪',
          },
        },
        reason: '市政环保要求',
      },
      mockAdminReq
    );
    assert.equal(saved.projectId, projId);
    assert.equal(saved.overrides[CommandCode.CMD_WINDOW_OPEN]?.supported, false);

    // 3.3 Query returns saved override
    const retrieved = await capabilityController.getProjectOverride(projId);
    assert.ok(retrieved);
    assert.equal(retrieved?.overrides[CommandCode.CMD_WINDOW_OPEN]?.supported, false);

    // 3.4 Delete project override
    const delRes = await capabilityController.deleteProjectOverride(projId);
    assert.equal(delRes.success, true);

    const afterDel = await capabilityController.getProjectOverride(projId);
    assert.equal(afterDel, null);
  });

  await t.test('4. Vehicle capability override CRUD', async () => {
    const vehId = 'veh-cap-test-01';

    // 4.1 Initial query returns null
    const initial = await capabilityController.getVehicleOverride(vehId);
    assert.equal(initial, null);

    // 4.2 Put vehicle override
    const saved = await capabilityController.putVehicleOverride(
      vehId,
      {
        overrides: {
          [CommandCode.CMD_ENGINE_START]: {
            supported: false,
            securityLevel: SecurityLevel.L2,
            timeoutMs: 15000,
            frequencyLimitSeconds: 15,
            description: '特种展车禁用远程点火',
          },
          [CommandCode.CMD_FIND_VEHICLE]: {
            supported: true,
            securityLevel: SecurityLevel.L0,
            timeoutMs: 8000,
            frequencyLimitSeconds: 0,
            description: '展厅寻车免冷却',
          },
        },
        reason: '静态展车安全限制',
      },
      mockAdminReq
    );
    assert.equal(saved.vehicleId, vehId);
    assert.equal(saved.overrides[CommandCode.CMD_ENGINE_START]?.supported, false);
    assert.equal(saved.overrides[CommandCode.CMD_FIND_VEHICLE]?.frequencyLimitSeconds, 0);

    // 4.3 Query returns override
    const retrieved = await capabilityController.getVehicleOverride(vehId);
    assert.ok(retrieved);
    assert.equal(retrieved?.overrides[CommandCode.CMD_ENGINE_START]?.supported, false);

    // 4.4 Delete vehicle override
    const delRes = await capabilityController.deleteVehicleOverride(vehId);
    assert.equal(delRes.success, true);

    const afterDel = await capabilityController.getVehicleOverride(vehId);
    assert.equal(afterDel, null);
  });

  await t.test('5. 3-Tier capability inheritance pipeline resolution', async () => {
    await TenantContext.run(
      {
        tenantId: 'TENANT_DEFAULT',
        userId: 'usr_admin',
        roles: [RoleCode.SUPER_ADMIN],
      },
      async () => {
        // 创建测试车辆 veh-tier-01 属于 model-phev-std 和 proj-fleet-01
        await vehicleRepo.create({
          id: 'veh-tier-01',
          vin: 'VIN_TIER_0001',
          plateNumber: '粤B·11111',
          brandId: 'brand-byd',
          modelId: 'model-phev-std',
          projectId: 'proj-fleet-01',
          status: 'NORMAL',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // 5.1 Baseline: PHEV standard template supports both ENGINE_START and WINDOW_OPEN
        const allCaps = await capabilityController.getVehicleCapabilities('veh-tier-01', mockAdminReq);
        assert.ok(Array.isArray(allCaps));
        assert.equal(allCaps.length, Object.values(CommandCode).length);

        const engineStartCap = allCaps.find((c: EffectiveCapabilityDto) => c.commandCode === CommandCode.CMD_ENGINE_START);
        assert.ok(engineStartCap);
        assert.equal(engineStartCap.supported, true, 'PHEV template supports ENGINE_START');

        const windowOpenCap = allCaps.find((c: EffectiveCapabilityDto) => c.commandCode === CommandCode.CMD_WINDOW_OPEN);
        assert.ok(windowOpenCap);
        assert.equal(windowOpenCap.supported, true);

        // 5.2 Tier 2: Project-level override disables CMD_WINDOW_OPEN
        await capabilityController.putProjectOverride(
          'proj-fleet-01',
          {
            overrides: {
              [CommandCode.CMD_WINDOW_OPEN]: {
                supported: false,
                description: '车队安全规范：禁用车窗开启',
              },
            },
          },
          mockAdminReq
        );

        const capsAfterProj = await capabilityController.getVehicleCapabilities('veh-tier-01', mockAdminReq);
        const winProj = capsAfterProj.find((c: EffectiveCapabilityDto) => c.commandCode === CommandCode.CMD_WINDOW_OPEN);
        assert.equal(winProj?.supported, false, 'Project override should disable window open');

        // 5.3 Tier 3: Vehicle-level override overrides project and model!
        // 单车专属覆盖：强制打开 CMD_WINDOW_OPEN (覆盖项目级禁用)，且单独禁用 CMD_LOCK
        await capabilityController.putVehicleOverride(
          'veh-tier-01',
          {
            overrides: {
              [CommandCode.CMD_WINDOW_OPEN]: {
                supported: true,
                description: '特批单车允许开窗',
              },
              [CommandCode.CMD_LOCK]: {
                supported: false,
                description: '故障车辆禁用闭锁',
              },
            },
          },
          mockAdminReq
        );

        const capsAfterVeh = await capabilityController.getVehicleCapabilities('veh-tier-01', mockAdminReq);
        const winVeh = capsAfterVeh.find((c: EffectiveCapabilityDto) => c.commandCode === CommandCode.CMD_WINDOW_OPEN);
        assert.equal(winVeh?.supported, true, 'Vehicle override has highest priority over project override');

        const lockVeh = capsAfterVeh.find((c: EffectiveCapabilityDto) => c.commandCode === CommandCode.CMD_LOCK);
        assert.equal(lockVeh?.supported, false, 'Vehicle override has highest priority over model default');

        // 5.4 Delete vehicle override restores project & model rules
        await capabilityController.deleteVehicleOverride('veh-tier-01');
        const capsAfterReset = await capabilityController.getVehicleCapabilities('veh-tier-01', mockAdminReq);

        const winRestored = capsAfterReset.find((c: EffectiveCapabilityDto) => c.commandCode === CommandCode.CMD_WINDOW_OPEN);
        assert.equal(winRestored?.supported, false, 'Window open reverts to project override (disabled)');

        const lockRestored = capsAfterReset.find((c: EffectiveCapabilityDto) => c.commandCode === CommandCode.CMD_LOCK);
        assert.equal(lockRestored?.supported, true, 'Lock reverts to baseline (enabled)');
      }
    );
  });

  await t.test('6. RBAC permission metadata check & guard validation', async () => {
    // Read endpoints
    const readEndpoints = [
      capabilityController.listTemplates,
      capabilityController.getTemplateByModel,
      capabilityController.getTemplateById,
      capabilityController.getProjectOverride,
      capabilityController.getVehicleOverride,
      capabilityController.getVehicleCapabilities,
    ];

    for (const ep of readEndpoints) {
      const perms = reflector.get('permissions', ep);
      assert.deepEqual(perms, [Permission.VEHICLE_READ], `Read endpoint ${ep.name} requires VEHICLE_READ`);
    }

    // Write endpoints
    const writeEndpoints = [
      capabilityController.createTemplate,
      capabilityController.updateTemplate,
      capabilityController.cloneTemplate,
      capabilityController.deleteTemplate,
      capabilityController.putProjectOverride,
      capabilityController.deleteProjectOverride,
      capabilityController.putVehicleOverride,
      capabilityController.deleteVehicleOverride,
    ];

    for (const ep of writeEndpoints) {
      const perms = reflector.get('permissions', ep);
      assert.deepEqual(perms, [Permission.VEHICLE_WRITE], `Write endpoint ${ep.name} requires VEHICLE_WRITE`);
    }

    // Test PermissionsGuard enforcement
    const guard = new PermissionsGuard(reflector);
    const makeCtx = (user: any, handler: any) =>
      ({
        getHandler: () => handler,
        getClass: () => CapabilityController,
        switchToHttp: () => ({
          getRequest: () => ({ user }),
        }),
      } as unknown as ExecutionContext);

    const readOnlyUser = {
      tenantId: 'TENANT_DEFAULT',
      permissions: [Permission.VEHICLE_READ],
    };

    const fullUser = {
      tenantId: 'TENANT_DEFAULT',
      permissions: [Permission.VEHICLE_READ, Permission.VEHICLE_WRITE],
    };

    // Read allowed for readOnlyUser
    assert.equal(guard.canActivate(makeCtx(readOnlyUser, capabilityController.listTemplates)), true);

    // Write forbidden for readOnlyUser
    assert.throws(
      () => guard.canActivate(makeCtx(readOnlyUser, capabilityController.createTemplate)),
      (err: any) => err.status === 403
    );

    // Write allowed for fullUser
    assert.equal(guard.canActivate(makeCtx(fullUser, capabilityController.createTemplate)), true);
  });
});
