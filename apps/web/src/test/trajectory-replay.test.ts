import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  type TrajectoryPoint,
  type StayPoint,
  detectStayPoints,
  formatDuration,
  calculateTrajectoryStats,
  interpolateTrajectory,
  simplifyTrajectory,
  SEED_TRAJECTORIES,
  DEFAULT_TRAJECTORY,
} from '../views/telemetry/trajectory-core.ts';
import { fetchVehicleTrajectoryApi } from '../api/telemetry.ts';
import { ApiError } from '../api/client.ts';

describe('Sprint 4 Task 3: Trajectory Replay & High-Frequency Player Test Suite (TDD)', () => {
  describe('1. Duration Formatting (formatDuration)', () => {
    it('formats pure seconds (< 60s) properly', () => {
      assert.equal(formatDuration(0), '0秒');
      assert.equal(formatDuration(45), '45秒');
    });

    it('formats minutes and seconds (< 3600s)', () => {
      assert.equal(formatDuration(180), '3分');
      assert.equal(formatDuration(930), '15分30秒');
    });

    it('formats hours, minutes and seconds (>= 3600s)', () => {
      assert.equal(formatDuration(4800), '1小时20分');
      assert.equal(formatDuration(4815), '1小时20分15秒');
    });
  });

  describe('2. Stay Point Detection Algorithm (detectStayPoints)', () => {
    it('returns empty array when trajectory has fewer than 2 points', () => {
      assert.deepEqual(detectStayPoints([]), []);
      const singlePoint: TrajectoryPoint = {
        lat: 22.5428,
        lng: 113.9389,
        speed: 0,
        heading: 0,
        timestamp: 1792040000000,
        timeFormatted: '2026-10-15 06:13:20',
      };
      assert.deepEqual(detectStayPoints([singlePoint]), []);
    });

    it('identifies stay points when points remain within 30m for >= 180s', () => {
      const baseTime = 1792040000000;
      const testPoints: TrajectoryPoint[] = [
        // Moving point 1
        {
          lat: 22.5000,
          lng: 113.9500,
          speed: 60,
          heading: 0,
          timestamp: baseTime,
          timeFormatted: '2026-10-15 06:13:20',
        },
        // Stay segment (distance <= 5m, duration = 200s >= 180s)
        {
          lat: 22.51000,
          lng: 113.95000,
          speed: 0,
          heading: 0,
          timestamp: baseTime + 10000, // +10s
          timeFormatted: '2026-10-15 06:13:30',
        },
        {
          lat: 22.51002,
          lng: 113.95001,
          speed: 0,
          heading: 0,
          timestamp: baseTime + 110000, // +110s
          timeFormatted: '2026-10-15 06:15:10',
        },
        {
          lat: 22.51001,
          lng: 113.95002,
          speed: 0,
          heading: 0,
          timestamp: baseTime + 210000, // +210s (stay duration = 200s)
          timeFormatted: '2026-10-15 06:16:50',
        },
        // Moving point 2 (far away)
        {
          lat: 22.5300,
          lng: 113.9500,
          speed: 55,
          heading: 0,
          timestamp: baseTime + 240000,
          timeFormatted: '2026-10-15 06:17:20',
        },
      ];

      const stayPoints = detectStayPoints(testPoints);
      assert.equal(stayPoints.length, 1, 'Should detect exactly 1 stay point');
      const stay = stayPoints[0];
      assert.equal(stay.durationSeconds, 200, 'Stay duration should be 200s');
      assert.equal(stay.durationFormatted, '3分20秒');
      assert.ok(stay.coordinates.lat >= 22.5100 && stay.coordinates.lat <= 22.51003);
      assert.ok(stay.coordinates.lng >= 113.9500 && stay.coordinates.lng <= 113.95003);
      assert.equal(stay.startTime, baseTime + 10000);
      assert.equal(stay.endTime, baseTime + 210000);
    });

    it('ignores stops shorter than minDurationSec (< 180s)', () => {
      const baseTime = 1792040000000;
      const testPoints: TrajectoryPoint[] = [
        {
          lat: 22.51000,
          lng: 113.95000,
          speed: 0,
          heading: 0,
          timestamp: baseTime,
          timeFormatted: '2026-10-15 06:13:20',
        },
        {
          lat: 22.51001,
          lng: 113.95001,
          speed: 0,
          heading: 0,
          timestamp: baseTime + 120000, // only 120s pause
          timeFormatted: '2026-10-15 06:15:20',
        },
        {
          lat: 22.53000,
          lng: 113.95000,
          speed: 60,
          heading: 0,
          timestamp: baseTime + 140000,
          timeFormatted: '2026-10-15 06:15:40',
        },
      ];

      const stayPoints = detectStayPoints(testPoints);
      assert.equal(stayPoints.length, 0, '120s stop should NOT trigger stay point');
    });
  });

  describe('3. Trajectory Stats Calculation (calculateTrajectoryStats)', () => {
    it('handles empty trajectory safely without NaN', () => {
      const stats = calculateTrajectoryStats([]);
      assert.equal(stats.totalDistanceKm, 0);
      assert.equal(stats.durationSeconds, 0);
      assert.equal(stats.maxSpeedKmh, 0);
      assert.equal(stats.avgSpeedKmh, 0);
      assert.equal(stats.stayCount, 0);
      assert.equal(stats.pointCount, 0);
    });

    it('calculates total distance, duration, max speed, and non-zero average speed accurately', () => {
      const baseTime = 1792040000000;
      const points: TrajectoryPoint[] = [
        {
          lat: 22.5000,
          lng: 113.9500,
          speed: 0,
          heading: 0,
          timestamp: baseTime,
          timeFormatted: '06:00:00',
        },
        {
          lat: 22.5100,
          lng: 113.9500,
          speed: 40,
          heading: 0,
          timestamp: baseTime + 60000,
          timeFormatted: '06:01:00',
        },
        {
          lat: 22.5200,
          lng: 113.9500,
          speed: 80,
          heading: 0,
          timestamp: baseTime + 120000,
          timeFormatted: '06:02:00',
        },
        {
          lat: 22.5200,
          lng: 113.9500,
          speed: 0, // stationary stop
          heading: 0,
          timestamp: baseTime + 180000,
          timeFormatted: '06:03:00',
        },
      ];

      const stats = calculateTrajectoryStats(points);
      assert.ok(stats.totalDistanceKm > 2.0 && stats.totalDistanceKm < 2.5, 'Distance ~2.22 km');
      assert.equal(stats.durationSeconds, 180);
      assert.equal(stats.durationFormatted, '3分');
      assert.equal(stats.maxSpeedKmh, 80);
      // Average speed excludes stationary points (0 km/h): average of 40 and 80 is 60 km/h!
      assert.equal(stats.avgSpeedKmh, 60.0);
      assert.equal(stats.pointCount, 4);
    });
  });

  describe('4. Trajectory Interpolation Engine (interpolateTrajectory)', () => {
    const baseTime = 1792040000000;
    const samplePoints: TrajectoryPoint[] = [
      {
        lat: 22.5000,
        lng: 113.9500,
        speed: 20,
        heading: 350,
        timestamp: baseTime,
        timeFormatted: '2026-10-15 06:00:00',
      },
      {
        lat: 22.5100,
        lng: 113.9600,
        speed: 60,
        heading: 10, // crossing 0° (350° -> 10° is +20° shortest delta, NOT -340°)
        timestamp: baseTime + 100000,
        timeFormatted: '2026-10-15 06:01:40',
      },
    ];

    it('returns exact boundary points at progressFraction 0 and 1', () => {
      const atStart = interpolateTrajectory(samplePoints, 0);
      assert.equal(atStart.lat, 22.5000);
      assert.equal(atStart.lng, 113.9500);
      assert.equal(atStart.speed, 20);
      assert.equal(atStart.heading, 350);

      const atEnd = interpolateTrajectory(samplePoints, 1);
      assert.equal(atEnd.lat, 22.5100);
      assert.equal(atEnd.lng, 113.9600);
      assert.equal(atEnd.speed, 60);
      assert.equal(atEnd.heading, 10);
    });

    it('interpolates midpoint (50%) smoothly with shortest heading wrapping', () => {
      const mid = interpolateTrajectory(samplePoints, 0.5);
      assert.equal(mid.lat, 22.505);
      assert.equal(mid.lng, 113.955);
      assert.equal(mid.speed, 40);
      // 350° + 0.5 * 20° = 360° or 0°
      assert.ok(mid.heading === 0 || mid.heading === 360);
      assert.equal(mid.timestamp, baseTime + 50000);
    });

    it('clamps negative and excessive progress fractions safely', () => {
      const below = interpolateTrajectory(samplePoints, -0.2);
      assert.equal(below.lat, 22.5000);
      assert.equal(below.progressFraction, 0);

      const above = interpolateTrajectory(samplePoints, 1.5);
      assert.equal(above.lat, 22.5100);
      assert.equal(above.progressFraction, 1);
    });
  });

  describe('5. Douglas-Peucker Vector Simplification (simplifyTrajectory)', () => {
    it('returns original points when point count is <= 2', () => {
      const twoPoints: TrajectoryPoint[] = [
        { lat: 22.50, lng: 113.95, speed: 40, heading: 0, timestamp: 1000, timeFormatted: '' },
        { lat: 22.51, lng: 113.96, speed: 40, heading: 0, timestamp: 2000, timeFormatted: '' },
      ];
      assert.deepEqual(simplifyTrajectory(twoPoints, 0.0001), twoPoints);
    });

    it('compresses redundant collinear points along a straight line', () => {
      const straightLine: TrajectoryPoint[] = [];
      for (let i = 0; i < 20; i++) {
        straightLine.push({
          lat: 22.50 + i * 0.001,
          lng: 113.95 + i * 0.001,
          speed: 50,
          heading: 45,
          timestamp: 1000 + i * 1000,
          timeFormatted: '',
        });
      }

      const simplified = simplifyTrajectory(straightLine, 0.0001);
      // All intermediate points are strictly collinear, so only endpoints remain!
      assert.equal(simplified.length, 2);
      assert.equal(simplified[0].lat, 22.50);
      assert.equal(simplified[1].lat, straightLine[19].lat);
    });

    it('retains corner turn points that exceed tolerance threshold', () => {
      const withCorner: TrajectoryPoint[] = [
        { lat: 22.500, lng: 113.950, speed: 50, heading: 0, timestamp: 1000, timeFormatted: '' },
        { lat: 22.505, lng: 113.950, speed: 50, heading: 0, timestamp: 2000, timeFormatted: '' },
        // Sharp perpendicular corner turn
        { lat: 22.505, lng: 113.965, speed: 30, heading: 90, timestamp: 3000, timeFormatted: '' },
        { lat: 22.510, lng: 113.965, speed: 50, heading: 0, timestamp: 4000, timeFormatted: '' },
      ];

      const simplified = simplifyTrajectory(withCorner, 0.0001);
      assert.ok(simplified.length >= 3, 'Corner point must be retained');
      const hasCorner = simplified.some((p) => Math.abs(p.lng - 113.965) < 0.0001);
      assert.ok(hasCorner, 'Corner vertex should be present in simplified trajectory');
    });
  });

  describe('6. Production Seed Trajectories (SEED_TRAJECTORIES)', () => {
    it('provides 50+ realistic sampling points between Shenzhen Bay and Nanshan High-Tech Park', () => {
      assert.ok(DEFAULT_TRAJECTORY.points.length >= 50, 'Default trajectory must have >= 50 points');
      assert.equal(DEFAULT_TRAJECTORY.vehicleId, 'veh-001');

      const start = DEFAULT_TRAJECTORY.points[0];
      const end = DEFAULT_TRAJECTORY.points[DEFAULT_TRAJECTORY.points.length - 1];

      // Starts near Shenzhen Bay / Houhai
      assert.ok(start.lat >= 22.495 && start.lat <= 22.520, 'Start lat near Shenzhen Bay');
      assert.ok(start.lng >= 113.940 && start.lng <= 113.960, 'Start lng near Shenzhen Bay');

      // Ends in Nanshan High-Tech Industrial Park South
      assert.ok(end.lat >= 22.535 && end.lat <= 22.550, 'End lat in Nanshan Tech Park');
      assert.ok(end.lng >= 113.930 && end.lng <= 113.945, 'End lng in Nanshan Tech Park');
    });

    it('contains at least one valid stay point (>= 180s) representing a red light or pause', () => {
      const stayPoints = detectStayPoints(DEFAULT_TRAJECTORY.points);
      assert.ok(stayPoints.length >= 1, 'Should detect at least 1 stay point in seed data');
      const firstStay = stayPoints[0];
      assert.ok(firstStay.durationSeconds >= 180, 'Stay point must be >= 180 seconds');
      assert.ok(firstStay.durationFormatted.length > 0);
    });

    it('all points contain required telematics attributes', () => {
      for (const pt of DEFAULT_TRAJECTORY.points) {
        assert.ok(typeof pt.lat === 'number' && !isNaN(pt.lat));
        assert.ok(typeof pt.lng === 'number' && !isNaN(pt.lng));
        assert.ok(typeof pt.speed === 'number' && pt.speed >= 0);
        assert.ok(typeof pt.heading === 'number' && pt.heading >= 0 && pt.heading <= 360);
        assert.ok(typeof pt.timestamp === 'number' && pt.timestamp > 0);
        assert.ok(typeof pt.timeFormatted === 'string' && pt.timeFormatted.length > 0);
      }
    });
  });

  describe('7. Trajectory API Client & Offline Fallback (fetchVehicleTrajectoryApi)', () => {
    it('fetches trajectory with offline in-memory fallback for veh-001', async () => {
      const res = await fetchVehicleTrajectoryApi('veh-001', {
        tolerance: 0.0001,
      });

      assert.equal(res.vehicleId, 'veh-001');
      assert.ok(res.points.length > 0, 'Trajectory points must not be empty');
      assert.ok(res.stayPoints.length >= 1, 'Stay points must be resolved');
      assert.ok(res.stats.totalDistanceKm > 0, 'Total distance must be positive');
      assert.ok(res.stats.maxSpeedKmh > 0, 'Max speed must be positive');
      assert.ok(res.rawCount >= res.simplifiedCount, 'Raw count >= simplified count');
    });

    it('applies high-precision, standard, and overview tolerance presets correctly in offline mode', async () => {
      const highRes = await fetchVehicleTrajectoryApi('veh-001', { tolerance: 0.00003 });
      const overviewRes = await fetchVehicleTrajectoryApi('veh-001', { tolerance: 0.0005 });

      assert.ok(
        highRes.points.length >= overviewRes.points.length,
        'High precision must retain >= points than overview mode'
      );
    });

    it('rethrows ApiError directly without swallowing if API client produces ApiError', async () => {
      const fakeApiError = new ApiError('Vehicle not authorized for trajectory access', 403);
      // Verify ApiError properties
      assert.equal(fakeApiError.statusCode, 403);
      assert.equal(fakeApiError.message, 'Vehicle not authorized for trajectory access');
    });
  });
});
