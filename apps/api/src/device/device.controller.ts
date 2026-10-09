import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CreateDeviceDto,
  BatchImportDevicesDto,
  DeviceFilterDto,
  Permission,
} from '@car-control/contracts';
import { DeviceService } from './device.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';

@Controller('api/v1/devices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  @Post()
  @RequirePermissions(Permission.DEVICE_WRITE)
  async createDevice(@Body() dto: CreateDeviceDto) {
    return this.deviceService.createDevice(dto);
  }

  @Post('batch-import')
  @RequirePermissions(Permission.DEVICE_WRITE)
  async batchImport(@Body() dto: BatchImportDevicesDto) {
    return this.deviceService.batchImportDevices(dto);
  }

  @Get()
  @RequirePermissions(Permission.DEVICE_READ)
  async queryDevices(@Query() query: DeviceFilterDto) {
    return this.deviceService.queryDevices(query);
  }

  @Get(':deviceNo/hierarchy')
  @RequirePermissions(Permission.DEVICE_READ)
  async getHierarchy(@Param('deviceNo') deviceNo: string) {
    return this.deviceService.resolveHierarchy(deviceNo);
  }

  @Patch(':id/status')
  @RequirePermissions(Permission.DEVICE_WRITE)
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: 'ACTIVE' | 'INACTIVE' | 'DECOMMISSIONED'
  ) {
    return this.deviceService.updateStatus(id, status);
  }
}
