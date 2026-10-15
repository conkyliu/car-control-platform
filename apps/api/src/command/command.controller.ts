import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Request,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  CreateCommandRequestDto,
  Permission,
} from '@car-control/contracts';
import { CommandRecord } from '@car-control/domain-types';
import { CommandService } from './command.service.js';
import { TracerService } from '../observability/tracing/tracer.service.js';
import { CommandTrace } from '../observability/tracing/tracer.types.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';

@Controller('api/v1')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CommandController {
  constructor(
    private readonly commandService: CommandService,
    @Optional() private readonly tracerService?: TracerService
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

  @Get('commands/:commandId')
  @RequirePermissions(Permission.VEHICLE_READ)
  async getCommand(@Param('commandId') commandId: string): Promise<CommandRecord> {
    return this.commandService.getCommand(commandId);
  }

  @Get('commands/:commandId/trace')
  @RequirePermissions(Permission.VEHICLE_READ)
  async getCommandTrace(
    @Param('commandId') commandId: string,
    @Request() req: any
  ): Promise<CommandTrace> {
    if (!this.tracerService) {
      throw new NotFoundException(`TracerService is not available`);
    }

    const trace =
      this.tracerService.getTraceByCommandId(commandId) ||
      this.tracerService.getTrace(commandId);

    if (!trace) {
      throw new NotFoundException(`未找到指令链路追踪数据: ${commandId}`);
    }

    const user = req?.user;
    if (user?.tenantId && trace.tenantId && trace.tenantId !== user.tenantId) {
      throw new NotFoundException(`未找到指令链路追踪数据: ${commandId}`);
    }

    return trace;
  }

  @Get('vehicles/:vehicleId/commands')
  @RequirePermissions(Permission.VEHICLE_READ)
  async getVehicleCommands(
    @Param('vehicleId') vehicleId: string,
    @Request() req: any
  ): Promise<CommandRecord[]> {
    const user = req?.user;
    return this.commandService.getVehicleCommands(vehicleId, user?.tenantId);
  }
}
