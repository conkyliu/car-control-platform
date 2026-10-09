/**
 * 遥测定位与轨迹相关契约 DTO 与类型定义
 */

/**
 * 终端 GPS/GNSS 上报经纬度报文结构
 */
export interface TelemetryLocationPayload {
  lat: number;
  lng: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  satellites?: number;
  gpsValid: boolean;
  timestamp: number;
  mileage?: number;
  extra?: Record<string, unknown>;
}

/**
 * 历史轨迹查询参数 DTO
 */
export interface TrajectoryQueryDto {
  startTime: string | Date;
  endTime: string | Date;
  tolerance?: number;
}

/**
 * Douglas-Peucker 抽稀后轨迹响应 DTO
 */
export interface SimplifiedTrajectoryDto {
  vehicleId: string;
  points: TelemetryLocationPayload[];
  originalCount?: number;
  simplifiedCount?: number;
  compressionRatio?: number;
  tolerance?: number;
  startTime?: string | Date;
  endTime?: string | Date;
}

/**
 * 常用抽稀容差常数（单位：经纬度度数）
 * 遵循 docs/specs/telemetry.md 规范
 */
export enum TrajectoryTolerance {
  HIGH_PRECISION = 0.00003, // 约 3.3 米，事故分析、窄路转弯微观复现
  DEFAULT = 0.0001,        // 约 11.1 米，日常行车轨迹回放默认值
  OVERVIEW = 0.0005,       // 约 55.5 米，长途货运概览、极小缩略图
}
