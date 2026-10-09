import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth.service.js';
import { TenantContext } from '@car-control/database';

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

    // 绑定租户上下文
    TenantContext.run(
      {
        tenantId: payload.tenantId,
        userId: payload.sub,
        roles: payload.roles,
      },
      () => {}
    );

    return true;
  }
}
