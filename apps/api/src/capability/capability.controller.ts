import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import {
  Permission,
  ModelTemplateDto,
  ProjectOverrideDto,
  VehicleCapabilityOverrideDto,
  EffectiveCapabilityDto,
  CapabilityRule,
  CommandCode,
  RoleCode,
  CreateCapabilityTemplateInputDto,
  UpdateCapabilityTemplateInputDto,
  CloneCapabilityTemplateInputDto,
  PutProjectOverrideInputDto,
  PutVehicleOverrideInputDto,
} from '@car-control/contracts';
import {
  CapabilityRepository,
  VehicleRepository,
  TenantContext,
} from '@car-control/database';
import { CapabilityEngine } from './capability.engine.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';

@Controller('api/v1')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CapabilityController {
  constructor(
    private readonly capabilityRepo: CapabilityRepository,
    private readonly capabilityEngine: CapabilityEngine,
    @Optional() private readonly vehicleRepo?: VehicleRepository
  ) {}

  /**
   * 获取所有车型能力模板列表
   */
  @Get('capabilities/templates')
  @RequirePermissions(Permission.VEHICLE_READ)
  async listTemplates(): Promise<ModelTemplateDto[]> {
    return this.capabilityRepo.listModelTemplates();
  }

  /**
   * 根据车型 ID 获取对应车型能力模板
   */
  @Get('capabilities/templates/by-model/:modelId')
  @RequirePermissions(Permission.VEHICLE_READ)
  async getTemplateByModel(
    @Param('modelId') modelId: string
  ): Promise<ModelTemplateDto | null> {
    return this.capabilityRepo.getModelTemplate(modelId);
  }

  /**
   * 根据模板 ID 获取模板详情
   */
  @Get('capabilities/templates/:id')
  @RequirePermissions(Permission.VEHICLE_READ)
  async getTemplateById(@Param('id') id: string): Promise<ModelTemplateDto> {
    const tpl = await this.capabilityRepo.getModelTemplateById(id);
    if (!tpl) {
      throw new NotFoundException(`Model template with id "${id}" not found`);
    }
    return tpl;
  }

  /**
   * 创建新车型能力模板
   */
  @Post('capabilities/templates')
  @RequirePermissions(Permission.VEHICLE_WRITE)
  async createTemplate(
    @Body() input: CreateCapabilityTemplateInputDto,
    @Request() req?: any
  ): Promise<ModelTemplateDto> {
    if (!input.modelId || !input.modelName) {
      throw new BadRequestException('modelId and modelName are required');
    }

    let baseCaps: Partial<Record<CommandCode, CapabilityRule>> = {};
    if (input.baseTemplateId) {
      const base = await this.capabilityRepo.getModelTemplateById(input.baseTemplateId);
      if (base) {
        baseCaps = JSON.parse(JSON.stringify(base.capabilities));
      }
    }

    const id = input.id || `tpl-${input.modelId}-${Date.now()}`;
    const now = new Date().toISOString();
    const operator = req?.user?.sub || 'operator-admin';

    const newTemplate: ModelTemplateDto = {
      id,
      modelId: input.modelId,
      modelName: input.modelName,
      protocolCode: input.protocolCode || '0x0001',
      powertrain: input.powertrain || 'EV',
      description: input.description || `${input.modelName} 专属能力模板`,
      updatedAt: now,
      updatedBy: operator,
      capabilities: input.capabilities
        ? { ...baseCaps, ...input.capabilities }
        : baseCaps,
    };

    await this.capabilityRepo.saveModelTemplate(newTemplate);
    return newTemplate;
  }

  /**
   * 更新车型能力模板配置 (同时支持 PATCH 与 PUT)
   */
  @Patch('capabilities/templates/:id')
  @Put('capabilities/templates/:id')
  @RequirePermissions(Permission.VEHICLE_WRITE)
  async updateTemplate(
    @Param('id') id: string,
    @Body() input: UpdateCapabilityTemplateInputDto,
    @Request() req?: any
  ): Promise<ModelTemplateDto> {
    const existing = await this.capabilityRepo.getModelTemplateById(id);
    if (!existing) {
      throw new NotFoundException(`Model template with id "${id}" not found`);
    }

    const now = new Date().toISOString();
    const operator = req?.user?.sub || 'operator-admin';

    const updated: ModelTemplateDto = {
      ...existing,
      modelName: input.modelName ?? existing.modelName,
      protocolCode: input.protocolCode ?? existing.protocolCode,
      powertrain: input.powertrain ?? existing.powertrain,
      description: input.description ?? existing.description,
      capabilities: input.capabilities
        ? { ...existing.capabilities, ...input.capabilities }
        : existing.capabilities,
      updatedAt: now,
      updatedBy: operator,
    };

    await this.capabilityRepo.saveModelTemplate(updated);
    return updated;
  }

  /**
   * 基于源模板克隆至目标车型
   */
  @Post('capabilities/templates/:sourceId/clone')
  @RequirePermissions(Permission.VEHICLE_WRITE)
  async cloneTemplate(
    @Param('sourceId') sourceId: string,
    @Body() input: CloneCapabilityTemplateInputDto,
    @Request() req?: any
  ): Promise<ModelTemplateDto> {
    if (!input.targetModelId || !input.targetModelName) {
      throw new BadRequestException('targetModelId and targetModelName are required');
    }

    const source = await this.capabilityRepo.getModelTemplateById(sourceId);
    if (!source) {
      throw new NotFoundException(`Source model template with id "${sourceId}" not found`);
    }

    const now = new Date().toISOString();
    const operator = req?.user?.sub || 'operator-admin';

    const cloned: ModelTemplateDto = {
      id: `tpl-${input.targetModelId}-${Date.now()}`,
      modelId: input.targetModelId,
      modelName: input.targetModelName,
      protocolCode: input.targetProtocolCode || source.protocolCode || '0x0001',
      powertrain: input.targetPowertrain || source.powertrain || 'EV',
      description: `克隆自 ${source.modelName} (${source.protocolCode || ''})`,
      updatedAt: now,
      updatedBy: operator,
      capabilities: JSON.parse(JSON.stringify(source.capabilities)),
    };

    await this.capabilityRepo.saveModelTemplate(cloned);
    return cloned;
  }

  /**
   * 删除车型能力模板
   */
  @Delete('capabilities/templates/:id')
  @RequirePermissions(Permission.VEHICLE_WRITE)
  async deleteTemplate(@Param('id') id: string): Promise<{ success: boolean }> {
    const success = await this.capabilityRepo.deleteModelTemplate(id);
    return { success };
  }

  /**
   * 获取项目能力覆盖配置
   */
  @Get('capabilities/projects/:projectId')
  @RequirePermissions(Permission.VEHICLE_READ)
  async getProjectOverride(
    @Param('projectId') projectId: string
  ): Promise<ProjectOverrideDto | null> {
    return this.capabilityRepo.getProjectOverride(projectId);
  }

  /**
   * 保存或更新项目能力覆盖配置
   */
  @Put('capabilities/projects/:projectId')
  @RequirePermissions(Permission.VEHICLE_WRITE)
  async putProjectOverride(
    @Param('projectId') projectId: string,
    @Body() input: PutProjectOverrideInputDto,
    @Request() req?: any
  ): Promise<ProjectOverrideDto> {
    const now = new Date().toISOString();
    const operator = req?.user?.sub || 'operator-admin';

    const override: ProjectOverrideDto = {
      id: `override-proj-${projectId}`,
      projectId,
      overrides: input.overrides || {},
      updatedAt: now,
      updatedBy: operator,
    };

    await this.capabilityRepo.saveProjectOverride(override);
    return override;
  }

  /**
   * 删除项目能力覆盖配置 (还原继承)
   */
  @Delete('capabilities/projects/:projectId')
  @RequirePermissions(Permission.VEHICLE_WRITE)
  async deleteProjectOverride(
    @Param('projectId') projectId: string
  ): Promise<{ success: boolean }> {
    const success = await this.capabilityRepo.deleteProjectOverride(projectId);
    return { success: typeof success === 'boolean' ? success : true };
  }

  /**
   * 获取单车专属能力覆盖配置
   */
  @Get('capabilities/vehicles/:vehicleId/override')
  @RequirePermissions(Permission.VEHICLE_READ)
  async getVehicleOverride(
    @Param('vehicleId') vehicleId: string
  ): Promise<VehicleCapabilityOverrideDto | null> {
    return this.capabilityRepo.getVehicleOverride(vehicleId);
  }

  /**
   * 保存或更新单车专属能力覆盖配置
   */
  @Put('capabilities/vehicles/:vehicleId/override')
  @RequirePermissions(Permission.VEHICLE_WRITE)
  async putVehicleOverride(
    @Param('vehicleId') vehicleId: string,
    @Body() input: PutVehicleOverrideInputDto,
    @Request() req?: any
  ): Promise<VehicleCapabilityOverrideDto> {
    const now = new Date().toISOString();
    const operator = req?.user?.sub || 'operator-admin';
    let vin: string | undefined;
    let plateNumber: string | undefined;
    let modelId: string | undefined;

    if (this.vehicleRepo) {
      try {
        const veh = await this.vehicleRepo.findById(vehicleId);
        if (veh) {
          vin = veh.vin;
          plateNumber = veh.plateNumber;
          modelId = veh.modelId;
        }
      } catch {
        // 忽略查询失败异常，使用默认推导值
      }
    }

    const override: VehicleCapabilityOverrideDto = {
      id: `override-${vehicleId}`,
      vehicleId,
      vin: vin || `VIN-${vehicleId.toUpperCase()}`,
      plateNumber: plateNumber || `粤B·${vehicleId.slice(-5).toUpperCase()}`,
      modelId: modelId || 'model-default',
      overrides: input.overrides || {},
      updatedAt: now,
      updatedBy: operator,
    };

    await this.capabilityRepo.saveVehicleOverride(override);
    return override;
  }

  /**
   * 删除单车专属能力覆盖配置 (恢复完全继承车型及项目能力)
   */
  @Delete('capabilities/vehicles/:vehicleId/override')
  @RequirePermissions(Permission.VEHICLE_WRITE)
  async deleteVehicleOverride(
    @Param('vehicleId') vehicleId: string
  ): Promise<{ success: boolean }> {
    const success = await this.capabilityRepo.deleteVehicleOverride(vehicleId);
    return { success: typeof success === 'boolean' ? success : true };
  }

  /**
   * 获取指定车辆最终生效的全量指令能力列表 (3级继承管道结果)
   */
  @Get('vehicles/:vehicleId/capabilities')
  @RequirePermissions(Permission.VEHICLE_READ)
  async getVehicleCapabilities(
    @Param('vehicleId') vehicleId: string,
    @Request() req?: any
  ): Promise<EffectiveCapabilityDto[]> {
    const session = TenantContext.getOptional();
    if (!session && req?.user?.tenantId) {
      return TenantContext.run(
        {
          tenantId: req.user.tenantId,
          userId: req.user.sub || 'operator-admin',
          roles: req.user.roles || [RoleCode.SUPER_ADMIN],
        },
        async () => this.capabilityEngine.resolveAllCapabilities(vehicleId)
      );
    }
    return this.capabilityEngine.resolveAllCapabilities(vehicleId);
  }
}
