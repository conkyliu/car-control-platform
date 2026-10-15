import { CommandCode } from '@car-control/contracts';
import { http, ApiError } from './client.ts';
import {
  type CommandDictionaryItem,
  SEED_COMMAND_DICTIONARY,
} from '../views/command/command-dictionary-core.ts';
import { isApiError } from '../views/command/command-core.ts';

// 内存中可变字典状态池 (用于离线与仿真降级)
let inMemoryDictionary: CommandDictionaryItem[] = JSON.parse(
  JSON.stringify(SEED_COMMAND_DICTIONARY)
);

/**
 * 获取当前内存中的指令字典列表 (主要用于测试和状态查看)
 */
export function getInMemoryDictionary(): CommandDictionaryItem[] {
  return inMemoryDictionary;
}

/**
 * 重置内存中的指令字典为初始种子数据 (用于测试隔离)
 */
export function resetInMemoryDictionary(): void {
  inMemoryDictionary = JSON.parse(JSON.stringify(SEED_COMMAND_DICTIONARY));
}

/**
 * 获取全量指令字典与协议参数列表
 */
export async function fetchCommandDictionaryApi(): Promise<CommandDictionaryItem[]> {
  try {
    const list = await http.get<CommandDictionaryItem[]>('/command-dictionary');
    return list;
  } catch (err: unknown) {
    if (
      isApiError(err) &&
      err.statusCode !== 404 &&
      err.statusCode !== 500 &&
      err.statusCode !== 502
    ) {
      throw err;
    }
    // 离线降级：返回内存字典池
    return JSON.parse(JSON.stringify(inMemoryDictionary));
  }
}

/**
 * 根据指令代码获取单条指令字典与协议详情
 */
export async function fetchCommandDictionaryItemApi(
  code: CommandCode
): Promise<CommandDictionaryItem> {
  try {
    const item = await http.get<CommandDictionaryItem>(`/command-dictionary/${code}`);
    return item;
  } catch (err: unknown) {
    if (
      isApiError(err) &&
      err.statusCode !== 404 &&
      err.statusCode !== 500 &&
      err.statusCode !== 502
    ) {
      throw err;
    }
    // 离线降级
    const target = inMemoryDictionary.find((item) => item.code === code);
    if (!target) {
      throw new ApiError(`未找到指令代码【${code}】对应的字典项`, 404, 'NotFound');
    }
    return JSON.parse(JSON.stringify(target));
  }
}

/**
 * 修改单条指令字典元数据（如默认超时、频控冷却限制、描述及安全提示）
 */
export async function updateCommandDictionaryItemApi(
  code: CommandCode,
  data: Partial<CommandDictionaryItem>
): Promise<CommandDictionaryItem> {
  try {
    const updated = await http.patch<CommandDictionaryItem>(`/command-dictionary/${code}`, data);
    return updated;
  } catch (err: unknown) {
    if (
      isApiError(err) &&
      err.statusCode !== 404 &&
      err.statusCode !== 500 &&
      err.statusCode !== 502
    ) {
      throw err;
    }
    // 离线降级：修改内存池
    const index = inMemoryDictionary.findIndex((item) => item.code === code);
    if (index === -1) {
      throw new ApiError(`未找到指令代码【${code}】对应的字典项`, 404, 'NotFound');
    }

    const current = inMemoryDictionary[index]!;
    const nextItem: CommandDictionaryItem = {
      ...current,
      ...data,
      code: current.code, // 确保 code 不可篡改
      category: data.category ?? current.category,
      downlinkOpcode: data.downlinkOpcode ?? current.downlinkOpcode,
      canSignalName: data.canSignalName ?? current.canSignalName,
      defaultSecurityLevel: data.defaultSecurityLevel ?? current.defaultSecurityLevel,
      defaultTimeoutMs: data.defaultTimeoutMs ?? current.defaultTimeoutMs,
      defaultFrequencyLimitSeconds:
        data.defaultFrequencyLimitSeconds ?? current.defaultFrequencyLimitSeconds,
      description: data.description ?? current.description,
      safetyWarning: data.safetyWarning !== undefined ? data.safetyWarning : current.safetyWarning,
      payloadSchema: data.payloadSchema ?? current.payloadSchema,
      samplePayload: data.samplePayload ?? current.samplePayload,
    };

    inMemoryDictionary[index] = nextItem;
    return JSON.parse(JSON.stringify(nextItem));
  }
}
