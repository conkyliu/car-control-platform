import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import {
  CommandCode,
  CommandDictionaryItem,
  UpdateCommandDictionaryDto,
  DEFAULT_COMMAND_DICTIONARY,
  Permission,
} from '@car-control/contracts';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';

@Controller('api/v1/command-dictionary')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CommandDictionaryController {
  private dictionary: Map<CommandCode, CommandDictionaryItem> = new Map();

  constructor() {
    this.resetDictionary();
  }

  public resetDictionary(): void {
    this.dictionary.clear();
    for (const item of DEFAULT_COMMAND_DICTIONARY) {
      this.dictionary.set(item.code, JSON.parse(JSON.stringify(item)));
    }
  }

  @Get()
  @RequirePermissions(Permission.VEHICLE_READ)
  async getDictionary(): Promise<CommandDictionaryItem[]> {
    return Array.from(this.dictionary.values());
  }

  @Get(':code')
  @RequirePermissions(Permission.VEHICLE_READ)
  async getItem(@Param('code') code: CommandCode): Promise<CommandDictionaryItem> {
    const item = this.dictionary.get(code);
    if (!item) {
      throw new NotFoundException(`未找到指令代码【${code}】对应的字典项`);
    }
    return JSON.parse(JSON.stringify(item));
  }

  @Patch(':code')
  @RequirePermissions(Permission.VEHICLE_WRITE)
  async patchItem(
    @Param('code') code: CommandCode,
    @Body() body: UpdateCommandDictionaryDto
  ): Promise<CommandDictionaryItem> {
    const existing = this.dictionary.get(code);
    if (!existing) {
      throw new NotFoundException(`未找到指令代码【${code}】对应的字典项`);
    }

    const updated: CommandDictionaryItem = {
      ...existing,
      ...body,
      code: existing.code, // 确保 code 不可篡改
      category: body.category ?? existing.category,
      downlinkOpcode: body.downlinkOpcode ?? existing.downlinkOpcode,
      canSignalName: body.canSignalName ?? existing.canSignalName,
      defaultSecurityLevel: body.defaultSecurityLevel ?? existing.defaultSecurityLevel,
      defaultTimeoutMs: body.defaultTimeoutMs ?? existing.defaultTimeoutMs,
      defaultFrequencyLimitSeconds:
        body.defaultFrequencyLimitSeconds ?? existing.defaultFrequencyLimitSeconds,
      description: body.description ?? existing.description,
      safetyWarning: body.safetyWarning !== undefined ? body.safetyWarning : existing.safetyWarning,
      payloadSchema: body.payloadSchema ?? existing.payloadSchema,
      samplePayload: body.samplePayload ?? existing.samplePayload,
    };

    this.dictionary.set(code, updated);
    return JSON.parse(JSON.stringify(updated));
  }
}
