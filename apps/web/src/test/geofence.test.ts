import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  type Coordinates,
  type GeofenceDto,
  type GeofenceCircle,
  type GeofencePolygon,
  isPointInCircle,
  isPointInPolygon,
  isPointInGeofence,
  calculateCircleAreaKm2,
  calculatePolygonAreaKm2,
  validateGeofenceName,
  validateCircleRadius,
  validatePolygonVertices,
  formatGeofenceArea,
  filterGeofences,
  SEED_GEOFENCES,
} from '../views/telemetry/geofence-core.ts';
import {
  fetchGeofencesApi,
  fetchGeofenceDetailApi,
  createGeofenceApi,
  updateGeofenceApi,
  toggleGeofenceStatusApi,
  deleteGeofenceApi,
  resetInMemoryGeofences,
} from '../api/geofence.ts';
import { ApiError } from '../api/client.ts';

describe('Geofence Core GIS Spatial Algorithms & Validation Suite', () => {
  describe('1. Circular Collision Detection (isPointInCircle)', () => {
    const testCircle: GeofenceCircle = {
      center: { lat: 22.5428, lng: 113.9389 }, // Shenzhen High-Tech Park
      radiusMeters: 1000,
    };

    it('returns true when point is exactly at the circle center', () => {
      assert.equal(isPointInCircle(testCircle.center, testCircle), true);
    });

    it('returns true when point is well inside the circle radius', () => {
      // Offset by approx 200m north (~0.0018 deg lat)
      const insidePoint: Coordinates = { lat: 22.5446, lng: 113.9389 };
      assert.equal(isPointInCircle(insidePoint, testCircle), true);
    });

    it('returns false when point is clearly outside the circle radius', () => {
      // 5km away
      const outsidePoint: Coordinates = { lat: 22.585, lng: 113.95 };
      assert.equal(isPointInCircle(outsidePoint, testCircle), false);
    });

    it('handles boundary condition on or near perimeter with tolerance', () => {
      // Point approx 990m away (inside)
      const nearInside: Coordinates = { lat: 22.5517, lng: 113.9389 };
      assert.equal(isPointInCircle(nearInside, testCircle), true);

      // Point approx 1050m away (outside)
      const nearOutside: Coordinates = { lat: 22.553, lng: 113.9389 };
      assert.equal(isPointInCircle(nearOutside, testCircle), false);
    });
  });

  describe('2. Polygonal Collision Detection (isPointInPolygon - Ray-Casting)', () => {
    // Quadrilateral in Lujiazui, Shanghai
    const testPolygon: GeofencePolygon = {
      vertices: [
        { lat: 31.245, lng: 121.495 }, // Top-Left
        { lat: 31.245, lng: 121.505 }, // Top-Right
        { lat: 31.235, lng: 121.505 }, // Bottom-Right
        { lat: 31.235, lng: 121.495 }, // Bottom-Left
      ],
    };

    it('returns true for point strictly inside convex polygon', () => {
      const centerPoint: Coordinates = { lat: 31.24, lng: 121.5 };
      assert.equal(isPointInPolygon(centerPoint, testPolygon), true);
    });

    it('returns false for point outside polygon (north, south, east, west)', () => {
      assert.equal(isPointInPolygon({ lat: 31.25, lng: 121.5 }, testPolygon), false); // North
      assert.equal(isPointInPolygon({ lat: 31.23, lng: 121.5 }, testPolygon), false); // South
      assert.equal(isPointInPolygon({ lat: 31.24, lng: 121.51 }, testPolygon), false); // East
      assert.equal(isPointInPolygon({ lat: 31.24, lng: 121.49 }, testPolygon), false); // West
    });

    it('handles boundary vertex or edge gracefully', () => {
      const edgePoint: Coordinates = { lat: 31.245, lng: 121.5 };
      // Ray casting boundary inclusion or tolerance
      assert.equal(isPointInPolygon(edgePoint, testPolygon), true);
    });

    it('accurately tests concave (L-shaped) polygon inner vs outer reflex pocket', () => {
      // Concave L-shaped polygon
      const concavePolygon: GeofencePolygon = {
        vertices: [
          { lat: 10, lng: 10 },
          { lat: 10, lng: 20 },
          { lat: 15, lng: 20 },
          { lat: 15, lng: 15 },
          { lat: 20, lng: 15 },
          { lat: 20, lng: 10 },
        ],
      };

      // Inside the L bottom bar
      assert.equal(isPointInPolygon({ lat: 12, lng: 18 }, concavePolygon), true);
      // Inside the L left column
      assert.equal(isPointInPolygon({ lat: 18, lng: 12 }, concavePolygon), true);
      // In the reflex corner cut-out pocket (outside the L)
      assert.equal(isPointInPolygon({ lat: 18, lng: 18 }, concavePolygon), false);
    });

    it('returns false if polygon has fewer than 3 vertices', () => {
      assert.equal(isPointInPolygon({ lat: 10, lng: 10 }, { vertices: [] }), false);
      assert.equal(isPointInPolygon({ lat: 10, lng: 10 }, { vertices: [{ lat: 10, lng: 10 }] }), false);
      assert.equal(
        isPointInPolygon(
          { lat: 10, lng: 10 },
          {
            vertices: [
              { lat: 10, lng: 10 },
              { lat: 11, lng: 11 },
            ],
          }
        ),
        false
      );
    });
  });

  describe('3. Polymorphic Collision Dispatcher (isPointInGeofence)', () => {
    const circleFence = SEED_GEOFENCES.find((g) => g.type === 'CIRCLE')!;
    const polygonFence = SEED_GEOFENCES.find((g) => g.type === 'POLYGON')!;

    it('dispatches circle collision accurately', () => {
      assert.equal(isPointInGeofence(circleFence.circle!.center, circleFence), true);
      assert.equal(isPointInGeofence({ lat: 0, lng: 0 }, circleFence), false);
    });

    it('dispatches polygon collision accurately', () => {
      const v = polygonFence.polygon!.vertices;
      const center = {
        lat: (v[0].lat + v[1].lat + v[2].lat) / 3,
        lng: (v[0].lng + v[1].lng + v[2].lng) / 3,
      };
      assert.equal(isPointInGeofence(center, polygonFence), true);
      assert.equal(isPointInGeofence({ lat: 0, lng: 0 }, polygonFence), false);
    });

    it('returns false if geofence configuration is missing geometric payload', () => {
      const invalidFence: GeofenceDto = {
        ...circleFence,
        circle: undefined,
      };
      assert.equal(isPointInGeofence({ lat: 22, lng: 113 }, invalidFence), false);
    });
  });

  describe('4. Geodesic Area Calculations', () => {
    it('calculateCircleAreaKm2 calculates accurate area in km²', () => {
      // 1000m radius circle -> pi * 1^2 approx 3.14159 km²
      const area1000 = calculateCircleAreaKm2(1000);
      assert.ok(Math.abs(area1000 - 3.142) < 0.05);

      // 500m radius -> pi * 0.25 approx 0.785 km²
      const area500 = calculateCircleAreaKm2(500);
      assert.ok(Math.abs(area500 - 0.785) < 0.05);

      // 0 radius -> 0
      assert.equal(calculateCircleAreaKm2(0), 0);
    });

    it('calculatePolygonAreaKm2 calculates accurate planar/spherical area for quadrilateral', () => {
      // Square box near equator of 0.01 deg x 0.01 deg
      // 0.01 deg ~ 1.1132 km -> area ~ 1.1132 * 1.1132 ~ 1.239 km²
      const vertices: Coordinates[] = [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 0.01 },
        { lat: 0.01, lng: 0.01 },
        { lat: 0.01, lng: 0 },
      ];
      const area = calculatePolygonAreaKm2(vertices);
      assert.ok(area > 1.2 && area < 1.28);
    });

    it('calculatePolygonAreaKm2 returns 0 for fewer than 3 vertices', () => {
      assert.equal(calculatePolygonAreaKm2([]), 0);
      assert.equal(calculatePolygonAreaKm2([{ lat: 1, lng: 1 }]), 0);
      assert.equal(calculatePolygonAreaKm2([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }]), 0);
    });

    it('formatGeofenceArea formats square meters or square kilometers human-readably', () => {
      assert.ok(formatGeofenceArea(0.05).includes('m²'));
      assert.ok(formatGeofenceArea(3.1415).includes('3.14 km²'));
      assert.equal(formatGeofenceArea(0), '0 m²');
    });
  });

  describe('5. Input Validation & Parameter Guards', () => {
    describe('validateGeofenceName', () => {
      it('accepts valid 2~30 char names with Chinese, English, numbers, dashes', () => {
        assert.equal(validateGeofenceName('深圳高新科技园围栏').valid, true);
        assert.equal(validateGeofenceName('Fence-Zone_01').valid, true);
        assert.equal(validateGeofenceName('禁入区A').valid, true);
      });

      it('rejects empty, <2 chars or >30 chars names', () => {
        assert.equal(validateGeofenceName('').valid, false);
        assert.equal(validateGeofenceName(' ').valid, false);
        assert.equal(validateGeofenceName('A').valid, false);
        assert.equal(validateGeofenceName('A'.repeat(31)).valid, false);
      });

      it('rejects names with illegal script tags or dangerous symbols', () => {
        assert.equal(validateGeofenceName('<script>alert(1)</script>').valid, false);
      });
    });

    describe('validateCircleRadius', () => {
      it('accepts radius between 100m and 100,000m', () => {
        assert.equal(validateCircleRadius(100).valid, true);
        assert.equal(validateCircleRadius(1500).valid, true);
        assert.equal(validateCircleRadius(100000).valid, true);
      });

      it('rejects radius < 100m or > 100,000m or non-positive numbers', () => {
        assert.equal(validateCircleRadius(99).valid, false);
        assert.equal(validateCircleRadius(100001).valid, false);
        assert.equal(validateCircleRadius(-50).valid, false);
        assert.equal(validateCircleRadius(NaN).valid, false);
      });
    });

    describe('validatePolygonVertices', () => {
      it('accepts 3 or more valid vertices', () => {
        const valid3: Coordinates[] = [
          { lat: 22.5, lng: 113.9 },
          { lat: 22.6, lng: 114.0 },
          { lat: 22.5, lng: 114.1 },
        ];
        assert.equal(validatePolygonVertices(valid3).valid, true);
      });

      it('rejects fewer than 3 vertices', () => {
        assert.equal(validatePolygonVertices([]).valid, false);
        assert.equal(validatePolygonVertices([{ lat: 22.5, lng: 113.9 }]).valid, false);
        assert.equal(
          validatePolygonVertices([
            { lat: 22.5, lng: 113.9 },
            { lat: 22.6, lng: 114.0 },
          ]).valid,
          false
        );
      });

      it('rejects out of bounds latitude/longitude', () => {
        const invalidCoords: Coordinates[] = [
          { lat: 95.0, lng: 113.9 },
          { lat: 22.6, lng: 114.0 },
          { lat: 22.5, lng: 114.1 },
        ];
        assert.equal(validatePolygonVertices(invalidCoords).valid, false);
      });

      it('rejects degenerate/collinear vertices with near-zero area', () => {
        const collinear: Coordinates[] = [
          { lat: 22.5, lng: 113.9 },
          { lat: 22.5, lng: 113.9 },
          { lat: 22.5, lng: 113.9 },
        ];
        assert.equal(validatePolygonVertices(collinear).valid, false);
      });
    });
  });

  describe('6. Realistic Seed Geofences (SEED_GEOFENCES)', () => {
    it('contains at least 4 pre-configured realistic geofences', () => {
      assert.ok(SEED_GEOFENCES.length >= 4);
    });

    it('contains both CIRCLE and POLYGON fences with complete metadata', () => {
      const circleFence = SEED_GEOFENCES.find((g) => g.type === 'CIRCLE');
      const polygonFence = SEED_GEOFENCES.find((g) => g.type === 'POLYGON');

      assert.ok(circleFence);
      assert.ok(circleFence?.circle?.radiusMeters && circleFence.circle.radiusMeters >= 100);
      assert.ok(circleFence?.name);
      assert.ok(circleFence?.alarmLevel);
      assert.ok(circleFence?.triggerType);

      assert.ok(polygonFence);
      assert.ok(polygonFence?.polygon?.vertices && polygonFence.polygon.vertices.length >= 3);
      assert.ok(polygonFence?.name);
    });
  });

  describe('7. Geofence Filter & Search Pipeline (filterGeofences)', () => {
    it('filters by keyword in name or description', () => {
      const filtered = filterGeofences(SEED_GEOFENCES, { keyword: '深圳' });
      assert.ok(filtered.length > 0);
      assert.ok(filtered.every((g) => g.name.includes('深圳') || (g.description && g.description.includes('深圳'))));
    });

    it('filters by type (CIRCLE or POLYGON)', () => {
      const circles = filterGeofences(SEED_GEOFENCES, { type: 'CIRCLE' });
      assert.ok(circles.every((g) => g.type === 'CIRCLE'));

      const polygons = filterGeofences(SEED_GEOFENCES, { type: 'POLYGON' });
      assert.ok(polygons.every((g) => g.type === 'POLYGON'));
    });

    it('filters by status (ACTIVE or DISABLED)', () => {
      const activeOnly = filterGeofences(SEED_GEOFENCES, { status: 'ACTIVE' });
      assert.ok(activeOnly.every((g) => g.status === 'ACTIVE'));
    });
  });
});

describe('Geofence API Client & In-Memory Offline Storage (api/geofence.ts)', () => {
  beforeEach(() => {
    resetInMemoryGeofences();
  });

  it('fetchGeofencesApi returns initial seeds in offline fallback', async () => {
    const list = await fetchGeofencesApi();
    assert.equal(list.length, SEED_GEOFENCES.length);
    assert.equal(list[0].id, SEED_GEOFENCES[0].id);
  });

  it('fetchGeofenceDetailApi returns item by ID or throws 404', async () => {
    const first = SEED_GEOFENCES[0];
    const detail = await fetchGeofenceDetailApi(first.id);
    assert.equal(detail.id, first.id);
    assert.equal(detail.name, first.name);

    await assert.rejects(async () => {
      await fetchGeofenceDetailApi('non-existent-id');
    });
  });

  it('createGeofenceApi adds new geofence to in-memory store', async () => {
    const newFence = await createGeofenceApi({
      tenantId: 'tenant-001',
      projectId: 'proj-001',
      name: '测试测试新建电子围栏',
      type: 'CIRCLE',
      circle: {
        center: { lat: 22.53, lng: 113.94 },
        radiusMeters: 800,
      },
      triggerType: 'IN',
      alarmLevel: 'WARNING',
      status: 'ACTIVE',
      boundVehicleCount: 3,
      description: '单元测试新建',
    });

    assert.ok(newFence.id);
    assert.equal(newFence.name, '测试测试新建电子围栏');

    const updatedList = await fetchGeofencesApi();
    assert.equal(updatedList.length, SEED_GEOFENCES.length + 1);
    assert.ok(updatedList.find((g) => g.id === newFence.id));
  });

  it('updateGeofenceApi modifies existing geofence fields', async () => {
    const first = SEED_GEOFENCES[0];
    const updated = await updateGeofenceApi(first.id, {
      name: '深圳高新区核心禁出围栏-更新版',
      alarmLevel: 'CRITICAL',
    });

    assert.equal(updated.name, '深圳高新区核心禁出围栏-更新版');
    assert.equal(updated.alarmLevel, 'CRITICAL');

    const retrieved = await fetchGeofenceDetailApi(first.id);
    assert.equal(retrieved.name, '深圳高新区核心禁出围栏-更新版');
  });

  it('toggleGeofenceStatusApi switches between ACTIVE and DISABLED', async () => {
    const first = SEED_GEOFENCES[0];
    const initialStatus = first.status;
    const targetStatus = initialStatus === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';

    const toggled = await toggleGeofenceStatusApi(first.id, targetStatus);
    assert.equal(toggled.status, targetStatus);

    const reChecked = await fetchGeofenceDetailApi(first.id);
    assert.equal(reChecked.status, targetStatus);
  });

  it('deleteGeofenceApi removes fence from in-memory pool', async () => {
    const first = SEED_GEOFENCES[0];
    const res = await deleteGeofenceApi(first.id);
    assert.equal(res.success, true);

    const list = await fetchGeofencesApi();
    assert.equal(list.find((g) => g.id === first.id), undefined);
    assert.equal(list.length, SEED_GEOFENCES.length - 1);
  });

  it('instantiates ApiError correctly with statusCode and details', () => {
    const err = new ApiError('Forbidden', 403, 'FORBIDDEN', { reason: 'Unauthorized' });
    assert.equal(err.statusCode, 403);
    assert.equal(err.name, 'ApiError');
    assert.equal(err.message, 'Forbidden');
  });
});
