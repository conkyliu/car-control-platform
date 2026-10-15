import {
  CommandCode,
  SecurityLevel,
  ModelTemplate,
  ProjectCapabilityOverride,
  VehicleCapabilityOverride,
  CapabilityRule,
} from '@car-control/contracts';

export class CapabilityRepository {
  private modelTemplatesById: Map<string, ModelTemplate> = new Map();
  private modelTemplatesByModelId: Map<string, ModelTemplate> = new Map();
  private projectOverrides: Map<string, ProjectCapabilityOverride> = new Map();
  private vehicleOverrides: Map<string, VehicleCapabilityOverride> = new Map();

  constructor() {
    this.seedDefaultTemplates();
  }

  private seedDefaultTemplates(): void {
    const stdEvCaps: Partial<Record<CommandCode, CapabilityRule>> = {
      [CommandCode.CMD_LOCK]: {
        supported: true,
        securityLevel: SecurityLevel.L0,
        timeoutMs: 10000,
        frequencyLimitSeconds: 3,
        description: '全车中控门锁闭锁',
      },
      [CommandCode.CMD_UNLOCK]: {
        supported: true,
        securityLevel: SecurityLevel.L1,
        timeoutMs: 10000,
        frequencyLimitSeconds: 3,
        description: '全车中控门锁解锁',
      },
      [CommandCode.CMD_FIND_VEHICLE]: {
        supported: true,
        securityLevel: SecurityLevel.L0,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
        description: '双闪鸣笛寻车',
      },
      [CommandCode.CMD_TRUNK_OPEN]: {
        supported: true,
        securityLevel: SecurityLevel.L1,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
        description: '后备箱尾门解锁弹开',
      },
      [CommandCode.CMD_TRUNK_CLOSE]: {
        supported: true,
        securityLevel: SecurityLevel.L1,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
        description: '电动尾门关闭',
      },
      [CommandCode.CMD_ENGINE_START]: {
        supported: false,
        securityLevel: SecurityLevel.L2,
        timeoutMs: 15000,
        frequencyLimitSeconds: 15,
        description: '纯电车型无内燃机发动机',
      },
      [CommandCode.CMD_ENGINE_STOP]: {
        supported: false,
        securityLevel: SecurityLevel.L2,
        timeoutMs: 15000,
        frequencyLimitSeconds: 15,
        description: '纯电车型无内燃机发动机',
      },
      [CommandCode.CMD_WINDOW_OPEN]: {
        supported: true,
        securityLevel: SecurityLevel.L1,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
        description: '车窗降下通风',
      },
      [CommandCode.CMD_WINDOW_CLOSE]: {
        supported: true,
        securityLevel: SecurityLevel.L1,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
        description: '四门车窗一键升起',
      },
      [CommandCode.CMD_AC_START]: {
        supported: true,
        securityLevel: SecurityLevel.L1,
        timeoutMs: 15000,
        frequencyLimitSeconds: 10,
        description: '座舱空调开启与温控设定',
      },
      [CommandCode.CMD_AC_STOP]: {
        supported: true,
        securityLevel: SecurityLevel.L0,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
        description: '座舱空调快速关闭',
      },
      [CommandCode.CMD_SEAT_HEAT]: {
        supported: false,
        securityLevel: SecurityLevel.L1,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
        description: '标准版未配备座椅加热',
      },
      [CommandCode.CMD_SUNROOF_CONTROL]: {
        supported: false,
        securityLevel: SecurityLevel.L1,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
        description: '标准版无天窗硬件',
      },
    };

    const perfEvCaps: Partial<Record<CommandCode, CapabilityRule>> = {
      ...stdEvCaps,
      [CommandCode.CMD_SEAT_HEAT]: {
        supported: true,
        securityLevel: SecurityLevel.L1,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
        description: '高性能双电机旗舰座椅加热与多档温控',
      },
      [CommandCode.CMD_SUNROOF_CONTROL]: {
        supported: true,
        securityLevel: SecurityLevel.L1,
        timeoutMs: 10000,
        frequencyLimitSeconds: 5,
        description: '全景可调光天幕电动开闭',
      },
    };

    const phevStdCaps: Partial<Record<CommandCode, CapabilityRule>> = {
      ...perfEvCaps,
      [CommandCode.CMD_ENGINE_START]: {
        supported: true,
        securityLevel: SecurityLevel.L2,
        timeoutMs: 20000,
        frequencyLimitSeconds: 30,
        description: '插电混动发动机远程启动暖机',
      },
      [CommandCode.CMD_ENGINE_STOP]: {
        supported: true,
        securityLevel: SecurityLevel.L2,
        timeoutMs: 20000,
        frequencyLimitSeconds: 30,
        description: '插电混动发动机远程熄火',
      },
    };

    const seedTemplates: ModelTemplate[] = [
      {
        id: 'tpl-std-ev',
        modelId: 'model-std-ev',
        modelName: '纯电标准控车模板',
        protocolCode: '0x0001',
        powertrain: 'EV',
        description: '纯电标准控车模板 (门锁、空调、后备箱、寻车、车窗支持，纯电无发动机点火)',
        updatedAt: '2026-03-01 10:00:00',
        updatedBy: 'system-admin',
        capabilities: stdEvCaps,
      },
      {
        id: 'tpl-perf-ev',
        modelId: 'model-perf-ev',
        modelName: '纯电高性能双电机模板',
        protocolCode: '0x0001',
        powertrain: 'EV',
        description: '纯电高性能双电机模板 (全电驱控车指令支持，座椅加热与高性能电池预热)',
        updatedAt: '2026-03-01 10:00:00',
        updatedBy: 'system-admin',
        capabilities: perfEvCaps,
      },
      {
        id: 'tpl-phev-std',
        modelId: 'model-phev-std',
        modelName: '插电混动旗舰模板',
        protocolCode: '0x0002',
        powertrain: 'PHEV',
        description: '插电混动旗舰模板 (发动机远程点火与全功能座舱控制支持)',
        updatedAt: '2026-03-01 10:00:00',
        updatedBy: 'system-admin',
        capabilities: phevStdCaps,
      },
    ];

    for (const tpl of seedTemplates) {
      this.modelTemplatesById.set(tpl.id!, tpl);
      this.modelTemplatesByModelId.set(tpl.modelId, tpl);
    }
  }

  async saveModelTemplate(template: ModelTemplate): Promise<void> {
    const id = template.id || template.modelId || `tpl-${template.modelId}`;
    const normalized: ModelTemplate = { ...template, id };
    this.modelTemplatesById.set(id, normalized);
    this.modelTemplatesByModelId.set(normalized.modelId, normalized);
  }

  async getModelTemplate(modelId: string): Promise<ModelTemplate | null> {
    return (
      this.modelTemplatesByModelId.get(modelId) ??
      this.modelTemplatesById.get(modelId) ??
      null
    );
  }

  async getModelTemplateById(id: string): Promise<ModelTemplate | null> {
    return (
      this.modelTemplatesById.get(id) ??
      this.modelTemplatesByModelId.get(id) ??
      null
    );
  }

  async listModelTemplates(): Promise<ModelTemplate[]> {
    return Array.from(this.modelTemplatesById.values());
  }

  async deleteModelTemplate(id: string): Promise<boolean> {
    const tpl = await this.getModelTemplateById(id);
    if (!tpl) return false;
    this.modelTemplatesById.delete(tpl.id!);
    this.modelTemplatesByModelId.delete(tpl.modelId);
    return true;
  }

  async saveProjectOverride(override: ProjectCapabilityOverride): Promise<void> {
    this.projectOverrides.set(override.projectId, override);
  }

  async getProjectOverride(projectId: string): Promise<ProjectCapabilityOverride | null> {
    return this.projectOverrides.get(projectId) ?? null;
  }

  async deleteProjectOverride(projectId: string): Promise<boolean> {
    return this.projectOverrides.delete(projectId);
  }

  async saveVehicleOverride(override: VehicleCapabilityOverride): Promise<void> {
    this.vehicleOverrides.set(override.vehicleId, override);
  }

  async getVehicleOverride(vehicleId: string): Promise<VehicleCapabilityOverride | null> {
    return this.vehicleOverrides.get(vehicleId) ?? null;
  }

  async deleteVehicleOverride(vehicleId: string): Promise<boolean> {
    return this.vehicleOverrides.delete(vehicleId);
  }
}
