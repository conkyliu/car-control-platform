import {
  ModelTemplate,
  ProjectCapabilityOverride,
  VehicleCapabilityOverride,
} from '@car-control/contracts';

export class CapabilityRepository {
  private modelTemplates: Map<string, ModelTemplate> = new Map();
  private projectOverrides: Map<string, ProjectCapabilityOverride> = new Map();
  private vehicleOverrides: Map<string, VehicleCapabilityOverride> = new Map();

  async saveModelTemplate(template: ModelTemplate): Promise<void> {
    this.modelTemplates.set(template.modelId, template);
  }

  async getModelTemplate(modelId: string): Promise<ModelTemplate | null> {
    return this.modelTemplates.get(modelId) ?? null;
  }

  async saveProjectOverride(override: ProjectCapabilityOverride): Promise<void> {
    this.projectOverrides.set(override.projectId, override);
  }

  async getProjectOverride(projectId: string): Promise<ProjectCapabilityOverride | null> {
    return this.projectOverrides.get(projectId) ?? null;
  }

  async saveVehicleOverride(override: VehicleCapabilityOverride): Promise<void> {
    this.vehicleOverrides.set(override.vehicleId, override);
  }

  async getVehicleOverride(vehicleId: string): Promise<VehicleCapabilityOverride | null> {
    return this.vehicleOverrides.get(vehicleId) ?? null;
  }
}
