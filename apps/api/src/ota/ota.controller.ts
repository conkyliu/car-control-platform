import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import {
  CreateFirmwareDto,
  FirmwarePackageDto,
  FirmwareStatus,
  CreateOtaPlanDto,
  OtaPlanDto,
  OtaDeviceTaskDto,
  OtaPlanStatus,
  Permission,
} from '@car-control/contracts';
import { TenantContext } from '@car-control/database';
import { FirmwareService, CreateFirmwareRequestDto } from './firmware.service.js';
import { OtaPlanService } from './ota-plan.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';

@Controller('api/v1/ota')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OtaController {
  constructor(
    private readonly firmwareService: FirmwareService,
    private readonly planService: OtaPlanService
  ) {}

  private resolveTenantSession(req?: any) {
    const user = req?.user;
    if (user?.tenantId) {
      return {
        tenantId: user.tenantId,
        userId: user.sub || user.userId || 'system',
        roles: user.roles,
      };
    }
    const session = TenantContext.getOptional();
    if (session?.tenantId) {
      return session;
    }
    return null;
  }

  // --- 固件发布包端点 ---

  @Post('firmware')
  @RequirePermissions(Permission.DEVICE_WRITE)
  async createFirmware(
    @Body() dto: CreateFirmwareDto | CreateFirmwareRequestDto,
    @Request() req?: any
  ): Promise<FirmwarePackageDto> {
    const session = this.resolveTenantSession(req);
    if (!session) {
      throw new BadRequestException('Tenant context missing');
    }

    return TenantContext.run(session, async () => {
      try {
        return await this.firmwareService.createPackage(dto);
      } catch (err: any) {
        if (err instanceof BadRequestException || err instanceof ConflictException) {
          throw err;
        }
        if (err.message?.includes('already exists')) {
          throw new ConflictException(err.message);
        }
        throw err;
      }
    });
  }

  @Get('firmware')
  @RequirePermissions(Permission.DEVICE_READ)
  async listFirmware(
    @Query('targetModelId') targetModelId?: string,
    @Query('status') status?: FirmwareStatus,
    @Request() req?: any
  ): Promise<FirmwarePackageDto[]> {
    const session = this.resolveTenantSession(req);
    if (!session) {
      throw new BadRequestException('Tenant context missing');
    }

    return TenantContext.run(session, async () => {
      return this.firmwareService.list({ targetModelId, status });
    });
  }

  @Get('firmware/:id')
  @RequirePermissions(Permission.DEVICE_READ)
  async getFirmwareById(
    @Param('id') id: string,
    @Request() req?: any
  ): Promise<FirmwarePackageDto> {
    const session = this.resolveTenantSession(req);
    if (!session) {
      throw new BadRequestException('Tenant context missing');
    }

    return TenantContext.run(session, async () => {
      const pkg = await this.firmwareService.getById(id);
      if (!pkg) {
        throw new NotFoundException(`Firmware package ${id} not found`);
      }
      return pkg;
    });
  }

  // --- OTA 升级计划与调度端点 ---

  @Post('plans')
  @RequirePermissions(Permission.DEVICE_WRITE)
  async createPlan(
    @Body() dto: CreateOtaPlanDto,
    @Request() req?: any
  ): Promise<OtaPlanDto> {
    const session = this.resolveTenantSession(req);
    if (!session) {
      throw new BadRequestException('Tenant context missing');
    }

    return TenantContext.run(session, async () => {
      return this.planService.createPlan(dto);
    });
  }

  @Get('plans')
  @RequirePermissions(Permission.DEVICE_READ)
  async listPlans(
    @Query('status') status?: OtaPlanStatus,
    @Query('firmwareId') firmwareId?: string,
    @Request() req?: any
  ): Promise<OtaPlanDto[]> {
    const session = this.resolveTenantSession(req);
    if (!session) {
      throw new BadRequestException('Tenant context missing');
    }

    return TenantContext.run(session, async () => {
      return this.planService.listPlans({ status, firmwareId });
    });
  }

  @Get('plans/:id')
  @RequirePermissions(Permission.DEVICE_READ)
  async getPlanById(
    @Param('id') id: string,
    @Request() req?: any
  ): Promise<OtaPlanDto> {
    const session = this.resolveTenantSession(req);
    if (!session) {
      throw new BadRequestException('Tenant context missing');
    }

    return TenantContext.run(session, async () => {
      const plan = await this.planService.getPlanById(id);
      if (!plan) {
        throw new NotFoundException(`OTA plan ${id} not found`);
      }
      return plan;
    });
  }

  @Post('plans/:id/execute')
  @RequirePermissions(Permission.DEVICE_WRITE)
  async executePlan(
    @Param('id') id: string,
    @Request() req?: any
  ): Promise<OtaPlanDto> {
    const session = this.resolveTenantSession(req);
    if (!session) {
      throw new BadRequestException('Tenant context missing');
    }

    return TenantContext.run(session, async () => {
      return this.planService.executePlan(id);
    });
  }

  @Post('plans/:id/pause')
  @RequirePermissions(Permission.DEVICE_WRITE)
  async pausePlan(
    @Param('id') id: string,
    @Request() req?: any
  ): Promise<OtaPlanDto> {
    const session = this.resolveTenantSession(req);
    if (!session) {
      throw new BadRequestException('Tenant context missing');
    }

    return TenantContext.run(session, async () => {
      return this.planService.pausePlan(id);
    });
  }

  @Post('plans/:id/cancel')
  @RequirePermissions(Permission.DEVICE_WRITE)
  async cancelPlan(
    @Param('id') id: string,
    @Request() req?: any
  ): Promise<OtaPlanDto> {
    const session = this.resolveTenantSession(req);
    if (!session) {
      throw new BadRequestException('Tenant context missing');
    }

    return TenantContext.run(session, async () => {
      return this.planService.cancelPlan(id);
    });
  }

  @Get('plans/:id/tasks')
  @RequirePermissions(Permission.DEVICE_READ)
  async getPlanTasks(
    @Param('id') id: string,
    @Request() req?: any
  ): Promise<OtaDeviceTaskDto[]> {
    const session = this.resolveTenantSession(req);
    if (!session) {
      throw new BadRequestException('Tenant context missing');
    }

    return TenantContext.run(session, async () => {
      return this.planService.getPlanTasks(id);
    });
  }
}
