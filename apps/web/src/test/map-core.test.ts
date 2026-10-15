import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  type Coordinates,
  type MapMarkerItem,
  type ClusterGroup,
  type MapTileLayerType,
  isInChina,
  wgs84ToGcj02,
  gcj02ToWgs84,
  calculateDistanceMeters,
  calculateHeading,
  formatSpeed,
  formatCoordinates,
  calculateBoundingBox,
  clusterMarkers,
  latLngToPixel,
  pixelToLatLng,
  SEED_MAP_VEHICLES,
} from '../views/telemetry/map-core.ts';

describe('Map Core GIS Engine & Spatial Math Test Suite (TDD)', () => {
  describe('1. Boundary Check & Coordinate System Transformation (WGS-84 <-> GCJ-02)', () => {
    it('identifies coordinates inside and outside of mainland China accurately via isInChina', () => {
      // Domestic major cities
      assert.equal(isInChina(39.9042, 116.4074), true, 'Beijing should be in China');
      assert.equal(isInChina(22.5428, 113.9389), true, 'Shenzhen should be in China');
      assert.equal(isInChina(31.2304, 121.4737), true, 'Shanghai should be in China');
      assert.equal(isInChina(30.2741, 120.1551), true, 'Hangzhou should be in China');
      assert.equal(isInChina(23.1291, 113.2644), true, 'Guangzhou should be in China');

      // International locations
      assert.equal(isInChina(35.6762, 139.6503), false, 'Tokyo should be outside China');
      assert.equal(isInChina(37.7749, -122.4194), false, 'San Francisco should be outside China');
      assert.equal(isInChina(51.5074, -0.1278), false, 'London should be outside China');
      assert.equal(isInChina(0, 0), false, 'Null Island (0,0) should be outside China');
    });

    it('bypasses offset transformation for coordinates outside of China', () => {
      const abroad = { lat: 37.7749, lng: -122.4194 };
      const gcj = wgs84ToGcj02(abroad.lat, abroad.lng);
      assert.equal(gcj.lat, abroad.lat);
      assert.equal(gcj.lng, abroad.lng);

      const wgs = gcj02ToWgs84(abroad.lat, abroad.lng);
      assert.equal(wgs.lat, abroad.lat);
      assert.equal(wgs.lng, abroad.lng);
    });

    it('transforms WGS-84 coordinates to GCJ-02 with proper nonlinear offset for Chinese locations', () => {
      // Beijing Tiananmen WGS-84: approx (39.908722, 116.397496)
      const wgsLat = 39.908722;
      const wgsLng = 116.397496;
      const gcj = wgs84ToGcj02(wgsLat, wgsLng);

      // GCJ-02 offset shifts position by roughly 100~500m in China
      const deltaLat = gcj.lat - wgsLat;
      const deltaLng = gcj.lng - wgsLng;

      assert.ok(Math.abs(deltaLat) > 0.0005 && Math.abs(deltaLat) < 0.01, `Delta lat ${deltaLat} out of expected range`);
      assert.ok(Math.abs(deltaLng) > 0.002 && Math.abs(deltaLng) < 0.015, `Delta lng ${deltaLng} out of expected range`);

      // Known reference value: Tiananmen GCJ-02 is approximately (39.91008, 116.4037)
      assert.ok(Math.abs(gcj.lat - 39.91008) < 0.001, `Expected lat close to 39.91008, got ${gcj.lat}`);
      assert.ok(Math.abs(gcj.lng - 116.4037) < 0.001, `Expected lng close to 116.4037, got ${gcj.lng}`);
    });

    it('achieves sub-meter round-trip precision between WGS-84 and GCJ-02 via iterative inverse projection', () => {
      const testPoints: Coordinates[] = [
        { lat: 22.5428, lng: 113.9389 }, // Shenzhen Science Park
        { lat: 31.2304, lng: 121.4737 }, // Shanghai People's Square
        { lat: 39.9042, lng: 116.4074 }, // Beijing
        { lat: 30.5728, lng: 104.0668 }, // Chengdu
      ];

      for (const pt of testPoints) {
        const gcj = wgs84ToGcj02(pt.lat, pt.lng);
        const restoredWgs = gcj02ToWgs84(gcj.lat, gcj.lng);

        const latDiff = Math.abs(restoredWgs.lat - pt.lat);
        const lngDiff = Math.abs(restoredWgs.lng - pt.lng);

        // Sub-millimeter error threshold (< 1e-6 degrees ~ 0.1 meter)
        assert.ok(latDiff < 1e-6, `Latitude roundtrip drift too high: ${latDiff} for point ${JSON.stringify(pt)}`);
        assert.ok(lngDiff < 1e-6, `Longitude roundtrip drift too high: ${lngDiff} for point ${JSON.stringify(pt)}`);
      }
    });
  });

  describe('2. Geodesic Distance (Haversine) & Compass Heading Algorithms', () => {
    it('calculates zero distance for identical coordinates', () => {
      const p = { lat: 22.5428, lng: 113.9389 };
      const dist = calculateDistanceMeters(p, p);
      assert.equal(dist, 0);
    });

    it('calculates accurate distance between Shanghai and Beijing (approx 1,068 km)', () => {
      const shanghai: Coordinates = { lat: 31.2304, lng: 121.4737 };
      const beijing: Coordinates = { lat: 39.9042, lng: 116.4074 };

      const dist = calculateDistanceMeters(shanghai, beijing);
      // Shanghai to Beijing is roughly 1,068,000 meters (+- 20km)
      assert.ok(dist >= 1050000 && dist <= 1080000, `Distance out of expected range: ${dist}m`);

      // Distance calculation must be strictly symmetric
      const reverseDist = calculateDistanceMeters(beijing, shanghai);
      assert.equal(dist, reverseDist);
    });

    it('calculates short-distance accuracy for local test points in Shenzhen', () => {
      // 0.001 degree latitude difference ~= 111 meters
      const p1: Coordinates = { lat: 22.5400, lng: 113.9300 };
      const p2: Coordinates = { lat: 22.5410, lng: 113.9300 };

      const dist = calculateDistanceMeters(p1, p2);
      assert.ok(dist >= 110 && dist <= 112, `111m expected, got: ${dist}`);
    });

    it('computes 360-degree compass heading accurately across cardinal and ordinal directions', () => {
      const origin: Coordinates = { lat: 22.5000, lng: 113.5000 };

      // Due North
      const north: Coordinates = { lat: 23.5000, lng: 113.5000 };
      const headingNorth = calculateHeading(origin, north);
      assert.ok(Math.abs(headingNorth - 0) < 0.1 || Math.abs(headingNorth - 360) < 0.1, `Expected North (0°), got ${headingNorth}`);

      // Due East
      const east: Coordinates = { lat: 22.5000, lng: 114.5000 };
      const headingEast = calculateHeading(origin, east);
      assert.ok(Math.abs(headingEast - 90) < 1, `Expected East (90°), got ${headingEast}`);

      // Due South
      const south: Coordinates = { lat: 21.5000, lng: 113.5000 };
      const headingSouth = calculateHeading(origin, south);
      assert.ok(Math.abs(headingSouth - 180) < 1, `Expected South (180°), got ${headingSouth}`);

      // Due West
      const west: Coordinates = { lat: 22.5000, lng: 112.5000 };
      const headingWest = calculateHeading(origin, west);
      assert.ok(Math.abs(headingWest - 270) < 1, `Expected West (270°), got ${headingWest}`);

      // Northeast
      const northEast: Coordinates = { lat: 23.5000, lng: 114.5000 };
      const headingNE = calculateHeading(origin, northEast);
      assert.ok(headingNE > 30 && headingNE < 60, `Expected Northeast (~45°), got ${headingNE}`);
    });
  });

  describe('3. Telemetry Formatting Helpers (formatSpeed & formatCoordinates)', () => {
    it('formats speed values with unit and handles stationary/zero/negative values', () => {
      assert.equal(formatSpeed(62.5), '62.5 km/h');
      assert.equal(formatSpeed(120), '120.0 km/h');
      assert.equal(formatSpeed(0), '静止');
      assert.equal(formatSpeed(-2), '静止');
      assert.equal(formatSpeed(undefined), '静止');
    });

    it('formats coordinates with cardinal indicators (N/S, E/W)', () => {
      const shanghai: Coordinates = { lat: 31.2304, lng: 121.4737 };
      assert.equal(formatCoordinates(shanghai), '31.2304° N, 121.4737° E');

      const sydney: Coordinates = { lat: -33.8688, lng: 151.2093 };
      assert.equal(formatCoordinates(sydney), '33.8688° S, 151.2093° E');

      const newYork: Coordinates = { lat: 40.7128, lng: -74.0060 };
      assert.equal(formatCoordinates(newYork), '40.7128° N, 74.0060° W');
    });
  });

  describe('4. Bounding Box & Viewport Auto-Fitting (calculateBoundingBox)', () => {
    it('returns default fallback viewport when point collection is empty', () => {
      const bbox = calculateBoundingBox([]);
      assert.ok(bbox.center.lat > 20 && bbox.center.lat < 40);
      assert.ok(bbox.center.lng > 110 && bbox.center.lng < 130);
      assert.ok(bbox.recommendedZoom >= 10 && bbox.recommendedZoom <= 15);
    });

    it('centers on the single point with detailed street zoom level (15) when 1 point is given', () => {
      const pt: Coordinates = { lat: 22.5428, lng: 113.9389 };
      const bbox = calculateBoundingBox([pt]);
      assert.equal(bbox.center.lat, pt.lat);
      assert.equal(bbox.center.lng, pt.lng);
      assert.equal(bbox.recommendedZoom, 15);
      assert.equal(bbox.minLat, pt.lat);
      assert.equal(bbox.maxLat, pt.lat);
      assert.equal(bbox.minLng, pt.lng);
      assert.equal(bbox.maxLng, pt.lng);
    });

    it('computes exact bounding rectangle and scales zoom down for broad multi-city points', () => {
      const points: Coordinates[] = [
        { lat: 22.5428, lng: 113.9389 }, // Shenzhen
        { lat: 31.2304, lng: 121.4737 }, // Shanghai
        { lat: 39.9042, lng: 116.4074 }, // Beijing
      ];

      const bbox = calculateBoundingBox(points);
      assert.equal(bbox.minLat, 22.5428);
      assert.equal(bbox.maxLat, 39.9042);
      assert.equal(bbox.minLng, 113.9389);
      assert.equal(bbox.maxLng, 121.4737);

      const expectedCenterLat = (22.5428 + 39.9042) / 2;
      const expectedCenterLng = (113.9389 + 121.4737) / 2;
      assert.ok(Math.abs(bbox.center.lat - expectedCenterLat) < 0.0001);
      assert.ok(Math.abs(bbox.center.lng - expectedCenterLng) < 0.0001);

      // Nationwide span across 17+ degrees latitude requires zoom 4~6
      assert.ok(bbox.recommendedZoom >= 4 && bbox.recommendedZoom <= 7, `Zoom ${bbox.recommendedZoom} out of expected range`);
    });

    it('assigns high zoom (13~14) for localized points in the same district', () => {
      const localPoints: Coordinates[] = [
        { lat: 22.5420, lng: 113.9380 },
        { lat: 22.5450, lng: 113.9420 },
        { lat: 22.5410, lng: 113.9390 },
      ];

      const bbox = calculateBoundingBox(localPoints);
      assert.ok(bbox.recommendedZoom >= 13 && bbox.recommendedZoom <= 15);
    });
  });

  describe('5. Web Mercator Projection & Marker Clustering Algorithm', () => {
    it('projects lat/lng to Web Mercator pixel and converts back with high fidelity', () => {
      const coord: Coordinates = { lat: 22.5428, lng: 113.9389 };
      const zoom = 14;

      const px = latLngToPixel(coord, zoom);
      assert.ok(px.x > 0 && px.y > 0);

      const restored = pixelToLatLng(px, zoom);
      assert.ok(Math.abs(restored.lat - coord.lat) < 1e-6);
      assert.ok(Math.abs(restored.lng - coord.lng) < 1e-6);
    });

    it('returns empty collections when clustering empty marker list', () => {
      const result = clusterMarkers([], 60, 13);
      assert.deepEqual(result.singles, []);
      assert.deepEqual(result.clusters, []);
    });

    it('keeps distant markers separate as singles without forming clusters', () => {
      const distantMarkers: MapMarkerItem[] = [
        {
          id: 'v1',
          plateNumber: '粤B·11111',
          vin: 'VIN00000000000001',
          model: 'Model Y',
          coordinates: { lat: 22.5428, lng: 113.9389 }, // Shenzhen
          status: 'ONLINE',
        },
        {
          id: 'v2',
          plateNumber: '沪A·22222',
          vin: 'VIN00000000000002',
          model: 'ET7',
          coordinates: { lat: 31.2304, lng: 121.4737 }, // Shanghai
          status: 'ONLINE',
        },
      ];

      const result = clusterMarkers(distantMarkers, 60, 10);
      assert.equal(result.singles.length, 2);
      assert.equal(result.clusters.length, 0);
    });

    it('clusters adjacent markers within distanceThresholdPx into ClusterGroup', () => {
      // 3 vehicles parked within 10 meters of each other in Shenzhen Science Park
      const closeMarkers: MapMarkerItem[] = [
        {
          id: 'v1',
          plateNumber: '粤B·A1001',
          vin: 'VIN00000000000001',
          model: '仰望 U8',
          coordinates: { lat: 22.54280, lng: 113.93890 },
          status: 'ONLINE',
        },
        {
          id: 'v2',
          plateNumber: '粤B·A1002',
          vin: 'VIN00000000000002',
          model: '仰望 U8',
          coordinates: { lat: 22.54282, lng: 113.93892 },
          status: 'ONLINE',
        },
        {
          id: 'v3',
          plateNumber: '粤B·A1003',
          vin: 'VIN00000000000003',
          model: '仰望 U8',
          coordinates: { lat: 22.54281, lng: 113.93891 },
          status: 'ALARM',
        },
        // 1 isolated vehicle 10km away
        {
          id: 'v4',
          plateNumber: '粤B·A1004',
          vin: 'VIN00000000000004',
          model: '极氪 001',
          coordinates: { lat: 22.60000, lng: 114.05000 },
          status: 'OFFLINE',
        },
      ];

      // At zoom 12, the first 3 vehicles occupy within ~2 pixels and should cluster
      const result = clusterMarkers(closeMarkers, 60, 12);
      assert.equal(result.clusters.length, 1, 'Should form 1 cluster group');
      assert.equal(result.clusters[0].count, 3, 'Cluster should contain 3 vehicles');
      assert.equal(result.singles.length, 1, 'Should have 1 single vehicle');
      assert.equal(result.singles[0].id, 'v4');
    });

    it('breaks clusters apart into individual singles as zoom level increases (zoom 18)', () => {
      // Vehicles separated by ~150 meters
      const markers: MapMarkerItem[] = [
        {
          id: 'v1',
          plateNumber: '粤B·10001',
          vin: 'VIN00000000000001',
          model: 'Model 3',
          coordinates: { lat: 22.5428, lng: 113.9389 },
          status: 'ONLINE',
        },
        {
          id: 'v2',
          plateNumber: '粤B·10002',
          vin: 'VIN00000000000002',
          model: 'Model Y',
          coordinates: { lat: 22.5440, lng: 113.9400 },
          status: 'ONLINE',
        },
      ];

      // At low zoom (10), they cluster
      const lowZoom = clusterMarkers(markers, 80, 10);
      assert.equal(lowZoom.clusters.length, 1);
      assert.equal(lowZoom.singles.length, 0);

      // At high zoom (18), 150m is > 100 pixels apart, so they become singles
      const highZoom = clusterMarkers(markers, 40, 18);
      assert.equal(highZoom.clusters.length, 0);
      assert.equal(highZoom.singles.length, 2);
    });
  });

  describe('6. Pre-configured Seeds Integrity (SEED_MAP_VEHICLES)', () => {
    it('contains at least 8 vehicles with realistic Chinese telematics data', () => {
      assert.ok(SEED_MAP_VEHICLES.length >= 8);

      const statuses = new Set(SEED_MAP_VEHICLES.map((v) => v.status));
      assert.ok(statuses.has('ONLINE'), 'Must have ONLINE vehicles');
      assert.ok(statuses.has('OFFLINE'), 'Must have OFFLINE vehicles');
      assert.ok(statuses.has('ALARM'), 'Must have ALARM vehicles');
    });

    it('ensures each seed vehicle has valid coordinates, plates, VINs, and attributes', () => {
      const vinRegex = /^[A-HJ-NPR-Z0-9]{17}$/;
      const plateRegex = /^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领][A-Z][·\s]?[A-Z0-9]{5,6}$/;

      for (const veh of SEED_MAP_VEHICLES) {
        assert.ok(veh.id && veh.id.length > 0, 'Vehicle must have ID');
        assert.match(veh.plateNumber, plateRegex, `Invalid plate number format: ${veh.plateNumber}`);
        assert.match(veh.vin, vinRegex, `Invalid VIN format: ${veh.vin}`);
        assert.ok(veh.model && veh.model.length > 0, `Model must not be empty`);
        assert.ok(isInChina(veh.coordinates.lat, veh.coordinates.lng), `Coordinates must be in China: ${JSON.stringify(veh.coordinates)}`);

        if (veh.rawCoordinates) {
          assert.ok(isInChina(veh.rawCoordinates.lat, veh.rawCoordinates.lng), 'Raw coordinates must be in China');
        }

        if (veh.heading !== undefined) {
          assert.ok(veh.heading >= 0 && veh.heading <= 360, `Heading out of range: ${veh.heading}`);
        }

        if (veh.voltage !== undefined) {
          assert.ok(veh.voltage >= 10 && veh.voltage <= 15, `Voltage out of range: ${veh.voltage}`);
        }

        if (veh.speedKmh !== undefined) {
          assert.ok(veh.speedKmh >= 0 && veh.speedKmh <= 250, `Speed out of range: ${veh.speedKmh}`);
        }
      }
    });
  });

  describe('7. Module Entrypoint Export Completeness & MapContainer Component Signature', () => {
    it('verifies telemetry/index.ts exports all required GIS math, types, seeds, and MapContainer', async () => {
      const fs = await import('node:fs');
      const indexPath = new URL('../views/telemetry/index.ts', import.meta.url);
      assert.ok(fs.existsSync(indexPath), 'telemetry/index.ts must exist');

      const content = fs.readFileSync(indexPath, 'utf-8');
      assert.ok(content.includes("from './map-core.ts'"), 'Must re-export map-core.ts');
      assert.ok(content.includes("from './MapContainer.tsx'"), 'Must re-export MapContainer.tsx');

      const mapContainerPath = new URL('../views/telemetry/MapContainer.tsx', import.meta.url);
      assert.ok(fs.existsSync(mapContainerPath), 'MapContainer.tsx must exist');

      const containerContent = fs.readFileSync(mapContainerPath, 'utf-8');
      assert.ok(containerContent.includes('export const MapContainer: React.FC<MapContainerProps>'), 'Must export MapContainer component');
      assert.ok(containerContent.includes('export interface MapContainerProps'), 'Must export MapContainerProps');
    });
  });

  describe('8. Spatial Math & Edge Case Robustness', () => {
    it('returns zero heading when source and target coordinates are virtually identical', () => {
      const pt: Coordinates = { lat: 22.5428, lng: 113.9389 };
      assert.equal(calculateHeading(pt, { ...pt }), 0);
      assert.equal(calculateHeading(pt, { lat: 22.5428000001, lng: 113.9389000001 }), 0);
    });

    it('handles negative latitudes and longitudes correctly in Haversine distance', () => {
      const southPoleArea1: Coordinates = { lat: -70.0, lng: 20.0 };
      const southPoleArea2: Coordinates = { lat: -71.0, lng: 20.0 };
      const dist = calculateDistanceMeters(southPoleArea1, southPoleArea2);
      // 1 degree latitude difference ~= 111,195 meters
      assert.ok(Math.abs(dist - 111195) < 1000);
    });

    it('handles speed formatting with NaN or negative speeds', () => {
      assert.equal(formatSpeed(Number.NaN), '静止');
      assert.equal(formatSpeed(-0.5), '静止');
      assert.equal(formatSpeed(0.0), '静止');
      assert.equal(formatSpeed(0.1), '0.1 km/h');
    });
  });
});

