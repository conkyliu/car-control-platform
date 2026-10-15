import test from 'node:test';
import assert from 'node:assert/strict';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import {
  Permission,
  RoleCode,
  ProjectDto,
  CreateProjectInput,
  UpdateProjectInput,
} from '@car-control/contracts';
import { DeviceOnlineStatus } from '@car-control/domain-types';
import {
  DeviceRepository,
  VehicleRepository,
  TenantContext,
} from '@car-control/database';
import { ProjectService } from '../project/project.service.js';
import { ProjectController } from '../project/project.controller.js';
import { DeviceService } from '../device/device.service.js';
import { DeviceController } from '../device/device.controller.js';
import { TenantService } from '../tenant/tenant.service.js';
import { DeviceStatusService } from '../device/device-status.service.js';
import { AuditService } from '../audit/audit.service.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { PERMISSIONS_KEY } from '../auth/decorators/permissions.decorator.js';

test('ProjectController & Available Devices Acceptance Suite', async (t) => {
  const deviceRepo = new DeviceRepository();
  const vehicleRepo = new VehicleRepository();
  const projectService = new ProjectService(deviceRepo, vehicleRepo);
  const projectController = new ProjectController(projectService);

  const tenantService = new TenantService();
  const deviceStatusService = new DeviceStatusService();
  const auditService = new AuditService();
  const deviceService = new DeviceService(
    deviceRepo,
    vehicleRepo,
    tenantService,
    projectService,
    deviceStatusService,
    auditService
  );
  const deviceController = new DeviceController(deviceService);
  const reflector = new Reflector();

  const sessionTenantDefault = {
    tenantId: 'TENANT_DEFAULT',
    userId: 'usr_admin',
    roles: [RoleCode.SUPER_ADMIN],
    permissions: [Permission.DEVICE_READ, Permission.DEVICE_WRITE],
  };

  const sessionTenantB = {
    tenantId: 'TENANT_B',
    userId: 'usr_tenant_b',
    roles: [RoleCode.TENANT_ADMIN],
    permissions: [Permission.DEVICE_READ, Permission.DEVICE_WRITE],
  };

  await t.test('1. Project listing, retrieval, and multi-tenant isolation', async () => {
    // Under TENANT_DEFAULT
    await TenantContext.run(sessionTenantDefault, async () => {
      const projects = await projectController.listProjects();
      assert.ok(Array.isArray(projects));
      assert.ok(projects.length >= 1, 'TENANT_DEFAULT should have default seed project');

      const defaultProj = projects.find((p) => p.id === 'proj_default_01');
      assert.ok(defaultProj, 'proj_default_01 should exist in TENANT_DEFAULT');
      assert.equal(defaultProj.name, '鹏程网约车一期');
      assert.equal(defaultProj.code, 'PC_FLEET_01');
      assert.equal(defaultProj.status, 'ACTIVE');

      // Ensure TENANT_B project is not leaked
      const bProjInDefault = projects.find((p) => p.id === 'proj_b_01');
      assert.equal(bProjInDefault, undefined, 'proj_b_01 must not be visible in TENANT_DEFAULT');

      // Retrieve single project
      const single = await projectController.getProject('proj_default_01');
      assert.equal(single.id, 'proj_default_01');
      assert.equal(single.code, 'PC_FLEET_01');

      // Cross-tenant access to proj_b_01 must throw NotFoundException
      await assert.rejects(
        async () => {
          await projectController.getProject('proj_b_01');
        },
        { name: 'NotFoundException' }
      );
    });

    // Under TENANT_B
    await TenantContext.run(sessionTenantB, async () => {
      const bProjects = await projectController.listProjects();
      assert.ok(Array.isArray(bProjects));
      assert.ok(bProjects.some((p) => p.id === 'proj_b_01'), 'proj_b_01 must exist in TENANT_B');
      assert.ok(!bProjects.some((p) => p.id === 'proj_default_01'), 'proj_default_01 must not be visible in TENANT_B');

      // Cross-tenant access to proj_default_01 must throw NotFoundException
      await assert.rejects(
        async () => {
          await projectController.getProject('proj_default_01');
        },
        { name: 'NotFoundException' }
      );
    });
  });

  await t.test('2. Project creation, code validation, and duplicate rejection', async () => {
    await TenantContext.run(sessionTenantDefault, async () => {
      const newProjInput: CreateProjectInput = {
        name: '深圳湾智慧网约车示范项目',
        code: 'SZ_BAY_01',
        orgName: '华南车联网技术运营部',
        contactName: '林工',
        contactPhone: '13800138001',
        description: '大湾区高等级自动驾驶与网约运营平台',
        status: 'ACTIVE',
      };

      const created = await projectController.createProject(newProjInput);
      assert.ok(created.id);
      assert.equal(created.name, '深圳湾智慧网约车示范项目');
      assert.equal(created.code, 'SZ_BAY_01');
      assert.equal(created.orgName, '华南车联网技术运营部');
      assert.equal(created.contactName, '林工');
      assert.equal(created.contactPhone, '13800138001');
      assert.equal(created.status, 'ACTIVE');

      // Duplicate code in same tenant must be rejected
      await assert.rejects(
        async () => {
          await projectController.createProject({
            name: '冲突项目',
            code: 'sz_bay_01', // case insensitive collision
          });
        },
        { name: 'ConflictException' }
      );

      // Invalid project code format (< 3 characters)
      await assert.rejects(
        async () => {
          await projectController.createProject({
            name: '短代码项目',
            code: 'AB',
          });
        },
        { name: 'BadRequestException' }
      );

      // Invalid project code format (illegal characters like spaces or symbols)
      await assert.rejects(
        async () => {
          await projectController.createProject({
            name: '特殊字符代码',
            code: 'CODE-WITH-DASH!',
          });
        },
        { name: 'BadRequestException' }
      );

      // Empty project name
      await assert.rejects(
        async () => {
          await projectController.createProject({
            name: '   ',
            code: 'VALID_CODE_01',
          });
        },
        { name: 'BadRequestException' }
      );
    });

    // In TENANT_B, same code 'SZ_BAY_01' can be created independently (multi-tenant code isolation)
    await TenantContext.run(sessionTenantB, async () => {
      const bCreated = await projectController.createProject({
        name: 'TENANT_B 的深圳湾项目',
        code: 'SZ_BAY_01',
      });
      assert.ok(bCreated.id);
      assert.equal(bCreated.code, 'SZ_BAY_01');
    });
  });

  await t.test('3. Project update (PATCH & PUT) and code collision check', async () => {
    await TenantContext.run(sessionTenantDefault, async () => {
      // Create a project to test updates
      const p1 = await projectController.createProject({
        name: '更新前项目1',
        code: 'PROJ_UP_01',
      });
      const p2 = await projectController.createProject({
        name: '更新前项目2',
        code: 'PROJ_UP_02',
      });

      // Update basic fields via PATCH
      const patchUpdated = await projectController.updateProject(p1.id, {
        name: '更新后项目1 (已修改)',
        description: '已更新项目说明',
        contactName: '周经理',
      });
      assert.equal(patchUpdated.name, '更新后项目1 (已修改)');
      assert.equal(patchUpdated.description, '已更新项目说明');
      assert.equal(patchUpdated.contactName, '周经理');
      assert.equal(patchUpdated.code, 'PROJ_UP_01');

      // Update via PUT (replaceProject)
      const putUpdated = await projectController.replaceProject(p1.id, {
        name: '更新后项目1 (PUT覆盖)',
        code: 'PROJ_UP_01_NEW',
      });
      assert.equal(putUpdated.name, '更新后项目1 (PUT覆盖)');
      assert.equal(putUpdated.code, 'PROJ_UP_01_NEW');

      // Update to conflicting code of p2
      await assert.rejects(
        async () => {
          await projectController.updateProject(p1.id, {
            code: 'PROJ_UP_02',
          });
        },
        { name: 'ConflictException' }
      );

      // Update non-existent project throws NotFoundException
      await assert.rejects(
        async () => {
          await projectController.updateProject('non_existent_id', {
            name: '测试',
          });
        },
        { name: 'NotFoundException' }
      );
    });
  });

  await t.test('4. Project status change and archive safety guards', async () => {
    await TenantContext.run(sessionTenantDefault, async () => {
      // Create a fresh test project
      const proj = await projectController.createProject({
        name: '状态流转测试项目',
        code: 'STATUS_TEST_01',
      });

      // ACTIVE -> PAUSED
      const paused = await projectController.updateProjectStatus(proj.id, { status: 'PAUSED' });
      assert.equal(paused.status, 'PAUSED');

      // PAUSED -> ACTIVE
      const reactivated = await projectController.updateProjectStatus(proj.id, { status: 'ACTIVE' });
      assert.equal(reactivated.status, 'ACTIVE');

      // 4.1 Safety guard: cannot archive project if online devices exist
      // Seed an online device in this project
      const onlineDev = await deviceRepo.create({
        id: 'dev_status_online',
        projectId: proj.id,
        deviceNo: 'DEV_STAT_01',
        imei: '860000000000001',
        productKey: 'TBOX-G5-PRO',
        status: 'ACTIVE',
        onlineStatus: DeviceOnlineStatus.ONLINE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await assert.rejects(
        async () => {
          await projectController.updateProjectStatus(proj.id, { status: 'ARCHIVED' });
        },
        {
          name: 'BadRequestException',
          message: /存在.*在线设备.*禁止直接归档/,
        }
      );

      // Remove online device or set OFFLINE
      onlineDev.onlineStatus = DeviceOnlineStatus.OFFLINE;

      // 4.2 Safety guard: cannot archive project if bound vehicles exist
      const veh = await vehicleRepo.create({
        id: 'veh_status_guard',
        projectId: proj.id,
        vin: 'VIN_STAT_GUARD_001',
        plateNumber: '粤B99991',
        brandId: 'brand-byd',
        modelId: 'model-han',
        status: 'NORMAL',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await assert.rejects(
        async () => {
          await projectController.updateProjectStatus(proj.id, { status: 'ARCHIVED' });
        },
        {
          name: 'BadRequestException',
          message: /仍有关联.*车辆.*禁止直接归档/,
        }
      );

      // Delete vehicle and device to test clean archive
      await vehicleRepo.delete(veh.id);
      await deviceRepo.delete(onlineDev.id);

      const archived = await projectController.updateProjectStatus(proj.id, { status: 'ARCHIVED' });
      assert.equal(archived.status, 'ARCHIVED');
    });
  });

  await t.test('5. Device allocation across projects', async () => {
    await TenantContext.run(sessionTenantDefault, async () => {
      const projA = await projectController.createProject({
        name: '调配来源项目A',
        code: 'ALLOC_SRC_A',
      });
      const projB = await projectController.createProject({
        name: '调配目标项目B',
        code: 'ALLOC_DST_B',
      });

      const dev1 = await deviceRepo.create({
        id: 'dev_alloc_01',
        projectId: projA.id,
        deviceNo: 'DEV_ALLOC_01',
        imei: '860000000000011',
        productKey: 'TBOX-G5-PRO',
        status: 'ACTIVE',
        onlineStatus: DeviceOnlineStatus.OFFLINE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const dev2 = await deviceRepo.create({
        id: 'dev_alloc_02',
        projectId: projA.id,
        deviceNo: 'DEV_ALLOC_02',
        imei: '860000000000012',
        productKey: 'TBOX-G5-PRO',
        status: 'ACTIVE',
        onlineStatus: DeviceOnlineStatus.OFFLINE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Check counts before allocation
      const pABefore = await projectController.getProject(projA.id);
      assert.equal(pABefore.deviceCount, 2);

      // Allocate dev1 and dev2 to projB
      const result = await projectController.allocateDevices(projB.id, {
        deviceIds: [dev1.id, dev2.id],
      });
      assert.equal(result.success, true);

      // Verify devices' projectId updated
      const updatedDev1 = await deviceRepo.findById(dev1.id);
      const updatedDev2 = await deviceRepo.findById(dev2.id);
      assert.equal(updatedDev1?.projectId, projB.id);
      assert.equal(updatedDev2?.projectId, projB.id);

      // Check updated counts on both projects
      const pAAfter = await projectController.getProject(projA.id);
      const pBAfter = await projectController.getProject(projB.id);
      assert.equal(pAAfter.deviceCount, 0);
      assert.equal(pBAfter.deviceCount, 2);

      // Clean up
      await deviceRepo.delete(dev1.id);
      await deviceRepo.delete(dev2.id);
    });
  });

  await t.test('6. Project deletion and association safety guard', async () => {
    await TenantContext.run(sessionTenantDefault, async () => {
      const delProj = await projectController.createProject({
        name: '待删除项目',
        code: 'DEL_TEST_01',
      });

      // Add a device to delProj
      const dev = await deviceRepo.create({
        id: 'dev_del_guard',
        projectId: delProj.id,
        deviceNo: 'DEV_DEL_01',
        imei: '860000000000021',
        productKey: 'TBOX-G5-PRO',
        status: 'ACTIVE',
        onlineStatus: DeviceOnlineStatus.OFFLINE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Attempt deletion with associated device -> must fail
      await assert.rejects(
        async () => {
          await projectController.deleteProject(delProj.id);
        },
        {
          name: 'BadRequestException',
          message: /关联设备或车辆.*禁止删除/,
        }
      );

      // Delete device
      await deviceRepo.delete(dev.id);

      // Deletion of empty project succeeds
      const delResult = await projectController.deleteProject(delProj.id);
      assert.equal(delResult.success, true);

      // Project is gone
      await assert.rejects(
        async () => {
          await projectController.getProject(delProj.id);
        },
        { name: 'NotFoundException' }
      );
    });
  });

  await t.test('7. GET /api/v1/devices/available queries active unbound devices with projectId filter', async () => {
    await TenantContext.run(sessionTenantDefault, async () => {
      const proj1 = await projectController.createProject({
        name: '可用设备测试项目1',
        code: 'AVAIL_PROJ_01',
      });
      const proj2 = await projectController.createProject({
        name: '可用设备测试项目2',
        code: 'AVAIL_PROJ_02',
      });

      // Device 1: ACTIVE, Project 1, Unbound -> AVAILABLE
      const dev1 = await deviceRepo.create({
        id: 'dev_avail_01',
        projectId: proj1.id,
        deviceNo: 'DEV_AVAIL_01',
        imei: '860000000000031',
        productKey: 'TBOX-G5-PRO',
        status: 'ACTIVE',
        onlineStatus: DeviceOnlineStatus.ONLINE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Device 2: ACTIVE, Project 2, Unbound -> AVAILABLE
      const dev2 = await deviceRepo.create({
        id: 'dev_avail_02',
        projectId: proj2.id,
        deviceNo: 'DEV_AVAIL_02',
        imei: '860000000000032',
        productKey: 'TBOX-G5-PRO',
        status: 'ACTIVE',
        onlineStatus: DeviceOnlineStatus.OFFLINE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Device 3: ACTIVE, Project 1, Bound to vehicle -> NOT AVAILABLE
      const dev3 = await deviceRepo.create({
        id: 'dev_avail_03',
        projectId: proj1.id,
        deviceNo: 'DEV_AVAIL_03',
        imei: '860000000000033',
        productKey: 'TBOX-G5-PRO',
        status: 'ACTIVE',
        onlineStatus: DeviceOnlineStatus.ONLINE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const veh = await vehicleRepo.create({
        id: 'veh_avail_binding',
        projectId: proj1.id,
        deviceId: dev3.id,
        vin: 'VIN_AVAIL_BIND_01',
        plateNumber: '粤B88888',
        brandId: 'brand-byd',
        modelId: 'model-han',
        status: 'NORMAL',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Device 4: INACTIVE, Project 1, Unbound -> NOT AVAILABLE
      const dev4 = await deviceRepo.create({
        id: 'dev_avail_04',
        projectId: proj1.id,
        deviceNo: 'DEV_AVAIL_04',
        imei: '860000000000034',
        productKey: 'TBOX-G5-PRO',
        status: 'INACTIVE',
        onlineStatus: DeviceOnlineStatus.OFFLINE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Query without projectId filter -> returns dev1 & dev2, excludes dev3 and dev4
      const allAvail = await deviceController.getAvailableDevices();
      const allAvailIds = allAvail.map((d: any) => d.id);
      assert.ok(allAvailIds.includes(dev1.id), 'dev1 should be available');
      assert.ok(allAvailIds.includes(dev2.id), 'dev2 should be available');
      assert.ok(!allAvailIds.includes(dev3.id), 'dev3 bound to vehicle must NOT be available');
      assert.ok(!allAvailIds.includes(dev4.id), 'dev4 INACTIVE must NOT be available');

      // Query with projectId='ALL' -> same as no filter
      const allParamAvail = await deviceController.getAvailableDevices('ALL');
      const allParamIds = allParamAvail.map((d: any) => d.id);
      assert.ok(allParamIds.includes(dev1.id));
      assert.ok(allParamIds.includes(dev2.id));
      assert.ok(!allParamIds.includes(dev3.id));

      // Query with specific projectId = proj1.id -> returns dev1, excludes dev2
      const proj1Avail = await deviceController.getAvailableDevices(proj1.id);
      const proj1AvailIds = proj1Avail.map((d: any) => d.id);
      assert.ok(proj1AvailIds.includes(dev1.id), 'proj1 should contain dev1');
      assert.ok(!proj1AvailIds.includes(dev2.id), 'proj1 should NOT contain dev2 from proj2');

      // Verify bound properties are null and projectName is enriched
      const dev1Detail = proj1Avail.find((d: any) => d.id === dev1.id);
      assert.equal(dev1Detail.projectName, '可用设备测试项目1');
      assert.equal(dev1Detail.boundVin, null);
      assert.equal(dev1Detail.boundVehiclePlate, null);

      // Clean up
      await vehicleRepo.delete(veh.id);
      await deviceRepo.delete(dev1.id);
      await deviceRepo.delete(dev2.id);
      await deviceRepo.delete(dev3.id);
      await deviceRepo.delete(dev4.id);
    });
  });

  await t.test('8. RBAC permission metadata check on ProjectController and DeviceController', async () => {
    // ProjectController metadata
    const listPerms = reflector.get(PERMISSIONS_KEY, projectController.listProjects);
    assert.deepEqual(listPerms, [Permission.DEVICE_READ]);

    const getPerms = reflector.get(PERMISSIONS_KEY, projectController.getProject);
    assert.deepEqual(getPerms, [Permission.DEVICE_READ]);

    const createPerms = reflector.get(PERMISSIONS_KEY, projectController.createProject);
    assert.deepEqual(createPerms, [Permission.DEVICE_WRITE]);

    const updatePerms = reflector.get(PERMISSIONS_KEY, projectController.updateProject);
    assert.deepEqual(updatePerms, [Permission.DEVICE_WRITE]);

    const statusPerms = reflector.get(PERMISSIONS_KEY, projectController.updateProjectStatus);
    assert.deepEqual(statusPerms, [Permission.DEVICE_WRITE]);

    const allocPerms = reflector.get(PERMISSIONS_KEY, projectController.allocateDevices);
    assert.deepEqual(allocPerms, [Permission.DEVICE_WRITE]);

    const delPerms = reflector.get(PERMISSIONS_KEY, projectController.deleteProject);
    assert.deepEqual(delPerms, [Permission.DEVICE_WRITE]);

    // DeviceController getAvailableDevices metadata
    const availPerms = reflector.get(PERMISSIONS_KEY, deviceController.getAvailableDevices);
    assert.deepEqual(availPerms, [Permission.DEVICE_READ]);

    // PermissionsGuard enforcement
    const guard = new PermissionsGuard(reflector);

    const makeContext = (user: any, handler: any, controllerClass: any) =>
      ({
        getHandler: () => handler,
        getClass: () => controllerClass,
        switchToHttp: () => ({
          getRequest: () => ({ user }),
        }),
      } as unknown as ExecutionContext);

    const authorizedUser = {
      sub: 'usr_writer',
      tenantId: 'TENANT_DEFAULT',
      permissions: [Permission.DEVICE_WRITE],
    };

    const readOnlyUser = {
      sub: 'usr_reader',
      tenantId: 'TENANT_DEFAULT',
      permissions: [Permission.DEVICE_READ],
    };

    // Read only user attempting write action -> ForbiddenException
    assert.throws(
      () => {
        guard.canActivate(makeContext(readOnlyUser, projectController.createProject, ProjectController));
      },
      { name: 'ForbiddenException' }
    );

    // Authorized user passes
    const allowed = guard.canActivate(
      makeContext(authorizedUser, projectController.createProject, ProjectController)
    );
    assert.equal(allowed, true);
  });
});
