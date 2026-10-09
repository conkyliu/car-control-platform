import { CommandCode, SecurityLevel } from '../command/command-codes.js';

export interface CapabilityRule {
  supported: boolean;
  securityLevel?: SecurityLevel;
  timeoutMs?: number;
  frequencyLimitSeconds?: number;
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
  modelId: string;
  modelName: string;
  capabilities: Partial<Record<CommandCode, CapabilityRule>>;
}

export interface ProjectCapabilityOverride {
  projectId: string;
  overrides: Partial<Record<CommandCode, CapabilityRule>>;
}

export interface VehicleCapabilityOverride {
  vehicleId: string;
  overrides: Partial<Record<CommandCode, CapabilityRule>>;
}
