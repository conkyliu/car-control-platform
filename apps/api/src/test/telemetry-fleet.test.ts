import test from 'node:test';
import assert from 'node:assert/strict';
import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import {
  Permission,
  RoleCode,
  VehicleLocationDto,
  ClusterNodeHealth,
  SystemMetricsSnapshotDto,
} from '@car-control/contracts';
import {
  TenantContext,
  VehicleRepository,
  DeviceRepository,
  LocationRepository,
  AlarmRepository,
} from '@car-control/database';
import { DeviceOnlineStatus } from '@car-control/domain-types';
import { TelemetryService } from '../telemetry/telemetry.service.js';
import { TelemetryController } from '../telemetry/telemetry.controller.js';
import { GeofenceService } from '../telemetry/geofence.service.js';
import { DeviceStatusService } from '../device/device-status.service.js';
import { WebSocketGatewayService } from '../realtime/websocket.gateway.js';
import { InMemoryMessagingAdapter } from '../messaging/in-memory-messaging.adapter.js';
import { MetricsService } from '../observability/metrics/metrics.service.js';
import { MetricsController } from '../observability/metrics/metrics.controller.js';
import { PERMISSIONS_KEY } from '../auth/decorators/permissions.decorator.js';

test('Telemetry Fleet & Cluster Metrics Extension Acceptance Suite', async (t) => {
  const reflector = new Reflector();

  // ========================================================
  // Section 1: TelemetryService & TelemetryController Fleet Locations
  // ========================================================
  await t.test('1. TelemetryService: default seed locations for TENANT_DEFAULT', async () => {
    const locationRepo = new LocationRepository();
    const vehicleRepo = new VehicleRepository();
    const deviceRepo = new DeviceRepository();
    const wsGateway = new WebSocketGatewayService();
    const geofenceService = new GeofenceService();
    const messagingPort = new InMemoryMessagingAdapter();
    const deviceStatusService = new DeviceStatusService();

    const telemetryService = new TelemetryService(
      locationRepo,
      vehicleRepo,
      wsGateway,
      geofenceService,
      messagingPort,
      deviceStatusService,
      deviceRepo
    );

    const locations = await telemetryService.getFleetLocations(undefined, 'TENANT_DEFAULT');
    assert.ok(Array.isArray(locations));
    assert.equal(locations.length, 8);

    const veh1 = locations.find((v) => v.vehicleId === 'veh-001');
    assert.ok(veh1);
    assert.equal(veh1.plateNumber, '粤B·D12345');
    assert.equal(veh1.brand, '比亚迪');
    assert.equal(veh1.status, 'ONLINE');
    assert.equal(veh1.gpsValid, true);
    assert.ok(veh1.coordinates.lat > 0 && veh1.coordinates.lng > 0);
  });

  await t.test('2. TelemetryService: keyword filtering by plate, vin, deviceNo', async () => {
    const locationRepo = new LocationRepository();
    const vehicleRepo = new VehicleRepository();
    const deviceRepo = new DeviceRepository();
    const wsGateway = new WebSocketGatewayService();
    const geofenceService = new GeofenceService();
    const messagingPort = new InMemoryMessagingAdapter();
    const deviceStatusService = new DeviceStatusService();

    const telemetryService = new TelemetryService(
      locationRepo,
      vehicleRepo,
      wsGateway,
      geofenceService,
      messagingPort,
      deviceStatusService,
      deviceRepo
    );

    // 2.1 Filter by plateNumber
    const resPlate = await telemetryService.getFleetLocations({ keyword: 'DZ8826' }, 'TENANT_DEFAULT');
    assert.equal(resPlate.length, 1);
    assert.equal(resPlate[0].plateNumber, '沪A·DZ8826');

    // 2.2 Filter by VIN suffix
    const resVin = await telemetryService.getFleetLocations({ keyword: '002002' }, 'TENANT_DEFAULT');
    assert.equal(resVin.length, 1);
    assert.equal(resVin[0].vehicleId, 'veh-002');

    // 2.3 Filter by deviceNo
    const resDevice = await telemetryService.getFleetLocations({ keyword: 'DEV_SN_003' }, 'TENANT_DEFAULT');
    assert.equal(resDevice.length, 1);
    assert.equal(resDevice[0].deviceNo, 'DEV_SN_003');
  });

  await t.test('3. TelemetryService: status and low voltage filtering', async () => {
    const locationRepo = new LocationRepository();
    const vehicleRepo = new VehicleRepository();
    const deviceRepo = new DeviceRepository();
    const wsGateway = new WebSocketGatewayService();
    const geofenceService = new GeofenceService();
    const messagingPort = new InMemoryMessagingAdapter();
    const deviceStatusService = new DeviceStatusService();

    const telemetryService = new TelemetryService(
      locationRepo,
      vehicleRepo,
      wsGateway,
      geofenceService,
      messagingPort,
      deviceStatusService,
      deviceRepo
    );

    // 3.1 ONLINE filter
    const onlineList = await telemetryService.getFleetLocations({ status: 'ONLINE' }, 'TENANT_DEFAULT');
    assert.ok(onlineList.length > 0);
    assert.ok(onlineList.every((v) => v.status === 'ONLINE' || (v.status === 'ALARM' && v.gpsValid)));

    // 3.2 MOVING filter (speed > 0)
    const movingList = await telemetryService.getFleetLocations({ status: 'MOVING' }, 'TENANT_DEFAULT');
    assert.ok(movingList.length > 0);
    assert.ok(movingList.every((v) => (v.speed ?? 0) > 0));

    // 3.3 STATIONARY filter (speed <= 0 or OFFLINE)
    const stationaryList = await telemetryService.getFleetLocations({ status: 'STATIONARY' }, 'TENANT_DEFAULT');
    assert.ok(stationaryList.length > 0);
    assert.ok(stationaryList.every((v) => (v.speed ?? 0) <= 0 || v.status === 'OFFLINE'));

    // 3.4 ALARM filter
    const alarmList = await telemetryService.getFleetLocations({ status: 'ALARM' }, 'TENANT_DEFAULT');
    assert.ok(alarmList.length > 0);
    assert.ok(alarmList.every((v) => v.status === 'ALARM' || (v.alarmCount ?? 0) > 0));

    // 3.5 OFFLINE filter
    const offlineList = await telemetryService.getFleetLocations({ status: 'OFFLINE' }, 'TENANT_DEFAULT');
    assert.ok(offlineList.length > 0);
    assert.ok(offlineList.every((v) => v.status === 'OFFLINE'));

    // 3.6 lowVoltageOnly (< 11.5V)
    const lowVoltList = await telemetryService.getFleetLocations({ lowVoltageOnly: true }, 'TENANT_DEFAULT');
    assert.ok(lowVoltList.length > 0);
    assert.ok(lowVoltList.every((v) => (v.voltage ?? 12) < 11.5));
  });

  await t.test('4. TelemetryService: multi-tenant strict isolation with dynamic vehicle repositories', async () => {
    const locationRepo = new LocationRepository();
    const vehicleRepo = new VehicleRepository();
    const deviceRepo = new DeviceRepository();
    const wsGateway = new WebSocketGatewayService();
    const geofenceService = new GeofenceService();
    const messagingPort = new InMemoryMessagingAdapter();
    const deviceStatusService = new DeviceStatusService();

    const telemetryService = new TelemetryService(
      locationRepo,
      vehicleRepo,
      wsGateway,
      geofenceService,
      messagingPort,
      deviceStatusService,
      deviceRepo
    );

    // Register Tenant Alpha vehicles
    await TenantContext.run({ tenantId: 'tenant-alpha', userId: 'usr-a' }, async () => {
      await deviceRepo.create({
        id: 'dev-alpha-01',
        deviceNo: 'DEV-A-01',
        imei: '86000000000001',
        productKey: 'CAR_BOX_4G',
        status: 'ACTIVE',
        onlineStatus: DeviceOnlineStatus.ONLINE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      deviceStatusService.registerDevice({
        deviceNo: 'DEV-A-01',
        productKey: 'CAR_BOX_4G',
        vehicleId: 'veh-alpha-01',
        onlineStatus: DeviceOnlineStatus.ONLINE,
        batteryVoltage: 12.8,
      });

      await vehicleRepo.create({
        id: 'veh-alpha-01',
        projectId: 'proj-alpha',
        vin: 'VIN_ALPHA_0001',
        plateNumber: '粤B·A1111',
        brandId: 'brand-byd',
        modelId: 'model-u8',
        deviceId: 'DEV-A-01',
        status: 'NORMAL',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await locationRepo.saveLocation('veh-alpha-01', {
        lat: 22.54,
        lng: 113.93,
        speed: 52.0,
        heading: 90,
        altitude: 30,
        satellites: 12,
        gpsValid: true,
        timestamp: Date.now(),
        mileage: 12000,
      });
    });

    // Register Tenant Beta vehicles
    await TenantContext.run({ tenantId: 'tenant-beta', userId: 'usr-b' }, async () => {
      await vehicleRepo.create({
        id: 'veh-beta-01',
        projectId: 'proj-beta',
        vin: 'VIN_BETA_0001',
        plateNumber: '沪A·B2222',
        brandId: 'brand-tesla',
        modelId: 'model-y',
        status: 'NORMAL',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    // Query Tenant Alpha
    const alphaLocs = await telemetryService.getFleetLocations(undefined, 'tenant-alpha');
    assert.equal(alphaLocs.length, 1);
    assert.equal(alphaLocs[0].vehicleId, 'veh-alpha-01');
    assert.equal(alphaLocs[0].plateNumber, '粤B·A1111');
    assert.equal(alphaLocs[0].status, 'ONLINE');
    assert.equal(alphaLocs[0].speed, 52.0);

    // Query Tenant Beta
    const betaLocs = await telemetryService.getFleetLocations(undefined, 'tenant-beta');
    assert.equal(betaLocs.length, 1);
    assert.equal(betaLocs[0].vehicleId, 'veh-beta-01');
    assert.equal(betaLocs[0].plateNumber, '沪A·B2222');

    // Tenant Gamma (empty) receives empty array
    const gammaLocs = await telemetryService.getFleetLocations(undefined, 'tenant-gamma');
    assert.equal(gammaLocs.length, 0);
  });

  await t.test('5. TelemetryController: routes, RBAC metadata, and query delegation', async () => {
    const locationRepo = new LocationRepository();
    const vehicleRepo = new VehicleRepository();
    const wsGateway = new WebSocketGatewayService();
    const geofenceService = new GeofenceService();
    const messagingPort = new InMemoryMessagingAdapter();

    const telemetryService = new TelemetryService(
      locationRepo,
      vehicleRepo,
      wsGateway,
      geofenceService,
      messagingPort
    );
    const controller = new TelemetryController(telemetryService);

    // Verify RBAC metadata on locations method
    const permissions = reflector.get<Permission[]>(
      PERMISSIONS_KEY,
      controller.getFleetLocations
    );
    assert.ok(permissions);
    assert.ok(permissions.includes(Permission.VEHICLE_READ));

    // Call controller.getFleetLocations with req
    const mockReq = {
      user: {
        tenantId: 'TENANT_DEFAULT',
        sub: 'usr-admin',
        roles: [RoleCode.SUPER_ADMIN],
      },
    };

    const res = await controller.getFleetLocations('D12345', 'ONLINE', false, mockReq);
    assert.ok(Array.isArray(res));
    assert.equal(res.length, 1);
    assert.equal(res[0].vehicleId, 'veh-001');
  });

  // ========================================================
  // Section 2: MetricsService & MetricsController Cluster and Snapshot
  // ========================================================
  await t.test('6. MetricsService: getClusterNodes returns 8 core microservice and middleware nodes', async () => {
    const metricsService = new MetricsService();
    const nodes = metricsService.getClusterNodes();

    assert.ok(Array.isArray(nodes));
    assert.equal(nodes.length, 8);

    const roles = nodes.map((n) => n.role);
    assert.ok(roles.includes('GATEWAY'));
    assert.ok(roles.includes('CORE_API'));
    assert.ok(roles.includes('TELEMETRY'));
    assert.ok(roles.includes('WORKER'));
    assert.ok(roles.includes('BROKER'));
    assert.ok(roles.includes('DATABASE'));

    for (const node of nodes) {
      assert.ok(node.id);
      assert.ok(node.serviceName);
      assert.ok(node.host);
      assert.ok(node.port > 0);
      assert.ok(['HEALTHY', 'DEGRADED', 'UNHEALTHY'].includes(node.status));
      assert.ok(node.cpuUsagePercent >= 0 && node.cpuUsagePercent <= 100);
      assert.ok(node.memoryUsagePercent >= 0 && node.memoryUsagePercent <= 100);
      assert.ok(node.memoryUsedMb > 0);
      assert.ok(node.memoryTotalMb >= node.memoryUsedMb);
      assert.ok(node.uptimeSeconds > 0);
      assert.ok(node.uptimeFormatted.length > 0);
      assert.ok(node.version.length > 0);
    }
  });

  await t.test('7. MetricsService: getMetricsSnapshot computes valid snapshot and tenant filter', async () => {
    const metricsService = new MetricsService();

    // Populate counters
    metricsService.incrementCommands('tenant-alpha', 'CMD_LOCK', 'SUCCESS', 10);
    metricsService.incrementCommands('tenant-alpha', 'CMD_LOCK', 'FAILED', 2);
    metricsService.incrementCommands('tenant-beta', 'CMD_UNLOCK', 'SUCCESS', 5);
    metricsService.observeCommandDuration('tenant-alpha', 'CMD_LOCK', 0.12);
    metricsService.incrementTelemetryUplinks('tenant-alpha', 'PK_BOX_1', 100);
    metricsService.incrementAlarms('tenant-alpha', 'LOW_BATTERY', 'WARN', 3);
    metricsService.setActiveSimulators(50, 'online');
    metricsService.setActiveSimulators(2, 'offline');
    metricsService.setWebsocketConnections('tenant-alpha', 25);
    metricsService.incrementLockContention('tenant-alpha', 1);

    // Global snapshot
    const globalSnap = metricsService.getMetricsSnapshot();
    assert.ok(globalSnap.timestamp > 0);
    assert.ok(globalSnap.corePrometheus);
    assert.equal(globalSnap.corePrometheus.commandsTotal, 17);
    assert.equal(globalSnap.corePrometheus.commandsByStatus['SUCCESS'], 15);
    assert.equal(globalSnap.corePrometheus.commandsByStatus['FAILED'], 2);
    assert.ok(globalSnap.corePrometheus.commandSuccessRate > 80);
    assert.equal(globalSnap.corePrometheus.activeSimulators.online, 50);
    assert.equal(globalSnap.corePrometheus.activeSimulators.offline, 2);
    assert.equal(globalSnap.clusterHealth.totalCount, 8);
    assert.equal(globalSnap.clusterHealth.overallStatus, 'HEALTHY');
    assert.ok(globalSnap.messageQueue.brokerType === 'EMQX');
    assert.ok(globalSnap.resources.cpuUsagePercent > 0);
    assert.ok(globalSnap.rawPrometheusText.includes('car_commands_total'));

    // Tenant Alpha snapshot
    const alphaSnap = metricsService.getMetricsSnapshot('tenant-alpha');
    assert.equal(alphaSnap.corePrometheus.commandsTotal, 12);
    assert.equal(alphaSnap.corePrometheus.telemetryUplinksTotal, 100);
    assert.equal(alphaSnap.corePrometheus.alarmsTotal, 3);

    // Tenant Beta snapshot
    const betaSnap = metricsService.getMetricsSnapshot('tenant-beta');
    assert.equal(betaSnap.corePrometheus.commandsTotal, 5);
    assert.equal(betaSnap.corePrometheus.telemetryUplinksTotal, 0);
  });

  await t.test('8. MetricsController: dual route support, cluster-nodes and snapshot endpoints', async () => {
    const metricsService = new MetricsService();
    metricsService.incrementCommands('tenant-test', 'CMD_WINDOWS', 'SUCCESS', 1);
    const controller = new MetricsController(metricsService);

    // 8.1 Plain text export
    const raw = controller.getMetrics();
    assert.ok(typeof raw === 'string');
    assert.ok(raw.includes('car_commands_total'));

    // 8.2 Cluster nodes endpoint
    const nodes = controller.getClusterNodes();
    assert.ok(Array.isArray(nodes));
    assert.equal(nodes.length, 8);

    // 8.3 Snapshot endpoint
    const snapshot = controller.getSnapshot('tenant-test');
    assert.ok(snapshot.timestamp > 0);
    assert.equal(snapshot.corePrometheus.commandsTotal, 1);
  });
});
