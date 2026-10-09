import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  OtaPlanDto,
  CreateOtaPlanDto,
  OtaDeviceTaskDto,
  OtaPlanStatus,
  OtaTaskStatus,
  OtaStep,
  OtaTargetType,
  canTransitionOtaPlanStatus,
  DEFAULT_OTA_PRE_CHECK,
  FirmwareStatus,
} from '@car-control/contracts';
import {
  OtaPlanRepository,
  OtaTaskRepository,
  FirmwareRepository,
  VehicleRepository,
  DeviceRepository,
  TenantContext,
} from '@car-control/database';
import { MessagingPort } from '../messaging/messaging.port.js';
import { AuditService } from '../audit/audit.service.js';
import { OtaSafetyService } from './ota-safety.service.js';

interface ResolvedTarget {
  deviceNo: string;
  vehicleId: string;
  productKey: string;
}

@Injectable()
export class OtaPlanService {
  constructor(
    private readonly planRepo: OtaPlanRepository,
    private readonly taskRepo: OtaTaskRepository,
    private readonly firmwareRepo: FirmwareRepository,
    private readonly vehicleRepo: VehicleRepository,
    private readonly deviceRepo: DeviceRepository,
    private readonly otaSafetyService: OtaSafetyService,
    @Inject('MessagingPort') private readonly messagingPort: MessagingPort,
    private readonly auditService: AuditService
  ) {}

  /**
   * 创建 OTA 升级计划并解析目标设备创建子任务
   */
  async createPlan(dto: CreateOtaPlanDto): Promise<OtaPlanDto> {
    const session = TenantContext.getRequired();

    if (!dto.name || !dto.firmwareId || !dto.targetType) {
      throw new BadRequestException('name, firmwareId, and targetType are required');
    }

    // 1. 固件包合法性校验
    const firmware = await this.firmwareRepo.findById(dto.firmwareId);
    if (!firmware) {
      throw new BadRequestException(`Firmware package not found: ${dto.firmwareId}`);
    }
    if (firmware.status !== FirmwareStatus.ACTIVE) {
      throw new BadRequestException(`Firmware package is not in ACTIVE status: ${dto.firmwareId}`);
    }

    // 2. 多维目标设备解析
    const targets = await this.resolveTargetDevices(dto, firmware.targetModelId);
    if (targets.length === 0) {
      throw new BadRequestException('No eligible target devices found for the plan');
    }

    // 3. 创建 OTA 计划
    const plan = await this.planRepo.create({
      name: dto.name,
      firmwareId: dto.firmwareId,
      targetType: dto.targetType,
      targetIds: dto.targetIds || [],
      batchSize: dto.batchSize ?? 10,
      batchIntervalSec: dto.batchIntervalSec ?? 30,
      maxRetries: dto.maxRetries ?? 3,
      preCheckRequired: dto.preCheckRequired ?? DEFAULT_OTA_PRE_CHECK,
      totalDevices: targets.length,
      successDevices: 0,
      failedDevices: 0,
      status: OtaPlanStatus.DRAFT,
    });

    // 4. 为每个目标设备生成 QUEUED 初始任务
    for (const target of targets) {
      await this.taskRepo.create({
        planId: plan.id,
        vehicleId: target.vehicleId,
        deviceNo: target.deviceNo,
        firmwareVersion: firmware.version,
        status: OtaTaskStatus.QUEUED,
        currentStep: OtaStep.DOWNLOADING,
        progressPercent: 0,
        retryCount: 0,
      });
    }

    // 5. 记录审计日志
    this.auditService.logAction({
      tenantId: session.tenantId,
      userId: session.userId,
      action: 'OTA_PLAN_CREATE',
      resourceType: 'OTA_PLAN',
      resourceId: plan.id,
      details: {
        name: plan.name,
        firmwareId: plan.firmwareId,
        targetType: plan.targetType,
        totalDevices: plan.totalDevices,
      },
    });

    return plan;
  }

  /**
   * 执行 OTA 升级计划（按批次并发调度、安全前置检查、MQTT 指令下发）
   */
  async executePlan(planId: string): Promise<OtaPlanDto> {
    const session = TenantContext.getRequired();

    const plan = await this.planRepo.findById(planId);
    if (!plan) {
      throw new NotFoundException(`OTA plan not found: ${planId}`);
    }

    if (!canTransitionOtaPlanStatus(plan.status, OtaPlanStatus.EXECUTING)) {
      throw new BadRequestException(
        `Invalid status transition: cannot execute plan ${planId} in status ${plan.status}`
      );
    }

    const firmware = await this.firmwareRepo.findById(plan.firmwareId);
    if (!firmware) {
      throw new BadRequestException(`Firmware package not found: ${plan.firmwareId}`);
    }

    // 流转计划状态至 EXECUTING
    await this.planRepo.updateStatus(planId, OtaPlanStatus.EXECUTING);

    // 查询计划名下所有排队任务
    const allTasks = await this.taskRepo.listByPlan(planId);
    const queuedTasks = allTasks.filter((t) => t.status === OtaTaskStatus.QUEUED);

    const batchSize = plan.batchSize || 10;

    // 按批次并发调度执行
    for (let i = 0; i < queuedTasks.length; i += batchSize) {
      const batch = queuedTasks.slice(i, i + batchSize);

      for (const task of batch) {
        // 安全前置门禁检查 (ADR-013 & Gate 5 AC-3)
        const safety = await this.otaSafetyService.checkSafety(task.deviceNo);

        if (!safety.safe) {
          // 安全拦截: 流转至 SKIPPED_UNSAFE 并原子更新计划失败计数
          await this.taskRepo.updateProgress(task.id, {
            status: OtaTaskStatus.SKIPPED_UNSAFE,
            step: task.currentStep,
            percent: task.progressPercent,
            reason: safety.reason ?? 'PRECHECK_FAILED',
          });
          await this.planRepo.updateCounters(planId, { failed: 1 });
        } else {
          // 安全通过: 流转至 NOTIFIED 并下发 MQTT OTA 固件升级指令
          await this.taskRepo.updateProgress(task.id, {
            status: OtaTaskStatus.NOTIFIED,
            step: task.currentStep,
            percent: 0,
          });

          const dev = await this.deviceRepo.findByDeviceNo(task.deviceNo);
          const productKey = dev?.productKey ?? 'PK_DEFAULT';
          const traceId = `ota_${Date.now()}_${task.id}`;

          await this.messagingPort.publishOtaUpgrade(productKey, task.deviceNo, {
            traceId,
            planId: plan.id,
            taskId: task.id,
            version: firmware.version,
            fileUrl: firmware.fileUrl,
            fileSizeBytes: firmware.fileSizeBytes,
            checksumSha256: firmware.checksumSha256,
            checksumMd5: firmware.checksumMd5,
          });
        }
      }
    }

    // 检查是否所有任务均已被拦截完成
    let updatedPlan = await this.planRepo.findById(planId);
    if (updatedPlan && updatedPlan.status === OtaPlanStatus.EXECUTING) {
      if (updatedPlan.successDevices + updatedPlan.failedDevices >= updatedPlan.totalDevices) {
        updatedPlan = await this.planRepo.updateStatus(planId, OtaPlanStatus.COMPLETED);
      }
    }

    this.auditService.logAction({
      tenantId: session.tenantId,
      userId: session.userId,
      action: 'OTA_PLAN_EXECUTE',
      resourceType: 'OTA_PLAN',
      resourceId: plan.id,
      details: { planId: plan.id, status: updatedPlan?.status },
    });

    return (updatedPlan ?? plan) as OtaPlanDto;
  }

  /**
   * 暂停 OTA 计划
   */
  async pausePlan(planId: string): Promise<OtaPlanDto> {
    const session = TenantContext.getRequired();

    const plan = await this.planRepo.findById(planId);
    if (!plan) {
      throw new NotFoundException(`OTA plan not found: ${planId}`);
    }

    if (!canTransitionOtaPlanStatus(plan.status, OtaPlanStatus.PAUSED)) {
      throw new BadRequestException(
        `Invalid status transition: cannot pause plan ${planId} in status ${plan.status}`
      );
    }

    const updated = await this.planRepo.updateStatus(planId, OtaPlanStatus.PAUSED);

    this.auditService.logAction({
      tenantId: session.tenantId,
      userId: session.userId,
      action: 'OTA_PLAN_PAUSE',
      resourceType: 'OTA_PLAN',
      resourceId: planId,
    });

    return updated;
  }

  /**
   * 取消 OTA 计划
   */
  async cancelPlan(planId: string): Promise<OtaPlanDto> {
    const session = TenantContext.getRequired();

    const plan = await this.planRepo.findById(planId);
    if (!plan) {
      throw new NotFoundException(`OTA plan not found: ${planId}`);
    }

    if (!canTransitionOtaPlanStatus(plan.status, OtaPlanStatus.CANCELLED)) {
      throw new BadRequestException(
        `Invalid status transition: cannot cancel plan ${planId} in status ${plan.status}`
      );
    }

    const updated = await this.planRepo.updateStatus(planId, OtaPlanStatus.CANCELLED);

    this.auditService.logAction({
      tenantId: session.tenantId,
      userId: session.userId,
      action: 'OTA_PLAN_CANCEL',
      resourceType: 'OTA_PLAN',
      resourceId: planId,
    });

    return updated;
  }

  /**
   * 获取单条计划详情
   */
  async getPlanById(planId: string): Promise<OtaPlanDto | null> {
    return this.planRepo.findById(planId);
  }

  /**
   * 列表查询升级计划
   */
  async listPlans(filter?: {
    status?: OtaPlanStatus;
    firmwareId?: string;
  }): Promise<OtaPlanDto[]> {
    return this.planRepo.list(filter);
  }

  /**
   * 获取计划关联的全部设备任务
   */
  async getPlanTasks(planId: string): Promise<OtaDeviceTaskDto[]> {
    const plan = await this.planRepo.findById(planId);
    if (!plan) {
      throw new NotFoundException(`OTA plan not found: ${planId}`);
    }
    return this.taskRepo.listByPlan(planId);
  }

  /**
   * 多维目标设备解析
   */
  private async resolveTargetDevices(
    dto: CreateOtaPlanDto,
    firmwareModelId: string
  ): Promise<ResolvedTarget[]> {
    const results: ResolvedTarget[] = [];
    const seen = new Set<string>();

    const targetType = dto.targetType;

    if (targetType === OtaTargetType.ALL) {
      const vehicles = await this.vehicleRepo.findMany(() => true);
      for (const v of vehicles) {
        if (v.deviceId) {
          const dev = await this.deviceRepo.findById(v.deviceId);
          if (dev && dev.status === 'ACTIVE' && !seen.has(dev.deviceNo)) {
            seen.add(dev.deviceNo);
            results.push({
              deviceNo: dev.deviceNo,
              vehicleId: v.id,
              productKey: dev.productKey,
            });
          }
        }
      }
    } else if (targetType === OtaTargetType.MODEL) {
      const modelId = dto.targetIds?.[0] || firmwareModelId;
      const vehicles = await this.vehicleRepo.findMany((v) =>
        dto.targetIds?.length ? dto.targetIds.includes(v.modelId) : v.modelId === modelId
      );
      for (const v of vehicles) {
        if (v.deviceId) {
          const dev = await this.deviceRepo.findById(v.deviceId);
          if (dev && dev.status === 'ACTIVE' && !seen.has(dev.deviceNo)) {
            seen.add(dev.deviceNo);
            results.push({
              deviceNo: dev.deviceNo,
              vehicleId: v.id,
              productKey: dev.productKey,
            });
          }
        }
      }
    } else if (targetType === OtaTargetType.PROJECT) {
      const vehicles = await this.vehicleRepo.findMany((v) =>
        Boolean(dto.targetIds?.length && dto.targetIds.includes(v.projectId))
      );
      for (const v of vehicles) {
        if (v.deviceId) {
          const dev = await this.deviceRepo.findById(v.deviceId);
          if (dev && dev.status === 'ACTIVE' && !seen.has(dev.deviceNo)) {
            seen.add(dev.deviceNo);
            results.push({
              deviceNo: dev.deviceNo,
              vehicleId: v.id,
              productKey: dev.productKey,
            });
          }
        }
      }
    } else if (targetType === OtaTargetType.DEVICE_LIST) {
      for (const id of dto.targetIds || []) {
        let dev = await this.deviceRepo.findByDeviceNo(id);
        if (!dev) {
          dev = await this.deviceRepo.findById(id);
        }
        if (dev && dev.status === 'ACTIVE' && !seen.has(dev.deviceNo)) {
          seen.add(dev.deviceNo);
          const v = await this.vehicleRepo.findByDeviceId(dev.id);
          results.push({
            deviceNo: dev.deviceNo,
            vehicleId: v?.id || dev.id,
            productKey: dev.productKey,
          });
        }
      }
    }

    return results;
  }
}
