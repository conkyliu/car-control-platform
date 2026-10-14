import { http, ApiError } from './client.ts';
import { CommandCode } from '@car-control/contracts';
import {
  type ModelTemplateDto,
  type CapabilityRule,
  type CreateCapabilityTemplateInput,
  type PowertrainType,
  cloneModelTemplate,
  createDefaultCapabilities,
  SEED_CAPABILITY_TEMPLATES,
} from '../views/command/capability-core.ts';
import { isApiError } from '../views/command/command-core.ts';

// 导出类型
export type { ModelTemplateDto, CapabilityRule, CreateCapabilityTemplateInput, PowertrainType };

// 内存模板池 (用于离线降级与前端本地状态留存)
let inMemoryTemplates: ModelTemplateDto[] = JSON.parse(
  JSON.stringify(SEED_CAPABILITY_TEMPLATES)
);

export function getInMemoryCapabilityTemplates(): ModelTemplateDto[] {
  return inMemoryTemplates;
}

export function setInMemoryCapabilityTemplates(templates: ModelTemplateDto[]): void {
  inMemoryTemplates = templates;
}

export function resetInMemoryCapabilityTemplates(): void {
  inMemoryTemplates = JSON.parse(JSON.stringify(SEED_CAPABILITY_TEMPLATES));
}

/**
 * 获取所有车型能力模板列表
 */
export async function fetchCapabilityTemplatesApi(): Promise<ModelTemplateDto[]> {
  try {
    const list = await http.get<ModelTemplateDto[]>('/capabilities/templates');
    if (Array.isArray(list)) {
      return list;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线降级
  return [...inMemoryTemplates];
}

/**
 * 根据车型 ID 获取对应车型能力模板
 */
export async function fetchCapabilityTemplateByModelApi(
  modelId: string
): Promise<ModelTemplateDto | null> {
  try {
    const template = await http.get<ModelTemplateDto>(
      `/capabilities/templates/by-model/${encodeURIComponent(modelId)}`
    );
    if (template && template.id) {
      return template;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线降级匹配
  const found = inMemoryTemplates.find((t) => t.modelId === modelId);
  return found ? JSON.parse(JSON.stringify(found)) : null;
}

/**
 * 更新车型能力模板的指令规则矩阵
 */
export async function updateCapabilityTemplateApi(
  id: string,
  capabilities: Record<CommandCode, CapabilityRule>
): Promise<ModelTemplateDto> {
  try {
    const result = await http.patch<ModelTemplateDto>(
      `/capabilities/templates/${encodeURIComponent(id)}`,
      { capabilities }
    );
    if (result && result.id) {
      return result;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线降级保存
  const index = inMemoryTemplates.findIndex((t) => t.id === id);
  if (index === -1) {
    throw new Error(`车型能力模板 ID "${id}" 未找到`);
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const updated: ModelTemplateDto = {
    ...inMemoryTemplates[index]!,
    capabilities: JSON.parse(JSON.stringify(capabilities)),
    updatedAt: now,
    updatedBy: 'operator-admin',
  };

  inMemoryTemplates[index] = updated;
  return updated;
}

/**
 * 创建新车型能力模板
 */
export async function createCapabilityTemplateApi(
  data: CreateCapabilityTemplateInput
): Promise<ModelTemplateDto> {
  try {
    const result = await http.post<ModelTemplateDto>('/capabilities/templates', data);
    if (result && result.id) {
      return result;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线降级创建
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  let baseCaps = createDefaultCapabilities();
  if (data.baseTemplateId) {
    const base = inMemoryTemplates.find((t) => t.id === data.baseTemplateId);
    if (base) {
      baseCaps = JSON.parse(JSON.stringify(base.capabilities));
    }
  }

  const newTemplate: ModelTemplateDto = {
    id: `tpl-${data.modelId}-${Date.now()}`,
    modelId: data.modelId,
    modelName: data.modelName,
    protocolCode: data.protocolCode,
    powertrain: data.powertrain,
    description: data.description || `${data.modelName} 专属能力模板`,
    updatedAt: now,
    updatedBy: 'operator-admin',
    capabilities: data.capabilities
      ? { ...baseCaps, ...data.capabilities }
      : baseCaps,
  };

  inMemoryTemplates = [newTemplate, ...inMemoryTemplates];
  return newTemplate;
}

/**
 * 基于源模板克隆至目标车型
 */
export async function cloneCapabilityTemplateApi(
  sourceId: string,
  targetModelId: string,
  targetModelName: string,
  targetProtocolCode?: string,
  targetPowertrain?: PowertrainType
): Promise<ModelTemplateDto> {
  try {
    const result = await http.post<ModelTemplateDto>(
      `/capabilities/templates/${encodeURIComponent(sourceId)}/clone`,
      {
        targetModelId,
        targetModelName,
        targetProtocolCode,
        targetPowertrain,
      }
    );
    if (result && result.id) {
      return result;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线降级克隆
  const source = inMemoryTemplates.find((t) => t.id === sourceId);
  if (!source) {
    throw new Error(`克隆源能力模板 "${sourceId}" 不存在`);
  }

  const cloned = cloneModelTemplate(
    source,
    targetModelId,
    targetModelName,
    targetProtocolCode || source.protocolCode,
    targetPowertrain || source.powertrain
  );

  inMemoryTemplates = [cloned, ...inMemoryTemplates];
  return cloned;
}
