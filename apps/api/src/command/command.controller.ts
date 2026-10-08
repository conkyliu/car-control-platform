import { Controller, Post, Get, Param, Body, Headers } from '@nestjs/common';
import { CreateCommandRequestDto } from '@car-control/contracts';
import { CommandRecord } from '@car-control/domain-types';
import { CommandService } from './command.service.js';
import { DeviceStatusService } from '../device/device-status.service.js';

@Controller('api/v1')
export class CommandController {
  constructor(
    private readonly commandService: CommandService,
    private readonly deviceStatusService: DeviceStatusService
  ) {}

  @Post('vehicles/:vehicleId/commands')
  async executeCommand(
    @Param('vehicleId') vehicleId: string,
    @Body() dto: CreateCommandRequestDto,
    @Headers('x-tenant-id') tenantId = 'tenant_default',
    @Headers('x-project-id') projectId = 'proj_default',
    @Headers('x-user-id') userId = 'user_admin'
  ): Promise<CommandRecord> {
    // 示范映射：通过 vehicleId 查设备
    const deviceNo = `TBOX_${vehicleId}`;
    const productKey = 'CAR_DEMO_PK';

    return this.commandService.executeCommand({
      tenantId,
      projectId,
      vehicleId,
      deviceNo,
      productKey,
      commandCode: dto.commandCode,
      idempotencyKey: dto.idempotencyKey,
      operatorId: userId,
      params: dto.params,
    });
  }

  @Get('commands/:commandId')
  async getCommand(@Param('commandId') commandId: string): Promise<CommandRecord> {
    return this.commandService.getCommand(commandId);
  }
}
