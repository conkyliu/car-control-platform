import test from 'node:test';
import assert from 'node:assert/strict';
import { Reflector } from '@nestjs/core';
import {
  CommunicationLogRepository,
  FirmwareRepository,
  TenantContext,
} from '@car-control/database';
import {
  CommunicationDirection,
  CommunicationChannel,
  Permission,
} from '@car-control/contracts';
import { OtaController } from '../ota/ota.controller.js';
import { FirmwareService } from '../ota/firmware.service.js';
import { CommunicationLogController } from '../log/communication-log.controller.js';
import { CommunicationLogService } from '../log/communication-log.service.js';
import { AuthController } from '../auth/auth.controller.js';
import { AuthService } from '../auth/auth.service.js';
import { AuditService } from '../audit/audit.service.js';
import { UserService } from '../user/user.service.js';
import { TenantService } from '../tenant/tenant.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

test('Path Aliases and Normalization Acceptance Suite', async (t) => {
  const reflector = new Reflector();

  // 1. Firmware Path Aliases
  await t.test('1. OtaController firmware endpoints support singular and plural aliases', async () => {
    const otaRepo = new FirmwareRepository();
    const auditService = new AuditService();
    const firmwareService = new FirmwareService(otaRepo, auditService);
    const mockPlanService: any = {};
    const otaController = new OtaController(firmwareService, mockPlanService);

    // Metadata checks
    const postPaths = Reflect.getMetadata('path', otaController.createFirmware);
    assert.deepEqual(postPaths, ['firmware', 'firmwares'], 'createFirmware must support firmware and firmwares');

    const listPaths = Reflect.getMetadata('path', otaController.listFirmware);
    assert.deepEqual(listPaths, ['firmware', 'firmwares'], 'listFirmware must support firmware and firmwares');

    const getByIdPaths = Reflect.getMetadata('path', otaController.getFirmwareById);
    assert.deepEqual(getByIdPaths, ['firmware/:id', 'firmwares/:id'], 'getFirmwareById must support firmware/:id and firmwares/:id');

    // RBAC permissions check
    assert.deepEqual(reflector.get('permissions', otaController.createFirmware), [Permission.DEVICE_WRITE]);
    assert.deepEqual(reflector.get('permissions', otaController.listFirmware), [Permission.DEVICE_READ]);
    assert.deepEqual(reflector.get('permissions', otaController.getFirmwareById), [Permission.DEVICE_READ]);

    // Functional invocation check
    const tenantSession = { tenantId: 'TENANT_ALIAS_TEST', userId: 'user_ota_01', roles: ['ADMIN'] };
    const req = { user: tenantSession };

    const created = await otaController.createFirmware(
      {
        name: 'OTA v2.1.0',
        version: 'v2.1.0-alias',
        targetModelId: 'model-x',
        hardwareVersion: 'HW-V1',
        fileUrl: 'https://cdn.example.com/fw/v2.1.0-alias.bin',
        fileSizeBytes: 2048,
        checksumSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        description: 'Alias test',
      },
      req
    );
    assert.equal(created.version, 'v2.1.0-alias');

    const list = await otaController.listFirmware(undefined, undefined, req);
    assert.ok(list.some((item) => item.id === created.id));

    const found = await otaController.getFirmwareById(created.id, req);
    assert.equal(found.id, created.id);
  });

  // 2. Communication Log Path Aliases and :id lookup
  await t.test('2. CommunicationLogController supports /logs/comm alias and :id detail lookup', async () => {
    const commLogRepo = new CommunicationLogRepository();
    const mockVehicleRepo: any = {
      findByDeviceId: async () => null,
      findById: async () => null,
    };
    const mockMessagingPort: any = {
      sendDownlink: async () => true,
      onAck: () => {},
      onLocation: () => {},
      onAlarm: () => {},
    };

    const commLogService = new CommunicationLogService(commLogRepo, mockVehicleRepo, mockMessagingPort);
    const commLogController = new CommunicationLogController(commLogService);

    // Controller path check
    const controllerPaths = Reflect.getMetadata('path', CommunicationLogController);
    assert.deepEqual(
      controllerPaths,
      ['api/v1/logs/communication', 'api/v1/logs/comm'],
      'CommunicationLogController must support /logs/communication and /logs/comm'
    );

    // Endpoint methods & RBAC metadata checks
    const queryPaths = Reflect.getMetadata('path', commLogController.queryLogs);
    assert.equal(queryPaths, '/', 'queryLogs route path should be root or empty');

    const getByIdPaths = Reflect.getMetadata('path', commLogController.getLogById);
    assert.equal(getByIdPaths, ':id', 'getLogById route path should be :id');

    assert.deepEqual(reflector.get('permissions', commLogController.queryLogs), [Permission.DEVICE_READ]);
    assert.deepEqual(reflector.get('permissions', commLogController.getLogById), [Permission.DEVICE_READ]);

    // Service & Controller getLogById functional check
    const tenantSession = { tenantId: 'TENANT_COMM_TEST', userId: 'user_comm_01', roles: ['OPERATOR'] };
    const req = { user: tenantSession };

    // Create log via repository in tenant session
    const logEntry = await TenantContext.run(tenantSession, async () => {
      return commLogRepo.log({
        vehicleId: 'veh_comm_01',
        deviceNo: 'DEV_COMM_01',
        direction: CommunicationDirection.DOWNLINK,
        channel: CommunicationChannel.MQTT,
        topic: 'car/test/topic',
        payload: { command: 'UNLOCK' },
      });
    });

    // Verify service method getLogById
    const serviceFound = await TenantContext.run(tenantSession, async () => {
      return commLogService.getLogById(logEntry.id);
    });
    assert.ok(serviceFound);
    assert.equal(serviceFound?.id, logEntry.id);

    // Verify cross-tenant isolation on getLogById
    const crossTenantSession = { tenantId: 'TENANT_OTHER', userId: 'user_other_01' };
    const crossFound = await TenantContext.run(crossTenantSession, async () => {
      return commLogService.getLogById(logEntry.id);
    });
    assert.equal(crossFound, null, 'Cross tenant cannot find log by id');

    // Verify controller method getLogById
    const controllerFound = await commLogController.getLogById(logEntry.id, req);
    assert.equal(controllerFound.id, logEntry.id);

    // Verify not found throws NotFoundException
    await assert.rejects(
      async () => {
        await commLogController.getLogById('non-existent-id', req);
      },
      {
        name: 'NotFoundException',
      }
    );
  });

  // 3. Audit Logs Path Aliases
  await t.test('3. AuthController supports /audit-logs and /admin/audit-logs aliases', async () => {
    const userService = new UserService();
    const tenantService = new TenantService();
    const auditService = new AuditService();
    const authService = new AuthService(userService, tenantService, auditService);
    const authController = new AuthController(authService, auditService);

    // Route paths check
    const auditLogPaths = Reflect.getMetadata('path', authController.getAuditLogs);
    assert.deepEqual(
      auditLogPaths,
      ['audit-logs', 'admin/audit-logs'],
      'getAuditLogs must support audit-logs and admin/audit-logs'
    );

    // RBAC check
    assert.deepEqual(reflector.get('permissions', authController.getAuditLogs), [Permission.AUDIT_READ]);

    // Functional check
    auditService.logAction({
      tenantId: 'TENANT_AUDIT_TEST',
      userId: 'user_01',
      action: 'TEST_ACTION',
      resourceType: 'TEST',
      resourceId: 'res_01',
    });

    const logs = await authController.getAuditLogs({
      user: { tenantId: 'TENANT_AUDIT_TEST', sub: 'user_01' },
    });
    assert.ok(Array.isArray(logs));
    assert.ok(logs.some((l) => l.action === 'TEST_ACTION'));
  });

  // 4. Auth Logout Endpoint
  await t.test('4. AuthController provides POST /auth/logout with JwtAuthGuard returning { success: true }', async () => {
    const userService = new UserService();
    const tenantService = new TenantService();
    const auditService = new AuditService();
    const authService = new AuthService(userService, tenantService, auditService);
    const authController = new AuthController(authService, auditService);

    // Route metadata check
    assert.equal(typeof authController.logout, 'function', 'authController.logout must be defined');
    const logoutPath = Reflect.getMetadata('path', authController.logout);
    assert.equal(logoutPath, 'auth/logout', 'logout endpoint path must be auth/logout');

    const logoutMethod = Reflect.getMetadata('method', authController.logout);
    // NestJS RequestMethod.POST is 1
    assert.equal(logoutMethod, 1, 'logout endpoint must be POST');

    // Guards check
    const guards = Reflect.getMetadata('__guards__', authController.logout);
    assert.ok(guards, 'logout should have guards');
    assert.ok(guards.includes(JwtAuthGuard), 'logout should have JwtAuthGuard');

    // Functional invocation check
    const res = await authController.logout({ user: { tenantId: 'T1', sub: 'u1' } });
    assert.deepEqual(res, { success: true });
  });
});
