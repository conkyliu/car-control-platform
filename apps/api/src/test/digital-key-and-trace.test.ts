import test from 'node:test';
import assert from 'node:assert/strict';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  CommandCode,
  SecurityLevel,
  CommandStatus,
  Permission,
  RoleCode,
  DigitalKeyDto,
  CreateDigitalKeyInput,
  DigitalKeyQueryParams,
  CommandDictionaryItem,
} from '@car-control/contracts';
import { TenantContext } from '@car-control/database';
import { DigitalKeyService } from '../command/digital-key.service.js';
import { DigitalKeyController } from '../command/digital-key.controller.js';
import { CommandDictionaryController } from '../command/command-dictionary.controller.js';
import { CommandService } from '../command/command.service.js';
import { CommandController } from '../command/command.controller.js';
import { TracerService } from '../observability/tracing/tracer.service.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { PERMISSIONS_KEY } from '../auth/decorators/permissions.decorator.js';

test('Digital Key, Command Dictionary & Command Trace Acceptance Suite', async (t) => {
  const digitalKeyService = new DigitalKeyService();
  const digitalKeyController = new DigitalKeyController(digitalKeyService);
  const commandDictionaryController = new CommandDictionaryController();
  const tracerService = new TracerService();

  // Mock messaging and dependencies for CommandService
  const mockMessagingPort: any = {
    publishCommand: async () => {},
    onAck: () => {},
    onHeartbeat: () => {},
    onStatus: () => {},
  };
  const mockDeviceStatusService: any = {
    recordHeartbeat: () => {},
    setOnlineStatus: () => {},
    isOnline: () => true,
  };
  const mockWsGateway: any = {
    emitToVehicle: () => {},
  };

  const commandService = new CommandService(
    mockMessagingPort,
    mockDeviceStatusService,
    mockWsGateway,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    tracerService
  );

  const commandController = new CommandController(commandService, tracerService);
  const reflector = new Reflector();

  const userDefault = {
    sub: 'usr_admin_01',
    tenantId: 'tenant-demo',
    roles: [RoleCode.SUPER_ADMIN],
    permissions: [Permission.VEHICLE_READ, Permission.VEHICLE_WRITE, Permission.VEHICLE_CONTROL],
  };

  const userTenantB = {
    sub: 'usr_tenant_b',
    tenantId: 'tenant-beta',
    roles: [RoleCode.TENANT_ADMIN],
    permissions: [Permission.VEHICLE_READ, Permission.VEHICLE_WRITE, Permission.VEHICLE_CONTROL],
  };

  const reqDefault = { user: userDefault };
  const reqTenantB = { user: userTenantB };

  // ==========================================
  // Section 1: Digital Key Service & Controller Lifecycle
  // ==========================================
  await t.test('1. Digital Key seed data, listing, filtering, and detail retrieval', async () => {
    // 1.1 List initial keys
    const keys = await digitalKeyService.listKeys(undefined, 'tenant-demo');
    assert.ok(Array.isArray(keys), 'Keys must be an array');
    assert.ok(keys.length >= 5, `Expected at least 5 seed keys, got ${keys.length}`);

    const key1 = keys.find((k) => k.keyNumber === 'KEY-202610-001');
    assert.ok(key1, 'Seed key KEY-202610-001 must exist');
    assert.equal(key1.vehicleId, 'veh-001');
    assert.equal(key1.status, 'ACTIVE');
    assert.equal(key1.keyType, 'BLE');
    assert.ok(key1.permissions.includes(CommandCode.CMD_LOCK));
    assert.ok(key1.permissions.includes(CommandCode.CMD_UNLOCK));

    // 1.2 Detail query via controller
    const fetchedDetail = await digitalKeyController.getKeyById(key1.id, reqDefault);
    assert.equal(fetchedDetail.id, key1.id);
    assert.equal(fetchedDetail.recipientName, key1.recipientName);

    // 1.3 Detail query for non-existent key throws NotFoundException
    await assert.rejects(
      async () => digitalKeyController.getKeyById('non-existent-key-id', reqDefault),
      NotFoundException
    );

    // 1.4 Filtering by keyword (license plate / recipient)
    const filteredByKeyword = await digitalKeyController.listKeys(
      { keyword: '李思源' },
      reqDefault
    );
    assert.ok(filteredByKeyword.length >= 1);
    assert.ok(filteredByKeyword.every((k: DigitalKeyDto) => k.recipientName.includes('李思源') || k.plateNumber.includes('李思源')));

    // 1.5 Filtering by keyType
    const filteredByBle = await digitalKeyController.listKeys(
      { keyType: 'BLE' },
      reqDefault
    );
    assert.ok(filteredByBle.length >= 1);
    assert.ok(filteredByBle.every((k: DigitalKeyDto) => k.keyType === 'BLE'));

    // 1.6 Filtering by status
    const filteredByActive = await digitalKeyController.listKeys(
      { status: 'ACTIVE' },
      reqDefault
    );
    assert.ok(filteredByActive.length >= 1);
    assert.ok(filteredByActive.every((k: DigitalKeyDto) => k.status === 'ACTIVE'));

    // 1.7 Filtering by vehicleId
    const vehicleKeys = await digitalKeyController.getKeysByVehicle('veh-001', reqDefault);
    assert.ok(vehicleKeys.length >= 1);
    assert.ok(vehicleKeys.every((k: DigitalKeyDto) => k.vehicleId === 'veh-001'));
  });

  await t.test('2. Digital Key creation and input validation', async () => {
    const newKeyInput: CreateDigitalKeyInput = {
      vehicleId: 'veh-001',
      recipientName: '张伟',
      recipientPhone: '13812345678',
      keyType: 'BLE',
      startTime: '2026-10-15 00:00:00',
      endTime: '2026-11-15 23:59:59',
      maxUsageCount: 5,
      permissions: [CommandCode.CMD_LOCK, CommandCode.CMD_UNLOCK, CommandCode.CMD_AC_START],
    };

    // 2.1 Create key via controller
    const createdKey = await digitalKeyController.createKey(newKeyInput, reqDefault);
    assert.ok(createdKey.id, 'Key must have an id');
    assert.ok(createdKey.keyNumber.startsWith('KEY-'), `Key number must follow format: ${createdKey.keyNumber}`);
    assert.equal(createdKey.recipientName, '张伟');
    assert.equal(createdKey.status, 'ACTIVE');
    assert.equal(createdKey.usedCount, 0);
    assert.equal(createdKey.maxUsageCount, 5);
    assert.equal(createdKey.tenantId, 'tenant-demo');

    // 2.2 Verify it appears in vehicle keys list
    const vehKeys = await digitalKeyController.getKeysByVehicle('veh-001', reqDefault);
    assert.ok(vehKeys.some((k: DigitalKeyDto) => k.id === createdKey.id));

    // 2.3 Creation validation: missing vehicleId
    await assert.rejects(
      async () =>
        digitalKeyController.createKey(
          { ...newKeyInput, vehicleId: '' },
          reqDefault
        ),
      BadRequestException
    );

    // 2.4 Creation validation: missing recipient phone
    await assert.rejects(
      async () =>
        digitalKeyController.createKey(
          { ...newKeyInput, recipientPhone: '' },
          reqDefault
        ),
      BadRequestException
    );

    // 2.5 Creation validation: invalid time range (endTime <= startTime)
    await assert.rejects(
      async () =>
        digitalKeyController.createKey(
          { ...newKeyInput, startTime: '2026-11-15 00:00:00', endTime: '2026-10-15 00:00:00' },
          reqDefault
        ),
      BadRequestException
    );

    // 2.6 Creation validation: empty permissions
    await assert.rejects(
      async () =>
        digitalKeyController.createKey(
          { ...newKeyInput, permissions: [] },
          reqDefault
        ),
      BadRequestException
    );
  });

  await t.test('3. Digital Key revocation and state transition constraints', async () => {
    // 3.1 Create an active key
    const key = await digitalKeyService.createKey(
      {
        vehicleId: 'veh-002',
        recipientName: '测试作废用户',
        recipientPhone: '13988887777',
        keyType: 'CLOUD',
        startTime: '2026-10-15 00:00:00',
        endTime: '2026-12-15 23:59:59',
        permissions: [CommandCode.CMD_UNLOCK],
      },
      'tenant-demo'
    );
    assert.equal(key.status, 'ACTIVE');

    // 3.2 Revoke key via controller
    const revoked = await digitalKeyController.revokeKey(
      key.id,
      { reason: '用户手机丢失，紧急挂失' },
      reqDefault
    );
    assert.equal(revoked.id, key.id);
    assert.equal(revoked.status, 'REVOKED');
    assert.ok(revoked.revokedAt, 'revokedAt must be set');
    assert.equal(revoked.revokedReason, '用户手机丢失，紧急挂失');

    // 3.3 Re-revoking already revoked key must throw BadRequestException (terminal status protection)
    await assert.rejects(
      async () =>
        digitalKeyController.revokeKey(
          key.id,
          { reason: '重复作废' },
          reqDefault
        ),
      BadRequestException
    );

    // 3.4 Revoking expired key must throw BadRequestException
    const expiredKeys = await digitalKeyService.listKeys({ status: 'EXPIRED' }, 'tenant-demo');
    if (expiredKeys.length > 0) {
      await assert.rejects(
        async () =>
          digitalKeyController.revokeKey(
            expiredKeys[0].id,
            { reason: '作废过期钥匙' },
            reqDefault
          ),
        BadRequestException
      );
    }
  });

  await t.test('4. Digital Key multi-tenant security isolation', async () => {
    // 4.1 Tenant B lists keys and should not see Tenant Default keys
    const tenantBKeys = await digitalKeyController.listKeys(undefined, reqTenantB);
    assert.ok(
      tenantBKeys.every((k: DigitalKeyDto) => k.tenantId === 'tenant-beta'),
      'Tenant B must only see tenant-beta keys'
    );

    // 4.2 Tenant B trying to access Tenant Default key by ID throws NotFoundException
    const defaultKeys = await digitalKeyService.listKeys(undefined, 'tenant-demo');
    const defaultKeyId = defaultKeys[0].id;

    await assert.rejects(
      async () => digitalKeyController.getKeyById(defaultKeyId, reqTenantB),
      NotFoundException
    );

    // 4.3 Tenant B trying to revoke Tenant Default key throws NotFoundException
    await assert.rejects(
      async () => digitalKeyController.revokeKey(defaultKeyId, { reason: '越权吊销' }, reqTenantB),
      NotFoundException
    );
  });

  // ==========================================
  // Section 2: Command Dictionary Endpoints
  // ==========================================
  await t.test('5. Command Dictionary list, detail, and metadata patch', async () => {
    // 5.1 GET /api/v1/command-dictionary returns all 13 standard commands
    const dictionary = await commandDictionaryController.getDictionary();
    assert.ok(Array.isArray(dictionary), 'Dictionary must be an array');
    assert.equal(dictionary.length, 13, `Expected 13 commands in dictionary, got ${dictionary.length}`);

    // Verify key attributes on CMD_LOCK
    const lockItem = dictionary.find((item) => item.code === CommandCode.CMD_LOCK);
    assert.ok(lockItem, 'CMD_LOCK must be present in dictionary');
    assert.equal(lockItem.name, '车辆上锁');
    assert.equal(lockItem.downlinkOpcode, '0x02_01');
    assert.equal(lockItem.canSignalName, 'CAN_BCM_DoorLockCmd');
    assert.equal(lockItem.defaultSecurityLevel, SecurityLevel.L0);

    // 5.2 GET /api/v1/command-dictionary/:code
    const engineStart = await commandDictionaryController.getItem(CommandCode.CMD_ENGINE_START);
    assert.equal(engineStart.code, CommandCode.CMD_ENGINE_START);
    assert.equal(engineStart.defaultSecurityLevel, SecurityLevel.L2);
    assert.ok(engineStart.payloadSchema.durationMinutes, 'durationMinutes schema must be defined');

    // 5.3 Querying non-existent command code throws NotFoundException
    await assert.rejects(
      async () => commandDictionaryController.getItem('NON_EXISTENT_CODE' as any),
      NotFoundException
    );

    // 5.4 PATCH /api/v1/command-dictionary/:code updates metadata
    const updated = await commandDictionaryController.patchItem(CommandCode.CMD_LOCK, {
      defaultTimeoutMs: 12000,
      defaultFrequencyLimitSeconds: 8,
      safetyWarning: '操作中控锁前请确认车内无人',
    });
    assert.equal(updated.code, CommandCode.CMD_LOCK);
    assert.equal(updated.defaultTimeoutMs, 12000);
    assert.equal(updated.defaultFrequencyLimitSeconds, 8);
    assert.equal(updated.safetyWarning, '操作中控锁前请确认车内无人');

    // Verify persistence in subsequent fetch
    const reFetched = await commandDictionaryController.getItem(CommandCode.CMD_LOCK);
    assert.equal(reFetched.defaultTimeoutMs, 12000);
    assert.equal(reFetched.defaultFrequencyLimitSeconds, 8);
  });

  // ==========================================
  // Section 3: Vehicle Commands & Command Trace
  // ==========================================
  await t.test('6. Vehicle Commands retrieval and OpenTelemetry Trace endpoint', async () => {
    // 6.1 Execute a command via CommandService to generate history and trace
    const cmdRecord = await commandService.executeCommand({
      tenantId: 'tenant-demo',
      vehicleId: 'veh-trace-01',
      commandCode: CommandCode.CMD_LOCK,
      idempotencyKey: `idemp-trace-${Date.now()}`,
      operatorId: 'usr_admin_01',
    });

    assert.ok(cmdRecord.id);
    assert.ok(cmdRecord.traceId);

    // 6.2 Simulate device ACK to complete trace
    await commandService.handleAck({
      traceId: cmdRecord.traceId,
      requestId: cmdRecord.requestId,
      commandId: cmdRecord.id,
      commandCode: CommandCode.CMD_LOCK,
      timestamp: Date.now(),
      code: 0,
      message: 'Vehicle locked successfully',
    });

    // 6.3 Query vehicle commands via CommandController
    const vehCommands = await commandController.getVehicleCommands('veh-trace-01', reqDefault);
    assert.ok(Array.isArray(vehCommands), 'Vehicle commands must be array');
    assert.ok(vehCommands.length >= 1, 'Should find at least 1 command for veh-trace-01');
    assert.equal(vehCommands[0].id, cmdRecord.id);
    assert.equal(vehCommands[0].status, CommandStatus.SUCCESS);

    // 6.4 Query trace via CommandController: GET /commands/:commandId/trace
    const trace = await commandController.getCommandTrace(cmdRecord.id, reqDefault);
    assert.ok(trace, 'Trace must be returned');
    assert.equal(trace.commandId, cmdRecord.id);
    assert.equal(trace.status, 'SUCCESS');
    assert.ok(trace.spans.length >= 2, `Expected at least 2 spans, got ${trace.spans.length}`);

    // 6.5 Querying trace with non-existent commandId throws NotFoundException
    await assert.rejects(
      async () => commandController.getCommandTrace('non-existent-cmd-id', reqDefault),
      NotFoundException
    );

    // 6.6 Multi-tenant isolation: Tenant B cannot query Tenant A's trace
    await assert.rejects(
      async () => commandController.getCommandTrace(cmdRecord.id, reqTenantB),
      NotFoundException
    );

    // 6.7 Multi-tenant isolation: Tenant B queries vehicle commands for Tenant A vehicle returns empty
    const vehCommandsB = await commandController.getVehicleCommands('veh-trace-01', reqTenantB);
    assert.equal(vehCommandsB.length, 0, 'Tenant B must not see Tenant A vehicle commands');
  });

  // ==========================================
  // Section 4: RBAC Permissions Metadata & Guard Enforcement
  // ==========================================
  await t.test('7. RBAC permissions metadata on DigitalKeyController and CommandDictionaryController', async () => {
    // 7.1 DigitalKeyController permissions
    const listKeysPerm = reflector.get<Permission[]>(PERMISSIONS_KEY, DigitalKeyController.prototype.listKeys);
    assert.deepEqual(listKeysPerm, [Permission.VEHICLE_READ]);

    const getKeyPerm = reflector.get<Permission[]>(PERMISSIONS_KEY, DigitalKeyController.prototype.getKeyById);
    assert.deepEqual(getKeyPerm, [Permission.VEHICLE_READ]);

    const createKeyPerm = reflector.get<Permission[]>(PERMISSIONS_KEY, DigitalKeyController.prototype.createKey);
    assert.deepEqual(createKeyPerm, [Permission.VEHICLE_WRITE]);

    const revokeKeyPerm = reflector.get<Permission[]>(PERMISSIONS_KEY, DigitalKeyController.prototype.revokeKey);
    assert.deepEqual(revokeKeyPerm, [Permission.VEHICLE_WRITE]);

    const getVehKeysPerm = reflector.get<Permission[]>(PERMISSIONS_KEY, DigitalKeyController.prototype.getKeysByVehicle);
    assert.deepEqual(getVehKeysPerm, [Permission.VEHICLE_READ]);

    // 7.2 CommandDictionaryController permissions
    const getDictPerm = reflector.get<Permission[]>(PERMISSIONS_KEY, CommandDictionaryController.prototype.getDictionary);
    assert.deepEqual(getDictPerm, [Permission.VEHICLE_READ]);

    const getItemPerm = reflector.get<Permission[]>(PERMISSIONS_KEY, CommandDictionaryController.prototype.getItem);
    assert.deepEqual(getItemPerm, [Permission.VEHICLE_READ]);

    const patchItemPerm = reflector.get<Permission[]>(PERMISSIONS_KEY, CommandDictionaryController.prototype.patchItem);
    assert.deepEqual(patchItemPerm, [Permission.VEHICLE_WRITE]);

    // 7.3 CommandController trace & vehicle commands permissions
    const getTracePerm = reflector.get<Permission[]>(PERMISSIONS_KEY, CommandController.prototype.getCommandTrace);
    assert.deepEqual(getTracePerm, [Permission.VEHICLE_READ]);

    const getVehCmdsPerm = reflector.get<Permission[]>(PERMISSIONS_KEY, CommandController.prototype.getVehicleCommands);
    assert.deepEqual(getVehCmdsPerm, [Permission.VEHICLE_READ]);

    // 7.4 PermissionsGuard enforcement check
    const guard = new PermissionsGuard(reflector);

    const makeContext = (handler: Function, permissions: Permission[]): ExecutionContext => {
      return {
        getHandler: () => handler,
        getClass: () => DigitalKeyController,
        switchToHttp: () => ({
          getRequest: () => ({
            user: { permissions },
          }),
        }),
      } as unknown as ExecutionContext;
    };

    // User with VEHICLE_READ accessing listKeys -> allowed
    const readCtx = makeContext(DigitalKeyController.prototype.listKeys, [Permission.VEHICLE_READ]);
    assert.equal(guard.canActivate(readCtx), true);

    // User without VEHICLE_WRITE accessing createKey -> throws ForbiddenException
    const noWriteCtx = makeContext(DigitalKeyController.prototype.createKey, [Permission.VEHICLE_READ]);
    assert.throws(() => guard.canActivate(noWriteCtx), ForbiddenException);
  });
});
