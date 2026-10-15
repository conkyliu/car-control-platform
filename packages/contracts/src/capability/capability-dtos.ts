import { CommandCode, SecurityLevel } from '../command/command-codes.js';

export interface CapabilityRule {
  supported: boolean;
  securityLevel?: SecurityLevel;
  timeoutMs?: number;
  frequencyLimitSeconds?: number;
  paramConstraints?: Record<string, unknown>;
  description?: string;
}

export interface EffectiveCapabilityDto {
  commandCode: CommandCode;
  commandName: string;
  supported: boolean;
  securityLevel: SecurityLevel;
  timeoutMs: number;
  frequencyLimitSeconds: number;
  reason?: string;
}

export interface ModelTemplate {
  id?: string;
  modelId: string;
  modelName: string;
  protocolCode?: string;
  powertrain?: string;
  description?: string;
  updatedAt?: string;
  updatedBy?: string;
  capabilities: Partial<Record<CommandCode, CapabilityRule>>;
}

export type ModelTemplateDto = ModelTemplate;

export interface ProjectCapabilityOverride {
  id?: string;
  projectId: string;
  updatedAt?: string;
  updatedBy?: string;
  overrides: Partial<Record<CommandCode, CapabilityRule>>;
}

export type ProjectOverrideDto = ProjectCapabilityOverride;

export interface VehicleCapabilityOverride {
  id?: string;
  vehicleId: string;
  vin?: string;
  plateNumber?: string;
  modelId?: string;
  updatedAt?: string;
  updatedBy?: string;
  overrides: Partial<Record<CommandCode, CapabilityRule>>;
}

export type VehicleCapabilityOverrideDto = VehicleCapabilityOverride;

export interface CreateCapabilityTemplateInputDto {
  id?: string;
  modelId: string;
  modelName: string;
  protocolCode: string;
  powertrain?: string;
  description?: string;
  baseTemplateId?: string;
  capabilities?: Partial<Record<CommandCode, CapabilityRule>>;
}

export interface UpdateCapabilityTemplateInputDto {
  modelName?: string;
  protocolCode?: string;
  powertrain?: string;
  description?: string;
  capabilities?: Partial<Record<CommandCode, CapabilityRule>>;
}

export interface CloneCapabilityTemplateInputDto {
  targetModelId: string;
  targetModelName: string;
  targetProtocolCode?: string;
  targetPowertrain?: string;
}

export interface PutProjectOverrideInputDto {
  overrides: Partial<Record<CommandCode, CapabilityRule>>;
  reason?: string;
}

export interface PutVehicleOverrideInputDto {
  overrides: Partial<Record<CommandCode, CapabilityRule>>;
  reason?: string;
}

