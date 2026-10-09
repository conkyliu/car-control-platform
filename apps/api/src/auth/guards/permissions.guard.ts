import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission, UserTokenPayload } from '@car-control/contracts';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()]
    );

    // 未标注权限要求的公开或只要登录的接口放行
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const user: UserTokenPayload = req.user;

    if (!user || !user.permissions) {
      throw new ForbiddenException('Forbidden: User has no permissions');
    }

    const hasAll = requiredPermissions.every((perm) =>
      user.permissions.includes(perm)
    );

    if (!hasAll) {
      throw new ForbiddenException(
        `Forbidden: Missing required permission [${requiredPermissions.join(', ')}]`
      );
    }

    return true;
  }
}
