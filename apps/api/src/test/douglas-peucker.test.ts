import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TelemetryLocationPayload,
  TrajectoryTolerance,
  WebSocketEvent,
} from '@car-control/contracts';
import {
  LocationRepository,
  VehicleRepository,
  TenantContext,
} from '@car-control/database';
import { douglasPeucker } from '../telemetry/douglas-peucker.js';
import { GeofenceService } from '../telemetry/geofence.service.js';
import { TelemetryService } from '../telemetry/telemetry.service.js';
import { TelemetryController } from '../telemetry/telemetry.controller.js';
import { InMemoryMessagingAdapter } from '../messaging/in-memory-messaging.adapter.js';
import { WebSocketGatewayService } from '../realtime/websocket.gateway.js';

test('Telemetry & Geofence Service Unit and Integration Test Suite', async (t) => {
  // ==========================================
  // Section 1: Douglas-Peucker Trajectory Simplification Algorithm
  // ==========================================
  await t.test('1. Douglas-Peucker: Handles base boundary cases (<= 2 points)', () => {
    // Empty array
    assert.deepEqual(douglasPeucker([]), []);

    // Single point
    const singlePoint: TelemetryLocationPayload = {
      lat: 31.2304,
      lng: 121.4737,
      gpsValid: true,
      timestamp: 1000,
    };
    assert.deepEqual(douglasPeucker([singlePoint]), [singlePoint]);

    // Two points (endpoints must be strictly preserved)
    const p1: TelemetryLocationPayload = {
      lat: 31.2300,
      lng: 121.4700,
      gpsValid: true,
      timestamp: 1000,
    };
    const p2: TelemetryLocationPayload = {
      lat: 31.2310,
      lng: 121.4710,
      gpsValid: true,
      timestamp: 2000,
    };
    const result2 = douglasPeucker([p1, p2]);
    assert.equal(result2.length, 2);
    assert.deepEqual(result2[0], p1);
    assert.deepEqual(result2[1], p2);
  });

  await t.test('2. Douglas-Peucker: Strictly removes collinear intermediate points', () => {
    // 5 collinear points along a straight line: y = x (lat = lng)
    const points: TelemetryLocationPayload[] = [
      { lat: 30.0, lng: 120.0, gpsValid: true, timestamp: 1000 },
      { lat: 30.1, lng: 120.1, gpsValid: true, timestamp: 2000 },
      { lat: 30.2, lng: 120.2, gpsValid: true, timestamp: 3000 },
      { lat: 30.3, lng: 120.3, gpsValid: true, timestamp: 4000 },
      { lat: 30.4, lng: 120.4, gpsValid: true, timestamp: 5000 },
    ];

    const simplified = douglasPeucker(points, TrajectoryTolerance.DEFAULT);
    // Intermediate collinear points should be completely pruned
    assert.equal(simplified.length, 2);
    assert.deepEqual(simplified[0], points[0]);
    assert.deepEqual(simplified[1], points[4]);
  });

  await t.test('3. Douglas-Peucker: Preserves points with significant deviation exceeding tolerance', () => {
    // P0: (30.0, 120.0) -> P2: (30.0, 120.2)
    // Baseline segment is along latitude 30.0
    // P1 deviates north by 0.005 degrees (approx 550m), which is >> DEFAULT tolerance (0.0001)
    const p0: TelemetryLocationPayload = { lat: 30.0, lng: 120.0, gpsValid: true, timestamp: 1000 };
    const p1: TelemetryLocationPayload = { lat: 30.005, lng: 120.1, gpsValid: true, timestamp: 2000 };
    const p2: TelemetryLocationPayload = { lat: 30.0, lng: 120.2, gpsValid: true, timestamp: 3000 };

    const simplified = douglasPeucker([p0, p1, p2], TrajectoryTolerance.DEFAULT);
    assert.equal(simplified.length, 3);
    assert.deepEqual(simplified[0], p0);
    assert.deepEqual(simplified[1], p1);
    assert.deepEqual(simplified[2], p2);

    // If tolerance is higher than the deviation (e.g. 0.01), p1 should be pruned
    const aggressiveSimplified = douglasPeucker([p0, p1, p2], 0.01);
    assert.equal(aggressiveSimplified.length, 2);
    assert.deepEqual(aggressiveSimplified[0], p0);
    assert.deepEqual(aggressiveSimplified[1], p2);
  });

  await t.test('4. Douglas-Peucker: Recursive division retains key vertices on multi-turn trajectory', () => {
    // Construct a route with straight segments and distinct turning corners
    const route: TelemetryLocationPayload[] = [
      { lat: 31.000, lng: 121.000, gpsValid: true, timestamp: 1000 }, // Start
      { lat: 31.001, lng: 121.000, gpsValid: true, timestamp: 2000 }, // Straight segment
      { lat: 31.002, lng: 121.000, gpsValid: true, timestamp: 3000 }, // Straight segment
      { lat: 31.010, lng: 121.000, gpsValid: true, timestamp: 4000 }, // Corner 1 (Turn East)
      { lat: 31.010, lng: 121.005, gpsValid: true, timestamp: 5000 }, // Straight segment
      { lat: 31.010, lng: 121.010, gpsValid: true, timestamp: 6000 }, // Corner 2 (Turn North)
      { lat: 31.015, lng: 121.010, gpsValid: true, timestamp: 7000 }, // Straight segment
      { lat: 31.020, lng: 121.010, gpsValid: true, timestamp: 8000 }, // End
    ];

    const simplified = douglasPeucker(route, TrajectoryTolerance.DEFAULT);
    // Endpoints strictly preserved
    assert.deepEqual(simplified[0], route[0]);
    assert.deepEqual(simplified[simplified.length - 1], route[route.length - 1]);

    // Straight collinear points pruned, key corners preserved
    assert.ok(simplified.length < route.length, 'Should compress route');
    assert.ok(simplified.length >= 4, 'Should retain corner turn points');
    assert.ok(
      simplified.some((p: TelemetryLocationPayload) => p.lat === 31.010 && p.lng === 121.000),
      'Corner 1 must be kept'
    );
    assert.ok(
      simplified.some((p: TelemetryLocationPayload) => p.lat === 31.010 && p.lng === 121.010),
      'Corner 2 must be kept'
    );
  });

  // ==========================================
  // Section 2: Geofence Service (Haversine Formula)
  // ==========================================
  await t.test('5. GeofenceService: Accurate spherical distance calculation', () => {
    const geofenceService = new GeofenceService();
    // Same point -> distance should be 0
    const d0 = geofenceService.calculateDistance(31.2304, 121.4737, 31.2304, 121.4737);
    assert.equal(Math.round(d0), 0);

    // 1 degree latitude along meridian is approx 111,195 meters
    const dLat = geofenceService.calculateDistance(0, 0, 1, 0);
    assert.ok(
      Math.abs(dLat - 111195) < 100,
      `Expected ~111,195m, got ${dLat}`
    );
  });

  await t.test('6. GeofenceService: Boundary containment checking', () => {
    const geofenceService = new GeofenceService();
    // Circle centered at (31.2304, 121.4737) with radius 500 meters
    const circle = {
      centerLat: 31.2304,
      centerLng: 121.4737,
      radiusMeters: 500,
    };

    // Point 1: Center point -> Inside
    assert.equal(geofenceService.checkGeofence(circle, { lat: 31.2304, lng: 121.4737 }), true);

    // Point 2: ~111m away (lat offset 0.001) -> Inside (111m < 500m)
    assert.equal(geofenceService.checkGeofence(circle, { lat: 31.2314, lng: 121.4737 }), true);

    // Point 3: ~1110m away (lat offset 0.01) -> Outside (1110m > 500m)
    assert.equal(geofenceService.checkGeofence(circle, { lat: 31.2404, lng: 121.4737 }), false);
  });

  // ==========================================
  // Section 3: Telemetry Service & Messaging Integration
  // ==========================================
  await t.test('7. TelemetryService: Uplink message processing, WebSocket broadcast, and Trajectory query', async () => {
    const locationRepo = new LocationRepository();
    const vehicleRepo = new VehicleRepository();
    const wsGateway = new WebSocketGatewayService();
    const geofenceService = new GeofenceService();
    const messagingAdapter = new InMemoryMessagingAdapter();

    const telemetryService = new TelemetryService(
      locationRepo,
      vehicleRepo,
      wsGateway,
      geofenceService,
      messagingAdapter
    );

    const tenantId = 'TENANT_TELEMETRY_01';
    const vehicleId = 'veh_telem_001';
    const deviceNo = 'TBOX_TELEM_1001';
    const productKey = 'PK_TELEMETRY';

    // 1. Create vehicle record bound to deviceNo
    await TenantContext.run({ tenantId, userId: 'admin' }, async () => {
      await vehicleRepo.create({
        id: vehicleId,
        projectId: 'proj_01',
        vin: 'VIN_TELEM_TEST_01',
        plateNumber: '粤B99887',
        brandId: 'brand_tesla',
        modelId: 'model_3',
        deviceId: deviceNo,
        status: 'NORMAL',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    // 2. Track WebSocket events
    const wsEvents: Array<{ event: string; payload: unknown }> = [];
    wsGateway.joinVehicleRoom(vehicleId, (event, payload) => {
      wsEvents.push({ event, payload });
    });

    // 3. Register device in messaging adapter
    messagingAdapter.subscribeDevice(productKey, deviceNo);

    // 4. Simulate location uplink event
    const t0 = 1791500000000;
    const locPayload1: TelemetryLocationPayload = {
      lat: 31.2304,
      lng: 121.4737,
      gpsValid: true,
      timestamp: t0,
      speed: 45.0,
      heading: 90,
    };

    const locPayload2: TelemetryLocationPayload = {
      lat: 31.2314,
      lng: 121.4737,
      gpsValid: true,
      timestamp: t0 + 10000,
      speed: 50.0,
      heading: 90,
    };

    // Uplink via messaging adapter or handleLocationUplink
    await telemetryService.handleLocationUplink(deviceNo, locPayload1);
    await telemetryService.handleLocationUplink(deviceNo, locPayload2);

    // Verify WebSocket broadcast
    assert.equal(wsEvents.length, 2);
    assert.equal(wsEvents[0].event, WebSocketEvent.LOCATION_UPDATED);
    assert.deepEqual(wsEvents[0].payload, locPayload1);
    assert.equal(wsEvents[1].event, WebSocketEvent.LOCATION_UPDATED);
    assert.deepEqual(wsEvents[1].payload, locPayload2);

    // Verify Latest Location query
    const latest = await telemetryService.getLatestLocation(vehicleId);
    assert.ok(latest);
    assert.equal(latest!.timestamp, t0 + 10000);
    assert.equal(latest!.lat, 31.2314);

    // Verify Trajectory query with simplification
    const trajectory = await telemetryService.getTrajectory(
      vehicleId,
      new Date(t0 - 1000),
      new Date(t0 + 20000),
      TrajectoryTolerance.DEFAULT
    );
    assert.equal(trajectory.length, 2);
    assert.deepEqual(trajectory[0], locPayload1);
    assert.deepEqual(trajectory[1], locPayload2);
  });

  await t.test('8. TelemetryController: REST endpoints for latest location and trajectory', async () => {
    const locationRepo = new LocationRepository();
    const vehicleRepo = new VehicleRepository();
    const wsGateway = new WebSocketGatewayService();
    const geofenceService = new GeofenceService();
    const messagingAdapter = new InMemoryMessagingAdapter();

    const telemetryService = new TelemetryService(
      locationRepo,
      vehicleRepo,
      wsGateway,
      geofenceService,
      messagingAdapter
    );
    const controller = new TelemetryController(telemetryService);

    const tenantId = 'TENANT_CTRL_01';
    const vehicleId = 'veh_ctrl_001';
    const deviceNo = 'TBOX_CTRL_001';

    await TenantContext.run({ tenantId, userId: 'admin' }, async () => {
      await vehicleRepo.create({
        id: vehicleId,
        projectId: 'proj_01',
        vin: 'VIN_CTRL_01',
        plateNumber: '粤B12345',
        brandId: 'brand_tesla',
        modelId: 'model_y',
        deviceId: deviceNo,
        status: 'NORMAL',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    // 404 on vehicle with no locations
    await assert.rejects(
      async () => {
        await controller.getLatestLocation('non_existent_vehicle');
      },
      {
        name: 'NotFoundException',
      }
    );

    // Save location
    const t0 = 1791510000000;
    await telemetryService.handleLocationUplink(deviceNo, {
      lat: 31.2300,
      lng: 121.4700,
      gpsValid: true,
      timestamp: t0,
    });

    const latest = await controller.getLatestLocation(vehicleId);
    assert.equal(latest.lat, 31.2300);

    const trajDto = await controller.getTrajectory(
      vehicleId,
      new Date(t0 - 1000).toISOString(),
      new Date(t0 + 1000).toISOString(),
      '0.0001'
    );
    assert.equal(trajDto.vehicleId, vehicleId);
    assert.equal(trajDto.simplifiedCount, 1);
    assert.equal(trajDto.points.length, 1);
  });
});
