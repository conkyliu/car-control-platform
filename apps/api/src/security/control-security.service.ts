import {
  Injectable,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { SecurityLevel, CommandCode } from '@car-control/contracts';
import { Vehicle } from '@car-control/domain-types';

@Injectable()
export class ControlSecurityService {
  // 模拟记录每辆车每指令上次执行时间 (vehicleId:commandCode -> timestamp)
  private lastExecutedAt: Map<string, number> = new Map();

  // 默认演示安全码与 L2 确认令牌（实际生产中可结合短信/TOTP/双重密码）
  private validSecurityCode = '666888';
  private validConfirmationToken = 'SEC_CONFIRM_TOKEN_L2';

  /**
   * 校验 L0 / L1 / L2 安全等级要求
   */
  verifySecurityLevel(
    level: SecurityLevel,
    securityCode?: string,
    confirmationToken?: string
  ): void {
    if (level === SecurityLevel.L0) {
      return;
    }

    if (level === SecurityLevel.L1) {
      if (!securityCode) {
        throw new ForbiddenException('[Security L1] Security code required for this operation');
      }
      if (securityCode !== this.validSecurityCode) {
        throw new ForbiddenException('[Security L1] Invalid security code');
      }
      return;
    }

    if (level === SecurityLevel.L2) {
      if (!confirmationToken) {
        throw new ForbiddenException('[Security L2] Strong confirmation token required for high-risk operation');
      }
      if (confirmationToken !== this.validConfirmationToken) {
        throw new ForbiddenException('[Security L2] Invalid or expired confirmation token');
      }
      return;
    }
  }

  /**
   * 滑动窗口频次限制防抖检查 (Rate Limiting)
   * 仅做校验，不更新执行时间戳
   */
  checkRateLimit(vehicleId: string, commandCode: CommandCode, limitSeconds: number): void {
    const key = `${vehicleId}:${commandCode}`;
    const now = Date.now();
    const lastTime = this.lastExecutedAt.get(key);

    if (lastTime && now - lastTime < limitSeconds * 1000) {
      const waitSec = Math.ceil((limitSeconds * 1000 - (now - lastTime)) / 1000);
      throw new HttpException(
        `[Rate Limited] Command ${commandCode} cooldown active, please wait ${waitSec}s`,
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
  }

  /**
   * 记录指令执行时间戳 (在验证通过并确认下发后调用)
   */
  recordRateLimit(vehicleId: string, commandCode: CommandCode): void {
    const key = `${vehicleId}:${commandCode}`;
    this.lastExecutedAt.set(key, Date.now());
  }

  /**
   * 清除频次限制记录 (便于测试与重置)
   */
  clearRateLimit(vehicleId?: string, commandCode?: CommandCode): void {
    if (vehicleId && commandCode) {
      this.lastExecutedAt.delete(`${vehicleId}:${commandCode}`);
    } else {
      this.lastExecutedAt.clear();
    }
  }

  /**
   * 车辆运营与风控状态检查
   */
  checkVehicleOperatingState(vehicle: Vehicle, commandCode: CommandCode): void {
    if (vehicle.status === 'SCRAPPED') {
      throw new ForbiddenException('Cannot control a scrapped vehicle');
    }

    if (vehicle.status === 'LOCKED') {
      // 被风控锁死的车辆只允许鸣笛寻车，禁止任何解锁或点火
      if (commandCode !== CommandCode.CMD_FIND_VEHICLE) {
        throw new ForbiddenException(
          `Vehicle ${vehicle.vin} is currently LOCKED by platform risk control. Control prohibited.`
        );
      }
    }

    if (vehicle.status === 'MAINTENANCE') {
      // 维保检修中的车辆禁止远程启动发动机
      if (commandCode === CommandCode.CMD_ENGINE_START) {
        throw new ForbiddenException(
          `Vehicle ${vehicle.vin} is under MAINTENANCE. Engine start is prohibited for safety.`
        );
      }
    }
  }
}
