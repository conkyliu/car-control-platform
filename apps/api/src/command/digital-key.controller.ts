import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  DigitalKeyDto,
  DigitalKeyQueryParams,
  CreateDigitalKeyInput,
  RevokeDigitalKeyInput,
  Permission,
} from '@car-control/contracts';
import { DigitalKeyService } from './digital-key.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';

@Controller('api/v1')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DigitalKeyController {
  constructor(private readonly digitalKeyService: DigitalKeyService) {}

  @Get('digital-keys')
  @RequirePermissions(Permission.VEHICLE_READ)
  async listKeys(
    @Query() params?: DigitalKeyQueryParams,
    @Request() req?: any
  ): Promise<DigitalKeyDto[]> {
    const tenantId = req?.user?.tenantId;
    return this.digitalKeyService.listKeys(params, tenantId);
  }

  @Get('digital-keys/:id')
  @RequirePermissions(Permission.VEHICLE_READ)
  async getKeyById(
    @Param('id') id: string,
    @Request() req: any
  ): Promise<DigitalKeyDto> {
    const tenantId = req?.user?.tenantId;
    return this.digitalKeyService.getKeyById(id, tenantId);
  }

  @Post('digital-keys')
  @RequirePermissions(Permission.VEHICLE_WRITE)
  async createKey(
    @Body() body: CreateDigitalKeyInput | { data: CreateDigitalKeyInput },
    @Request() req: any
  ): Promise<DigitalKeyDto> {
    const tenantId = req?.user?.tenantId;
    const input = (body && typeof body === 'object' && 'data' in body)
      ? (body as { data: CreateDigitalKeyInput }).data
      : (body as CreateDigitalKeyInput);
    return this.digitalKeyService.createKey(input, tenantId);
  }

  @Put('digital-keys/:id/revoke')
  @RequirePermissions(Permission.VEHICLE_WRITE)
  async revokeKey(
    @Param('id') id: string,
    @Body() body: RevokeDigitalKeyInput,
    @Request() req: any
  ): Promise<DigitalKeyDto> {
    const tenantId = req?.user?.tenantId;
    return this.digitalKeyService.revokeKey(id, body?.reason, tenantId);
  }

  @Get('vehicles/:vehicleId/digital-keys')
  @RequirePermissions(Permission.VEHICLE_READ)
  async getKeysByVehicle(
    @Param('vehicleId') vehicleId: string,
    @Request() req: any
  ): Promise<DigitalKeyDto[]> {
    const tenantId = req?.user?.tenantId;
    return this.digitalKeyService.getKeysByVehicle(vehicleId, tenantId);
  }
}
