import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  Headers,
} from '@nestjs/common';
import {
  LoginRequestDto,
  LoginResponseDto,
  RefreshTokenRequestDto,
  Permission,
} from '@car-control/contracts';
import { AuthService } from './auth.service.js';
import { AuditService } from '../audit/audit.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { PermissionsGuard } from './guards/permissions.guard.js';
import { RequirePermissions } from './decorators/permissions.decorator.js';

@Controller('api/v1')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly auditService: AuditService
  ) {}

  @Post('auth/login')
  async login(
    @Body() dto: LoginRequestDto,
    @Headers('x-forwarded-for') ip?: string
  ): Promise<LoginResponseDto> {
    return this.authService.login(dto, ip);
  }

  @Post('auth/refresh')
  async refresh(@Body() dto: RefreshTokenRequestDto): Promise<LoginResponseDto> {
    return this.authService.refresh(dto);
  }

  @Get('auth/me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Request() req: any) {
    return req.user;
  }

  @Get('admin/audit-logs')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.AUDIT_READ)
  async getAuditLogs(@Request() req: any) {
    return this.auditService.getTenantAuditLogs(req.user.tenantId);
  }
}
