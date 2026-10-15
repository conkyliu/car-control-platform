import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  type VehicleLocationDto,
  type TelemetryFilterQuery,
  type TelemetryLocationPayload,
  calculateTelemetryOverview,
  filterVehicleLocations,
  applyLocationUpdate,
  toMarkerItem,
  SEED_TELEMETRY_VEHICLES,
} from '../views/telemetry/telemetry-core.ts';
import {
  fetchVehicleLocationsApi,
  fetchLatestLocationApi,
  subscribeRealtimeLocations,
  getInMemoryTelemetryVehicles,
  setInMemoryTelemetryVehicles,
  resetInMemoryTelemetryVehicles,
} from '../api/telemetry.ts';
import { ApiError } from '../api/client.ts';

describe('Realtime Telemetry & Location Monitoring Test Suite (TDD)', () => {
  beforeEach(() => {
    resetInMemoryTelemetryVehicles();
  });

  describe('1. Pure Domain Metrics Calculation (calculateTelemetryOverview)', () => {
    it('accurately calculates telemetry overview metrics for seed vehicles', () => {
      const stats = calculateTelemetryOverview(SEED_TELEMETRY_VEHICLES);

      assert.equal(stats.totalVehicles, 8, 'Total vehicles should be 8');
      assert.equal(stats.movingCount, 5, 'Moving vehicles (ONLINE with speed > 0)');
      assert.equal(stats.stationaryCount, 3, 'Stationary vehicles (speed <= 0 or OFFLINE)');
      assert.equal(stats.alarmCount, 2, 'Alarm vehicles (ALARM status or alarmCount > 0)');
      assert.equal(stats.onlineCount, 6, 'Online vehicles (ONLINE or ALARM with valid signal)');
      assert.ok(stats.onlineRate > 0 && stats.onlineRate <= 100, 'Online rate should be percentage');
      assert.ok(stats.avgSpeed > 0, 'Average speed should be positive');

      // Moving vehicles: veh-001 (45.2), veh-002 (68.0), veh-005 (55.4), veh-006 (32.1), veh-008 is ALARM with speed 12
      // Let's verify moving vehicles speed calculation
      const movingVehicles = SEED_TELEMETRY_VEHICLES.filter(
        (v) => (v.status === 'ONLINE' || v.status === 'ALARM') && (v.speed ?? 0) > 0
      );
      const expectedAvg =
        movingVehicles.reduce((sum, v) => sum + (v.speed ?? 0), 0) / movingVehicles.length;
      assert.equal(stats.avgSpeed, Number(expectedAvg.toFixed(1)));
    });

    it('safely handles empty vehicle array without NaN or division by zero', () => {
      const stats = calculateTelemetryOverview([]);

      assert.equal(stats.totalVehicles, 0);
      assert.equal(stats.onlineCount, 0);
      assert.equal(stats.onlineRate, 0);
      assert.equal(stats.movingCount, 0);
      assert.equal(stats.stationaryCount, 0);
      assert.equal(stats.alarmCount, 0);
      assert.equal(stats.avgSpeed, 0);
    });

    it('computes 100% online rate and accurate average speed when all vehicles are moving', () => {
      const sample: VehicleLocationDto[] = [
        {
          vehicleId: 'v1',
          plateNumber: '粤B·11111',
          vin: 'VIN11111111111111',
          brand: '比亚迪',
          modelName: '仰望 U8',
          deviceNo: 'DEV001',
          coordinates: { lat: 22.5, lng: 113.9 },
          gpsValid: true,
          timestamp: Date.now(),
          lastReportTime: new Date().toISOString(),
          status: 'ONLINE',
          speed: 60,
        },
        {
          vehicleId: 'v2',
          plateNumber: '粤B·22222',
          vin: 'VIN22222222222222',
          brand: '蔚来',
          modelName: 'ET7',
          deviceNo: 'DEV002',
          coordinates: { lat: 22.6, lng: 114.0 },
          gpsValid: true,
          timestamp: Date.now(),
          lastReportTime: new Date().toISOString(),
          status: 'ONLINE',
          speed: 40,
        },
      ];

      const stats = calculateTelemetryOverview(sample);
      assert.equal(stats.totalVehicles, 2);
      assert.equal(stats.onlineCount, 2);
      assert.equal(stats.onlineRate, 100);
      assert.equal(stats.movingCount, 2);
      assert.equal(stats.stationaryCount, 0);
      assert.equal(stats.avgSpeed, 50);
    });
  });

  describe('2. Multi-dimensional Vehicle Filtering (filterVehicleLocations)', () => {
    it('filters vehicles by plate number keyword', () => {
      const res = filterVehicleLocations(SEED_TELEMETRY_VEHICLES, { keyword: '3388' });
      assert.equal(res.length, 1);
      assert.equal(res[0].plateNumber, '粤B·3388K');
    });

    it('filters vehicles by last 6 digits of VIN code', () => {
      const res = filterVehicleLocations(SEED_TELEMETRY_VEHICLES, { keyword: '005005' });
      assert.equal(res.length, 1);
      assert.equal(res[0].vehicleId, 'veh-005');
      assert.equal(res[0].vin, 'LB9EE67J9TE005005');
    });

    it('filters vehicles by device hardware number', () => {
      const res = filterVehicleLocations(SEED_TELEMETRY_VEHICLES, { keyword: 'DEV_SN_003' });
      assert.equal(res.length, 1);
      assert.equal(res[0].vehicleId, 'veh-003');
    });

    it('filters vehicles by brand or model name case-insensitively', () => {
      const teslaRes = filterVehicleLocations(SEED_TELEMETRY_VEHICLES, { keyword: 'model y' });
      assert.equal(teslaRes.length, 1);
      assert.equal(teslaRes[0].modelName, 'Model Y');

      const bydRes = filterVehicleLocations(SEED_TELEMETRY_VEHICLES, { keyword: '比亚迪' });
      assert.ok(bydRes.length >= 2, 'Should find at least 2 BYD vehicles');
    });

    it('filters vehicles by operational status (MOVING, STATIONARY, ALARM, OFFLINE)', () => {
      const moving = filterVehicleLocations(SEED_TELEMETRY_VEHICLES, { status: 'MOVING' });
      assert.equal(moving.length, 5);
      moving.forEach((v) => assert.ok((v.speed ?? 0) > 0));

      const stationary = filterVehicleLocations(SEED_TELEMETRY_VEHICLES, { status: 'STATIONARY' });
      assert.equal(stationary.length, 3);
      stationary.forEach((v) => assert.ok((v.speed ?? 0) <= 0 || v.status === 'OFFLINE'));

      const alarms = filterVehicleLocations(SEED_TELEMETRY_VEHICLES, { status: 'ALARM' });
      assert.equal(alarms.length, 2);
      alarms.forEach((v) => assert.ok(v.status === 'ALARM' || (v.alarmCount ?? 0) > 0));

      const offline = filterVehicleLocations(SEED_TELEMETRY_VEHICLES, { status: 'OFFLINE' });
      assert.equal(offline.length, 2);
      offline.forEach((v) => assert.equal(v.status, 'OFFLINE'));
    });

    it('filters vehicles by low battery voltage threshold (< 11.5V)', () => {
      const lowVoltage = filterVehicleLocations(SEED_TELEMETRY_VEHICLES, { lowVoltageOnly: true });
      assert.equal(lowVoltage.length, 2, 'veh-003 (11.2V) and veh-008 (11.4V) should be flagged');
      lowVoltage.forEach((v) => {
        assert.ok(v.voltage !== undefined && v.voltage < 11.5);
      });
    });

    it('combines keyword, status, and lowVoltage filters conjunctively', () => {
      const combined = filterVehicleLocations(SEED_TELEMETRY_VEHICLES, {
        keyword: '粤B',
        status: 'ALARM',
        lowVoltageOnly: true,
      });
      assert.equal(combined.length, 2);
    });
  });

  describe('3. Immutable Realtime Location Stream Processor (applyLocationUpdate)', () => {
    it('immutably updates coordinates, speed, heading, and lastReportTime', () => {
      const originalVehicles = SEED_TELEMETRY_VEHICLES;
      const initialVeh = originalVehicles.find((v) => v.vehicleId === 'veh-001')!;

      const updatePayload: TelemetryLocationPayload & { vehicleId: string } = {
        vehicleId: 'veh-001',
        lat: 22.5501,
        lng: 113.9455,
        speed: 72.5,
        heading: 180,
        voltage: 12.9,
        timestamp: Date.now() + 5000,
      };

      const updatedList = applyLocationUpdate(originalVehicles, updatePayload);

      // Verify immutability: original untouched
      assert.notEqual(updatedList, originalVehicles);
      assert.equal(initialVeh.speed, 45.2);
      assert.equal(initialVeh.coordinates.lat, 22.5428);

      // Verify updated record
      const updatedVeh = updatedList.find((v) => v.vehicleId === 'veh-001')!;
      assert.equal(updatedVeh.coordinates.lat, 22.5501);
      assert.equal(updatedVeh.coordinates.lng, 113.9455);
      assert.equal(updatedVeh.speed, 72.5);
      assert.equal(updatedVeh.heading, 180);
      assert.equal(updatedVeh.voltage, 12.9);
      assert.equal(updatedVeh.status, 'ONLINE');

      // Verify latest report time sorting: veh-001 has highest timestamp, so it must be first
      assert.equal(updatedList[0].vehicleId, 'veh-001');
    });

    it('automatically restores status to ONLINE when vehicle speed becomes positive', () => {
      const offlineVeh = SEED_TELEMETRY_VEHICLES.find((v) => v.vehicleId === 'veh-004')!;
      assert.equal(offlineVeh.status, 'OFFLINE');

      const updatedList = applyLocationUpdate(SEED_TELEMETRY_VEHICLES, {
        vehicleId: 'veh-004',
        lat: 22.585,
        lng: 113.97,
        speed: 35.0, // Moving!
        heading: 90,
      });

      const updatedVeh = updatedList.find((v) => v.vehicleId === 'veh-004')!;
      assert.equal(updatedVeh.status, 'ONLINE');
      assert.equal(updatedVeh.speed, 35.0);
    });

    it('returns original list safely if target vehicleId does not exist', () => {
      const updated = applyLocationUpdate(SEED_TELEMETRY_VEHICLES, {
        vehicleId: 'non-existent-veh',
        lat: 20.0,
        lng: 110.0,
      });

      assert.equal(updated.length, SEED_TELEMETRY_VEHICLES.length);
    });
  });

  describe('4. GIS MapMarker Converter (toMarkerItem)', () => {
    it('converts VehicleLocationDto to MapMarkerItem for MapContainer rendering', () => {
      const dto = SEED_TELEMETRY_VEHICLES[0];
      const marker = toMarkerItem(dto);

      assert.equal(marker.id, dto.vehicleId);
      assert.equal(marker.plateNumber, dto.plateNumber);
      assert.equal(marker.vin, dto.vin);
      assert.equal(marker.model, `${dto.brand} ${dto.modelName}`.trim());
      assert.deepEqual(marker.coordinates, dto.coordinates);
      assert.equal(marker.status, dto.status);
      assert.equal(marker.speedKmh, dto.speed);
      assert.equal(marker.heading, dto.heading);
      assert.equal(marker.voltage, dto.voltage);
      assert.equal(marker.lastHeartbeat, dto.lastReportTime);
      assert.equal(marker.address, dto.address);
    });
  });

  describe('5. Telemetry API Client & Offline Fallback (api/telemetry.ts)', () => {
    it('fetchVehicleLocationsApi returns seed telemetry vehicles with filtering in offline fallback', async () => {
      const all = await fetchVehicleLocationsApi();
      assert.equal(all.length, 8);

      const movingOnly = await fetchVehicleLocationsApi({ status: 'MOVING' });
      assert.equal(movingOnly.length, 5);

      const searchPlate = await fetchVehicleLocationsApi({ keyword: 'DZ8826' });
      assert.equal(searchPlate.length, 1);
      assert.equal(searchPlate[0].plateNumber, '沪A·DZ8826');
    });

    it('fetchLatestLocationApi retrieves latest telemetry record for vehicleId', async () => {
      const loc = await fetchLatestLocationApi('veh-002');
      assert.equal(loc.vehicleId, 'veh-002');
      assert.equal(loc.plateNumber, '粤B·DA6888');
      assert.equal(loc.modelName, '极氪 001');
    });

    it('fetchLatestLocationApi throws 404 ApiError for unknown vehicleId in offline fallback', async () => {
      await assert.rejects(
        async () => {
          await fetchLatestLocationApi('veh-unknown-999');
        },
        (err: any) => {
          assert.equal(err.name, 'ApiError');
          assert.equal(err.statusCode, 404);
          return true;
        }
      );
    });

    it('subscribeRealtimeLocations streams updates and provides safe unsubscribe cleanup', async () => {
      const receivedUpdates: VehicleLocationDto[] = [];

      const unsubscribe = subscribeRealtimeLocations((update) => {
        receivedUpdates.push(update);
      });

      assert.equal(typeof unsubscribe, 'function');

      // Wait a small tick to receive simulated or initial telemetry heartbeat
      await new Promise((resolve) => setTimeout(resolve, 60));

      unsubscribe();
      const countAfterUnsub = receivedUpdates.length;

      // Wait another tick to verify no further updates are received after unsubscribe
      await new Promise((resolve) => setTimeout(resolve, 60));
      assert.equal(receivedUpdates.length, countAfterUnsub, 'No new updates after unsubscribe');
    });
  });
});
