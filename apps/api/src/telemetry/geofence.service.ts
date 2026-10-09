import { Injectable } from '@nestjs/common';

export interface GeofenceCircle {
  centerLat: number;
  centerLng: number;
  radiusMeters: number;
}

export interface GeofencePoint {
  lat: number;
  lng: number;
}

@Injectable()
export class GeofenceService {
  /** 地球平均半径（单位：米） */
  private static readonly EARTH_RADIUS_METERS = 6371000;

  /**
   * 使用 Haversine 大圆距离公式计算两个经纬度点之间的球面距离（米）
   */
  calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;

    const lat1Rad = (lat1 * Math.PI) / 180;
    const lat2Rad = (lat2 * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const clampedA = Math.max(0, Math.min(1, a));
    const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));

    return GeofenceService.EARTH_RADIUS_METERS * c;
  }

  /**
   * 判定目标经纬度点是否在圆形电子围栏内（包含边界）
   *
   * @param circle 圆形电子围栏参数（圆心纬度、经度、半径米）
   * @param point 待判定的定位点
   * @returns true: 在围栏内或边界上; false: 在围栏外
   */
  checkGeofence(circle: GeofenceCircle, point: GeofencePoint): boolean {
    const distance = this.calculateDistance(
      circle.centerLat,
      circle.centerLng,
      point.lat,
      point.lng
    );
    return distance <= circle.radiusMeters;
  }
}
