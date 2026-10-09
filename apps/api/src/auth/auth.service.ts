import { Injectable, UnauthorizedException } from '@nestjs/common';
import crypto from 'node:crypto';
import {
  LoginRequestDto,
  LoginResponseDto,
  RefreshTokenRequestDto,
  UserTokenPayload,
} from '@car-control/contracts';
import { loadEnvironmentConfig } from '@car-control/config';
import { UserService } from '../user/user.service.js';
import { TenantService } from '../tenant/tenant.service.js';
import { AuditService } from '../audit/audit.service.js';
import { PasswordUtil } from './password.util.js';
import { JwtUtil } from './jwt.util.js';

@Injectable()
export class AuthService {
  private readonly config = loadEnvironmentConfig();
  private readonly ACCESS_TOKEN_TTL = 900; // 15 分钟
  private readonly REFRESH_TOKEN_TTL = 7 * 24 * 3600; // 7 天

  // 白名单/活跃 Refresh Token 存储，用于轮换与防重放
  private activeRefreshTokens: Map<string, { userId: string; tenantId: string }> = new Map();

  constructor(
    private readonly userService: UserService,
    private readonly tenantService: TenantService,
    private readonly auditService: AuditService
  ) {}

  /**
   * 用户登录获取双 Token
   */
  async login(dto: LoginRequestDto, ipAddress?: string): Promise<LoginResponseDto> {
    const user = this.userService.findByUsername(dto.username);
    if (!user) {
      throw new UnauthorizedException('Invalid username or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is disabled');
    }

    const tenant = this.tenantService.getTenant(user.tenantId);
    if (tenant.status !== 'ACTIVE') {
      throw new UnauthorizedException('Tenant is suspended or disabled');
    }

    const isValidPassword = PasswordUtil.verifyPassword(dto.password, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const payload: UserTokenPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      username: user.username,
      roles: user.roles,
      permissions: user.permissions,
    };

    const accessToken = JwtUtil.sign(payload, this.config.JWT_SECRET, this.ACCESS_TOKEN_TTL);
    const refreshToken = JwtUtil.sign(
      { ...payload, permissions: [], jti: crypto.randomUUID() }, // refresh token 不带权限，带唯一 jti
      this.config.JWT_SECRET,
      this.REFRESH_TOKEN_TTL
    );

    this.activeRefreshTokens.set(refreshToken, { userId: user.id, tenantId: user.tenantId });

    // 记录审计日志
    this.auditService.logAction({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'USER_LOGIN',
      resourceType: 'AUTH',
      resourceId: user.id,
      details: { username: user.username },
      ipAddress,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.ACCESS_TOKEN_TTL,
      user: {
        id: user.id,
        tenantId: user.tenantId,
        username: user.username,
        roles: user.roles,
        permissions: user.permissions,
      },
    };
  }

  /**
   * 使用 Refresh Token 安全轮换获取新 Token 对
   */
  async refresh(dto: RefreshTokenRequestDto): Promise<LoginResponseDto> {
    const session = this.activeRefreshTokens.get(dto.refreshToken);
    if (!session) {
      throw new UnauthorizedException('Invalid or revoked refresh token');
    }

    const payload = JwtUtil.verify(dto.refreshToken, this.config.JWT_SECRET);
    if (!payload) {
      this.activeRefreshTokens.delete(dto.refreshToken);
      throw new UnauthorizedException('Refresh token has expired or is invalid');
    }

    const user = this.userService.findById(session.userId);
    if (!user || user.status !== 'ACTIVE') {
      this.activeRefreshTokens.delete(dto.refreshToken);
      throw new UnauthorizedException('User account is invalid');
    }

    // 轮换：吊销旧 Token
    this.activeRefreshTokens.delete(dto.refreshToken);

    const newPayload: UserTokenPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      username: user.username,
      roles: user.roles,
      permissions: user.permissions,
    };

    const newAccessToken = JwtUtil.sign(newPayload, this.config.JWT_SECRET, this.ACCESS_TOKEN_TTL);
    const newRefreshToken = JwtUtil.sign(
      { ...newPayload, permissions: [], jti: crypto.randomUUID() },
      this.config.JWT_SECRET,
      this.REFRESH_TOKEN_TTL
    );

    this.activeRefreshTokens.set(newRefreshToken, { userId: user.id, tenantId: user.tenantId });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: this.ACCESS_TOKEN_TTL,
      user: {
        id: user.id,
        tenantId: user.tenantId,
        username: user.username,
        roles: user.roles,
        permissions: user.permissions,
      },
    };
  }

  /**
   * 验签 Access Token 并返回解密载荷
   */
  validateToken(token: string): UserTokenPayload {
    const payload = JwtUtil.verify(token, this.config.JWT_SECRET);
    if (!payload) {
      throw new UnauthorizedException('Token is invalid or expired');
    }
    return payload;
  }
}
