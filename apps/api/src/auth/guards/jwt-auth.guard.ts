import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth.service.js';
import { TenantContext } from '@car-control/database';
import { RoleCode } from '@car-control/contracts';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];

    if (!authHeader || typeof authHeader !== 'string') {
      throw new UnauthorizedException('Authorization header missing');
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid authorization token format (Bearer required)');
    }

    const payload = this.authService.validateToken(token);
    req.user = payload;

    // 绑定租户上下文（优先使用 token 内租户，平台管理员支持通过 header 显式切换上下文）
    const headerTenantId = (req.headers['x-tenant-id'] || req.headers['X-Tenant-Id']) as string | undefined;
    const isSuperAdmin = payload.roles?.includes(RoleCode.SUPER_ADMIN);
    const tenantId = (isSuperAdmin && headerTenantId) ? headerTenantId : (payload.tenantId || headerTenantId || 'TENANT_DEFAULT');

    TenantContext.enter({
      tenantId,
      userId: payload.sub,
      roles: payload.roles,
    });

    return true;
  }
}
