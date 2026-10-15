import test from 'node:test';
import assert from 'node:assert/strict';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import {
  Permission,
  RoleCode,
  GeofenceDto,
  CreateGeofenceDto,
  UpdateGeofenceDto,
} from '@car-control/contracts';
import { TenantContext } from '@car-control/database';
import { GeofenceService } from '../telemetry/geofence.service.js';
import { GeofenceController } from '../telemetry/geofence.controller.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { PERMISSIONS_KEY } from '../auth/decorators/permissions.decorator.js';

test('GeofenceController & GeofenceService Acceptance Suite', async (t) => {
  const geofenceService = new GeofenceService();
  const geofenceController = new GeofenceController(geofenceService);
  const reflector = new Reflector();

  const sessionTenantDefault = {
    tenantId: 'TENANT_DEFAULT',
    userId: 'usr_admin_default',
    roles: [RoleCode.SUPER_ADMIN],
    permissions: [Permission.DEVICE_READ, Permission.DEVICE_WRITE],
  };

  const sessionTenantB = {
    tenantId: 'TENANT_B',
    userId: 'usr_admin_b',
    roles: [RoleCode.TENANT_ADMIN],
    permissions: [Permission.DEVICE_READ, Permission.DEVICE_WRITE],
  };

  const reqDefault = { user: sessionTenantDefault };
  const reqTenantB = { user: sessionTenantB };

  // ==========================================
  // Section 1: Geometry Calculations & Collision Detection
  // ==========================================
  await t.test('1. Geometry calculations and collision detection', async () => {
    // 1.1 calculateDistance between Shanghai People's Square and Lujiazui
    const dist = geofenceService.calculateDistance(31.2304, 121.4737, 31.2397, 121.4998);
    assert.ok(dist > 2500 && dist < 3200, `Distance should be ~2.7km, got ${dist}`);

    // 1.2 Legacy checkGeofence method compatibility
    const circleLegacy = {
      centerLat: 31.2304,
      centerLng: 121.4737,
      radiusMeters: 500,
    };
    assert.equal(geofenceService.checkGeofence(circleLegacy, { lat: 31.2304, lng: 121.4737 }), true);
    assert.equal(geofenceService.checkGeofence(circleLegacy, { lat: 31.232, lng: 121.4737 }), true);
    assert.equal(geofenceService.checkGeofence(circleLegacy, { lat: 31.24, lng: 121.4737 }), false);

    // 1.3 Circular collision detection with GeofenceDto
    const circleGeofence: GeofenceDto = {
      id: 'test_circle',
      tenantId: 'TENANT_DEFAULT',
      projectId: 'proj_default_01',
      name: '测试圆形围栏',
      type: 'CIRCLE',
      circle: {
        center: { lat: 31.2397, lng: 121.4998 },
        radiusMeters: 1000,
      },
      triggerType: 'OUT',
      alarmLevel: 'WARNING',
      status: 'ACTIVE',
      boundVehicleCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Center point -> Inside
    assert.equal(geofenceService.isPointInGeofence({ lat: 31.2397, lng: 121.4998 }, circleGeofence), true);
    // Point ~200m away -> Inside
    assert.equal(geofenceService.isPointInGeofence({ lat: 31.241, lng: 121.4998 }, circleGeofence), true);
    // Point ~5km away -> Outside
    assert.equal(geofenceService.isPointInGeofence({ lat: 31.29, lng: 121.4998 }, circleGeofence), false);

    // 1.4 Polygonal collision detection (Ray-Casting and Boundary check)
    const polygon = {
      vertices: [
        { lat: 31.20, lng: 121.50 },
        { lat: 31.20, lng: 121.60 },
        { lat: 31.10, lng: 121.60 },
        { lat: 31.10, lng: 121.50 },
      ],
    };

    const polyGeofence: GeofenceDto = {
      id: 'test_poly',
      tenantId: 'TENANT_DEFAULT',
      projectId: 'proj_default_01',
      name: '测试多边形围栏',
      type: 'POLYGON',
      polygon,
      triggerType: 'IN',
      alarmLevel: 'CRITICAL',
      status: 'ACTIVE',
      boundVehicleCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Point in center -> Inside
    assert.equal(geofenceService.isPointInPolygon({ lat: 31.15, lng: 121.55 }, polygon), true);
    assert.equal(geofenceService.isPointInGeofence({ lat: 31.15, lng: 121.55 }, polyGeofence), true);

    // Point on vertex -> Inside (boundary check)
    assert.equal(geofenceService.isPointInPolygon({ lat: 31.20, lng: 121.50 }, polygon), true);

    // Point on edge segment -> Inside (boundary check)
    assert.equal(geofenceService.isPointInPolygon({ lat: 31.15, lng: 121.50 }, polygon), true);

    // Point outside polygon -> Outside
    assert.equal(geofenceService.isPointInPolygon({ lat: 31.25, lng: 121.55 }, polygon), false);
    assert.equal(geofenceService.isPointInGeofence({ lat: 31.25, lng: 121.55 }, polyGeofence), false);

    // Degenerate polygon (< 3 vertices) returns false
    assert.equal(geofenceService.isPointInPolygon({ lat: 31.15, lng: 121.55 }, { vertices: [{ lat: 1, lng: 1 }] }), false);
  });

  // ==========================================
  // Section 2: List Query and Multi-Dimensional Filtering
  // ==========================================
  await t.test('2. List query and multi-dimensional filtering', async () => {
    // 2.1 Default seeds in TENANT_DEFAULT
    const list = await geofenceController.listGeofences({}, reqDefault);
    assert.ok(Array.isArray(list));
    assert.equal(list.length, 3, 'TENANT_DEFAULT should contain 3 seed geofences');

    // 2.2 Keyword filtering (matches name, description or projectId)
    const keywordLujiazui = await geofenceController.listGeofences({ keyword: '陆家嘴' }, reqDefault);
    assert.equal(keywordLujiazui.length, 1);
    assert.equal(keywordLujiazui[0].id, 'gf_sh_01');

    const keywordDesc = await geofenceController.listGeofences({ keyword: '台账' }, reqDefault);
    assert.equal(keywordDesc.length, 1);
    assert.equal(keywordDesc[0].id, 'gf_sh_03');

    // 2.3 Type filtering
    const circleOnly = await geofenceController.listGeofences({ type: 'CIRCLE' }, reqDefault);
    assert.equal(circleOnly.length, 2);
    assert.ok(circleOnly.every((g) => g.type === 'CIRCLE'));

    const polyOnly = await geofenceController.listGeofences({ type: 'POLYGON' }, reqDefault);
    assert.equal(polyOnly.length, 1);
    assert.equal(polyOnly[0].type, 'POLYGON');
    assert.equal(polyOnly[0].id, 'gf_sh_02');

    // 2.4 AlarmLevel filtering
    const criticalOnly = await geofenceController.listGeofences({ alarmLevel: 'CRITICAL' }, reqDefault);
    assert.equal(criticalOnly.length, 1);
    assert.equal(criticalOnly[0].id, 'gf_sh_02');

    // 2.5 ProjectId filtering
    const projMatch = await geofenceController.listGeofences({ projectId: 'proj_default_01' }, reqDefault);
    assert.equal(projMatch.length, 3);

    const nonMatchProj = await geofenceController.listGeofences({ projectId: 'proj_non_existent' }, reqDefault);
    assert.equal(nonMatchProj.length, 0);
  });

  // ==========================================
  // Section 3: Geofence CRUD Lifecycle
  // ==========================================
  await t.test('3. Geofence CRUD lifecycle and payload wrapper support', async () => {
    // 3.1 Create CIRCLE with unwrapped payload
    const circleInput: CreateGeofenceDto = {
      name: '深圳前海湾保税区试验围栏',
      type: 'CIRCLE',
      projectId: 'proj_default_01',
      circle: {
        center: { lat: 22.525, lng: 113.895 },
        radiusMeters: 2500,
      },
      triggerType: 'OUT',
      alarmLevel: 'WARNING',
      status: 'ACTIVE',
      vehicleIds: ['veh_101', 'veh_102'],
      description: '前海保税港区专用测试电子围栏',
    };

    const createdCircle = await geofenceController.createGeofence(circleInput, reqDefault);
    assert.ok(createdCircle.id);
    assert.equal(createdCircle.name, '深圳前海湾保税区试验围栏');
    assert.equal(createdCircle.type, 'CIRCLE');
    assert.equal(createdCircle.tenantId, 'TENANT_DEFAULT');
    assert.equal(createdCircle.boundVehicleCount, 2);
    assert.equal(createdCircle.circle?.radiusMeters, 2500);

    // 3.2 Create POLYGON with wrapped payload { data: ... }
    const polyInput = {
      data: {
        name: '深圳科技园高新南禁行区',
        type: 'POLYGON',
        projectId: 'proj_default_01',
        polygon: {
          vertices: [
            { lat: 22.54, lng: 113.93 },
            { lat: 22.55, lng: 113.95 },
            { lat: 22.53, lng: 113.95 },
          ],
        },
        triggerType: 'IN',
        alarmLevel: 'CRITICAL',
        status: 'ACTIVE',
      },
    };

    const createdPoly = await geofenceController.createGeofence(polyInput, reqDefault);
    assert.ok(createdPoly.id);
    assert.equal(createdPoly.name, '深圳科技园高新南禁行区');
    assert.equal(createdPoly.type, 'POLYGON');
    assert.equal(createdPoly.alarmLevel, 'CRITICAL');
    assert.equal(createdPoly.polygon?.vertices.length, 3);

    // 3.3 Creation input validation guards
    // Missing / empty name
    await assert.rejects(
      async () => {
        await geofenceController.createGeofence({ name: '   ', type: 'CIRCLE' }, reqDefault);
      },
      { name: 'BadRequestException', message: /围栏名称不能为空/ }
    );

    // Invalid geofence type
    await assert.rejects(
      async () => {
        await geofenceController.createGeofence({ name: '非法类型', type: 'RECTANGLE' as any }, reqDefault);
      },
      { name: 'BadRequestException', message: /围栏类型必须为 CIRCLE 或 POLYGON/ }
    );

    // Invalid circle params
    await assert.rejects(
      async () => {
        await geofenceController.createGeofence({ name: '无半径圆', type: 'CIRCLE' }, reqDefault);
      },
      { name: 'BadRequestException', message: /圆形围栏必须包含有效的圆心和半径数值/ }
    );

    // Invalid polygon params (< 3 vertices)
    await assert.rejects(
      async () => {
        await geofenceController.createGeofence({
          name: '退化多边形',
          type: 'POLYGON',
          polygon: { vertices: [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }] },
        }, reqDefault);
      },
      { name: 'BadRequestException', message: /多边形围栏至少需要 3 个经纬度顶点/ }
    );

    // 3.4 Read by ID
    const retrieved = await geofenceController.getGeofence(createdCircle.id, reqDefault);
    assert.equal(retrieved.id, createdCircle.id);
    assert.equal(retrieved.name, '深圳前海湾保税区试验围栏');

    // Read non-existent ID throws NotFoundException
    await assert.rejects(
      async () => {
        await geofenceController.getGeofence('gf_non_existent', reqDefault);
      },
      { name: 'NotFoundException' }
    );

    // 3.5 Update geofence (unwrapped & wrapped)
    // Unwrapped update
    const updated1 = await geofenceController.updateGeofence(createdCircle.id, {
      name: '深圳前海湾保税区试验围栏 (已重命名)',
      alarmLevel: 'CRITICAL',
    }, reqDefault);
    assert.equal(updated1.name, '深圳前海湾保税区试验围栏 (已重命名)');
    assert.equal(updated1.alarmLevel, 'CRITICAL');

    // Wrapped update { data: ... }
    const updated2 = await geofenceController.updateGeofence(createdCircle.id, {
      data: {
        description: '已更新测试说明',
        vehicleIds: ['veh_101', 'veh_102', 'veh_103'],
      },
    }, reqDefault);
    assert.equal(updated2.description, '已更新测试说明');
    assert.equal(updated2.boundVehicleCount, 3);

    // Empty name update rejected
    await assert.rejects(
      async () => {
        await geofenceController.updateGeofence(createdCircle.id, { name: '' }, reqDefault);
      },
      { name: 'BadRequestException', message: /围栏名称不能为空/ }
    );

    // Non-existent ID update throws NotFoundException
    await assert.rejects(
      async () => {
        await geofenceController.updateGeofence('gf_non_existent', { name: '新名称' }, reqDefault);
      },
      { name: 'NotFoundException' }
    );

    // 3.6 Status toggle (PATCH /status)
    // Unwrapped payload: ACTIVE -> DISABLED
    const disabled = await geofenceController.updateStatus(createdCircle.id, { status: 'DISABLED' }, reqDefault);
    assert.equal(disabled.status, 'DISABLED');

    // Wrapped payload: DISABLED -> ACTIVE
    const activated = await geofenceController.updateStatus(createdCircle.id, { data: { status: 'ACTIVE' } }, reqDefault);
    assert.equal(activated.status, 'ACTIVE');

    // Invalid status value rejected
    await assert.rejects(
      async () => {
        await geofenceController.updateStatus(createdCircle.id, { status: 'ARCHIVED' as any }, reqDefault);
      },
      { name: 'BadRequestException', message: /无效的电子围栏状态值/ }
    );

    // Non-existent ID status toggle throws NotFoundException
    await assert.rejects(
      async () => {
        await geofenceController.updateStatus('gf_non_existent', { status: 'ACTIVE' }, reqDefault);
      },
      { name: 'NotFoundException' }
    );

    // 3.7 Delete geofence
    const delResult = await geofenceController.deleteGeofence(createdCircle.id, reqDefault);
    assert.equal(delResult.success, true);
    assert.equal(delResult.message, '电子围栏删除成功');

    // Deletion verified: subsequent query throws NotFoundException
    await assert.rejects(
      async () => {
        await geofenceController.getGeofence(createdCircle.id, reqDefault);
      },
      { name: 'NotFoundException' }
    );

    // Second deletion throws NotFoundException
    await assert.rejects(
      async () => {
        await geofenceController.deleteGeofence(createdCircle.id, reqDefault);
      },
      { name: 'NotFoundException' }
    );

    // Clean up createdPoly
    await geofenceController.deleteGeofence(createdPoly.id, reqDefault);
  });

  // ==========================================
  // Section 4: Multi-Tenant Security Isolation
  // ==========================================
  await t.test('4. Multi-tenant security isolation boundary', async () => {
    // 4.1 Under TENANT_DEFAULT context
    const listDefault = await geofenceController.listGeofences({}, reqDefault);
    const hasDefaultSeed = listDefault.some((g) => g.id === 'gf_sh_01');
    const hasTenantBSeed = listDefault.some((g) => g.id === 'gf_gz_01');
    assert.equal(hasDefaultSeed, true, 'TENANT_DEFAULT must see its own geofence');
    assert.equal(hasTenantBSeed, false, 'TENANT_DEFAULT must NOT see TENANT_B geofence');

    // 4.2 Under TENANT_B context
    const listB = await geofenceController.listGeofences({}, reqTenantB);
    const bHasTenantBSeed = listB.some((g) => g.id === 'gf_gz_01');
    const bHasDefaultSeed = listB.some((g) => g.id === 'gf_sh_01');
    assert.equal(bHasTenantBSeed, true, 'TENANT_B must see its own geofence');
    assert.equal(bHasDefaultSeed, false, 'TENANT_B must NOT see TENANT_DEFAULT geofence');

    // 4.3 Cross-tenant direct read blocked
    await assert.rejects(
      async () => {
        await geofenceController.getGeofence('gf_gz_01', reqDefault);
      },
      { name: 'NotFoundException' },
      'TENANT_DEFAULT reading TENANT_B geofence must throw NotFoundException'
    );

    await assert.rejects(
      async () => {
        await geofenceController.getGeofence('gf_sh_01', reqTenantB);
      },
      { name: 'NotFoundException' },
      'TENANT_B reading TENANT_DEFAULT geofence must throw NotFoundException'
    );

    // 4.4 Cross-tenant update blocked
    await assert.rejects(
      async () => {
        await geofenceController.updateGeofence('gf_gz_01', { name: '非法篡改' }, reqDefault);
      },
      { name: 'NotFoundException' }
    );

    // 4.5 Cross-tenant status toggle blocked
    await assert.rejects(
      async () => {
        await geofenceController.updateStatus('gf_gz_01', { status: 'DISABLED' }, reqDefault);
      },
      { name: 'NotFoundException' }
    );

    // 4.6 Cross-tenant delete blocked
    await assert.rejects(
      async () => {
        await geofenceController.deleteGeofence('gf_gz_01', reqDefault);
      },
      { name: 'NotFoundException' }
    );

    // 4.7 Creation under TenantContext.run
    await TenantContext.run(sessionTenantB, async () => {
      const createdInB = await geofenceController.createGeofence({
        name: '广州天河体育中心测控围栏',
        type: 'CIRCLE',
        circle: {
          center: { lat: 23.14, lng: 113.32 },
          radiusMeters: 1000,
        },
      });
      assert.equal(createdInB.tenantId, 'TENANT_B');

      // Verify it is visible in TENANT_B
      const foundInB = await geofenceController.getGeofence(createdInB.id);
      assert.equal(foundInB.id, createdInB.id);

      // Clean up
      await geofenceController.deleteGeofence(createdInB.id);
    });
  });

  // ==========================================
  // Section 5: RBAC Permissions Metadata & PermissionsGuard Enforcement
  // ==========================================
  await t.test('5. RBAC permissions metadata check & PermissionsGuard enforcement', async () => {
    // 5.1 Endpoint metadata verification
    const listPerms = reflector.get(PERMISSIONS_KEY, geofenceController.listGeofences);
    assert.deepEqual(listPerms, [Permission.DEVICE_READ]);

    const getPerms = reflector.get(PERMISSIONS_KEY, geofenceController.getGeofence);
    assert.deepEqual(getPerms, [Permission.DEVICE_READ]);

    const createPerms = reflector.get(PERMISSIONS_KEY, geofenceController.createGeofence);
    assert.deepEqual(createPerms, [Permission.DEVICE_WRITE]);

    const updatePerms = reflector.get(PERMISSIONS_KEY, geofenceController.updateGeofence);
    assert.deepEqual(updatePerms, [Permission.DEVICE_WRITE]);

    const statusPerms = reflector.get(PERMISSIONS_KEY, geofenceController.updateStatus);
    assert.deepEqual(statusPerms, [Permission.DEVICE_WRITE]);

    const delPerms = reflector.get(PERMISSIONS_KEY, geofenceController.deleteGeofence);
    assert.deepEqual(delPerms, [Permission.DEVICE_WRITE]);

    // 5.2 PermissionsGuard runtime activation tests
    const guard = new PermissionsGuard(reflector);

    const makeContext = (user: any, handler: any, controllerClass: any) =>
      ({
        getHandler: () => handler,
        getClass: () => controllerClass,
        switchToHttp: () => ({
          getRequest: () => ({ user }),
        }),
      } as unknown as ExecutionContext);

    const readOnlyUser = {
      sub: 'usr_reader',
      tenantId: 'TENANT_DEFAULT',
      permissions: [Permission.DEVICE_READ],
    };

    const writeOnlyUser = {
      sub: 'usr_writer',
      tenantId: 'TENANT_DEFAULT',
      permissions: [Permission.DEVICE_WRITE],
    };

    // Read only user can access GET endpoints
    const canRead = guard.canActivate(
      makeContext(readOnlyUser, geofenceController.listGeofences, GeofenceController)
    );
    assert.equal(canRead, true);

    // Read only user is rejected on POST/PUT/PATCH/DELETE endpoints
    assert.throws(
      () => {
        guard.canActivate(
          makeContext(readOnlyUser, geofenceController.createGeofence, GeofenceController)
        );
      },
      { name: 'ForbiddenException' }
    );

    assert.throws(
      () => {
        guard.canActivate(
          makeContext(readOnlyUser, geofenceController.deleteGeofence, GeofenceController)
        );
      },
      { name: 'ForbiddenException' }
    );

    // Write user can access POST/PUT/PATCH/DELETE
    const canWrite = guard.canActivate(
      makeContext(writeOnlyUser, geofenceController.createGeofence, GeofenceController)
    );
    assert.equal(canWrite, true);
  });
});
