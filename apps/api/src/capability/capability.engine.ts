import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CommandCode,
  COMMAND_DEFINITIONS,
  EffectiveCapabilityDto,
  CapabilityRule,
} from '@car-control/contracts';
import { CapabilityRepository, VehicleRepository } from '@car-control/database';

@Injectable()
export class CapabilityEngine {
  constructor(
    private readonly capabilityRepo: CapabilityRepository,
    private readonly vehicleRepo: VehicleRepository
  ) {}

  /**
   * 解析指定车辆在目标指令下的最终有效生效能力配置 (Effective Capability)
   * 继承管道：Global Definition -> Project Override -> Model Template -> Vehicle Override
   */
  async resolveEffective(vehicleId: string, commandCode: CommandCode): Promise<EffectiveCapabilityDto> {
    const vehicle = await this.vehicleRepo.findById(vehicleId);
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with id ${vehicleId} not found`);
    }

    const globalMeta = COMMAND_DEFINITIONS[commandCode];
    if (!globalMeta) {
      throw new NotFoundException(`Unsupported global command: ${commandCode}`);
    }

    // 1. 基线全局定义
    let supported = true;
    let securityLevel = globalMeta.defaultSecurityLevel;
    let timeoutMs = globalMeta.defaultTimeoutMs;
    let frequencyLimitSeconds = 5; // 默认 5 秒冷却时间
    let reason: string | undefined;

    // 2. 车型能力模板检查 (Model Template)
    const modelTemplate = await this.capabilityRepo.getModelTemplate(vehicle.modelId);
    if (modelTemplate && modelTemplate.capabilities[commandCode]) {
      const modelRule: CapabilityRule = modelTemplate.capabilities[commandCode]!;
      supported = modelRule.supported;
      if (modelRule.securityLevel) securityLevel = modelRule.securityLevel;
      if (modelRule.timeoutMs) timeoutMs = modelRule.timeoutMs;
      if (modelRule.frequencyLimitSeconds) frequencyLimitSeconds = modelRule.frequencyLimitSeconds;
      if (!supported) reason = 'UNSUPPORTED_BY_MODEL';
    }

    // 3. 项目级能力覆盖 (Project Override)
    const projectOverride = await this.capabilityRepo.getProjectOverride(vehicle.projectId);
    if (projectOverride && projectOverride.overrides[commandCode]) {
      const projRule: CapabilityRule = projectOverride.overrides[commandCode]!;
      supported = projRule.supported;
      if (projRule.securityLevel) securityLevel = projRule.securityLevel;
      if (projRule.timeoutMs) timeoutMs = projRule.timeoutMs;
      if (projRule.frequencyLimitSeconds) frequencyLimitSeconds = projRule.frequencyLimitSeconds;
      if (!supported) reason = 'DISABLED_BY_PROJECT';
    }

    // 4. 单车能力覆盖 (Vehicle Override) - 最高优先级
    const vehicleOverride = await this.capabilityRepo.getVehicleOverride(vehicle.id);
    if (vehicleOverride && vehicleOverride.overrides[commandCode]) {
      const vRule: CapabilityRule = vehicleOverride.overrides[commandCode]!;
      supported = vRule.supported;
      if (vRule.securityLevel) securityLevel = vRule.securityLevel;
      if (vRule.timeoutMs) timeoutMs = vRule.timeoutMs;
      if (vRule.frequencyLimitSeconds) frequencyLimitSeconds = vRule.frequencyLimitSeconds;
      reason = supported ? undefined : 'OVERRIDDEN_BY_VEHICLE';
    }

    return {
      commandCode,
      commandName: globalMeta.name,
      supported,
      securityLevel,
      timeoutMs,
      frequencyLimitSeconds,
      reason,
    };
  }

  /**
   * 批量解析某辆车对全部指令的生效能力表 (用于前端面板动态展示/置灰)
   */
  async resolveAllCapabilities(vehicleId: string): Promise<Record<CommandCode, EffectiveCapabilityDto>> {
    const codes = Object.keys(COMMAND_DEFINITIONS) as CommandCode[];
    const result: Partial<Record<CommandCode, EffectiveCapabilityDto>> = {};

    for (const code of codes) {
      result[code] = await this.resolveEffective(vehicleId, code);
    }

    return result as Record<CommandCode, EffectiveCapabilityDto>;
  }
}
