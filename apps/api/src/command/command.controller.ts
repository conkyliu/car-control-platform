import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  CreateCommandRequestDto,
  Permission,
  EffectiveCapabilityDto,
  CommandCode,
} from '@car-control/contracts';
import { CommandRecord } from '@car-control/domain-types';
import { CommandService } from './command.service.js';
import { CapabilityEngine } from '../capability/capability.engine.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';

@Controller('api/v1')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CommandController {
  constructor(
    private readonly commandService: CommandService,
    private readonly capabilityEngine: CapabilityEngine
  ) {}

  @Post('vehicles/:vehicleId/commands')
  @RequirePermissions(Permission.VEHICLE_CONTROL)
  async executeCommand(
    @Param('vehicleId') vehicleId: string,
    @Body() dto: CreateCommandRequestDto,
    @Request() req: any
  ): Promise<CommandRecord> {
    const user = req.user;
    return this.commandService.executeCommand({
      tenantId: user.tenantId,
      vehicleId,
      commandCode: dto.commandCode,
      idempotencyKey: dto.idempotencyKey,
      operatorId: user.sub,
      securityCode: dto.securityCode,
      confirmationToken: dto.confirmationToken,
      params: dto.params,
    });
  }

  @Get('vehicles/:vehicleId/capabilities')
  @RequirePermissions(Permission.VEHICLE_READ)
  async getCapabilities(
    @Param('vehicleId') vehicleId: string
  ): Promise<Record<CommandCode, EffectiveCapabilityDto>> {
    return this.capabilityEngine.resolveAllCapabilities(vehicleId);
  }

  @Get('commands/:commandId')
  @RequirePermissions(Permission.VEHICLE_READ)
  async getCommand(@Param('commandId') commandId: string): Promise<CommandRecord> {
    return this.commandService.getCommand(commandId);
  }
}
