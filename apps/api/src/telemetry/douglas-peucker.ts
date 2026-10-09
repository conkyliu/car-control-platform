import {
  TelemetryLocationPayload,
  TrajectoryTolerance,
} from '@car-control/contracts';

/**
 * 计算点 P(lng, lat) 到线段 P1(lng, lat) - P2(lng, lat) 的几何垂直距离（经纬度坐标空间，单位：度）
 */
function perpendicularDistance(
  point: TelemetryLocationPayload,
  lineStart: TelemetryLocationPayload,
  lineEnd: TelemetryLocationPayload
): number {
  const x0 = point.lng;
  const y0 = point.lat;
  const x1 = lineStart.lng;
  const y1 = lineStart.lat;
  const x2 = lineEnd.lng;
  const y2 = lineEnd.lat;

  const dx = x2 - x1;
  const dy = y2 - y1;

  // 起止点重合，退化为点到点几何距离
  if (dx === 0 && dy === 0) {
    return Math.hypot(x0 - x1, y0 - y1);
  }

  // 点 (x0, y0) 到直线 Ax + By + C = 0 的距离
  // 其中直线方程经过 (x1, y1) 和 (x2, y2):
  // (y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1 = 0
  const numerator = Math.abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1);
  const denominator = Math.hypot(dx, dy);

  return numerator / denominator;
}

/**
 * Douglas-Peucker 经典分治递归矢量抽稀算法
 *
 * 核心规则:
 * 1. 首尾两端点严格强制保留；
 * 2. 寻找中间各点到基线段的最大几何垂直偏差距离；
 * 3. 若最大偏差大于容差 epsilon，则以该点为基准分治递归处理左右两段；
 * 4. 若最大偏差小于等于容差 epsilon，则舍弃全部中间点，仅保留基线段首尾点。
 *
 * @param points 原始连续 GPS/GNSS 时序轨迹点序列
 * @param tolerance 容差阈值（单位：经纬度度数，默认 0.0001 约 11.1 米）
 * @returns 抽稀后的特征轨迹点序列
 */
export function douglasPeucker(
  points: TelemetryLocationPayload[],
  tolerance: number = TrajectoryTolerance.DEFAULT
): TelemetryLocationPayload[] {
  if (points.length <= 2) {
    return [...points];
  }

  let maxDistance = 0;
  let maxIndex = 0;

  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last);
    if (dist > maxDistance) {
      maxDistance = dist;
      maxIndex = i;
    }
  }

  if (maxDistance > tolerance) {
    // 递归分治处理左右两段
    const leftSub = douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
    const rightSub = douglasPeucker(points.slice(maxIndex), tolerance);
    // 合并结果并去除中间重复的分割点
    return leftSub.slice(0, -1).concat(rightSub);
  } else {
    // 中间点全部共线或在容差范围内，直接丢弃，保留首尾点
    return [first, last];
  }
}
