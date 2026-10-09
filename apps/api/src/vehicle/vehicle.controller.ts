import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CreateVehicleDto,
  BindDeviceDto,
  VehicleFilterDto,
  Permission,
} from '@car-control/contracts';
import { VehicleService } from './vehicle.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';

@Controller('api/v1/vehicles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class VehicleController {
  constructor(private readonly vehicleService: VehicleService) {}

  @Post()
  @RequirePermissions(Permission.VEHICLE_WRITE)
  async createVehicle(@Body() dto: CreateVehicleDto) {
    return this.vehicleService.createVehicle(dto);
  }

  @Get()
  @RequirePermissions(Permission.VEHICLE_READ)
  async queryVehicles(@Query() query: VehicleFilterDto) {
    return this.vehicleService.queryVehicles(query);
  }

  @Get(':id')
  @RequirePermissions(Permission.VEHICLE_READ)
  async getVehicleDetail(@Param('id') id: string) {
    return this.vehicleService.getVehicleDetail(id);
  }

  @Post(':id/bind-device')
  @RequirePermissions(Permission.VEHICLE_WRITE)
  async bindDevice(@Param('id') id: string, @Body() dto: BindDeviceDto) {
    return this.vehicleService.bindDevice(id, dto.deviceId);
  }

  @Post(':id/unbind-device')
  @RequirePermissions(Permission.VEHICLE_WRITE)
  async unbindDevice(@Param('id') id: string) {
    return this.vehicleService.unbindDevice(id);
  }
}
