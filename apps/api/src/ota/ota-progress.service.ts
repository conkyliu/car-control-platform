import { Injectable, Inject } from '@nestjs/common';
import {
  OtaProgressPayload,
  OtaStep,
  OtaTaskStatus,
  OtaPlanStatus,
  WebSocketEvent,
  WebSocketRoomBuilder,
  isTerminalOtaTaskStatus,
  isTerminalOtaPlanStatus,
} from '@car-control/contracts';
import { OtaDeviceTask } from '@car-control/domain-types';
import {
  OtaPlanRepository,
  OtaTaskRepository,
  TenantContext,
} from '@car-control/database';
import { MessagingPort } from '../messaging/messaging.port.js';
import { WebSocketGatewayService } from '../realtime/websocket.gateway.js';
import { AuditService } from '../audit/audit.service.js';

@Injectable()
export class OtaProgressService {
  constructor(
    private readonly planRepo: OtaPlanRepository,
    private readonly taskRepo: OtaTaskRepository,
    private readonly wsGateway: WebSocketGatewayService,
    @Inject('MessagingPort') private readonly messagingPort: MessagingPort,
    private readonly auditService: AuditService
  ) {
    // 监听 MQTT 上报的设备升级进度事件
    this.messagingPort.onOtaProgress(this.handleOtaProgress.bind(this));
  }

  /**
   * 处理设备端上报的 OTA 进度并驱动生命周期闭环
   */
  async handleOtaProgress(data: {
    productKey: string;
    deviceNo: string;
    payload: OtaProgressPayload;
  }): Promise<void> {
    const { payload } = data;

    // 1. 定位目标任务（支持无租户上下文异步回调回溯）
    const task = await this.findTask(payload.planId, payload.deviceNo);
    if (!task) {
      return;
    }

    // 终态保护: 已处于终态的任务不再重复处理
    if (isTerminalOtaTaskStatus(task.status)) {
      return;
    }

    // 2. 注入任务所属租户上下文，执行安全流转
    await TenantContext.run(
      { tenantId: task.tenantId, userId: 'system' },
      async () => {
        // 映射步骤至云端任务状态
        let nextStatus: OtaTaskStatus;
        switch (payload.step) {
          case OtaStep.DOWNLOADING:
            nextStatus = OtaTaskStatus.DOWNLOADING;
            break;
          case OtaStep.VERIFYING:
            nextStatus = OtaTaskStatus.VERIFYING;
            break;
          case OtaStep.FLASHING:
          case OtaStep.REBOOTING:
            nextStatus = OtaTaskStatus.FLASHING;
            break;
          case OtaStep.SUCCESS:
            nextStatus = OtaTaskStatus.SUCCESS;
            break;
          case OtaStep.FAILED:
            nextStatus = OtaTaskStatus.FAILED;
            break;
          default:
            nextStatus = task.status;
        }

        // 失败重试计数累加
        if (nextStatus === OtaTaskStatus.FAILED) {
          await this.taskRepo.incrementRetry(task.id);
        }

        // 更新任务进度与状态
        await this.taskRepo.updateProgress(task.id, {
          status: nextStatus,
          step: payload.step,
          percent: payload.progressPercent ?? 0,
          reason: payload.errorMessage,
        });

        // 3. WebSocket 实时向升级计划房间广播进度
        this.wsGateway.emitToRoom(
          WebSocketRoomBuilder.otaPlanRoom(payload.planId),
          WebSocketEvent.OTA_PROGRESS,
          payload
        );

        // 4. 终态原子递增计划统计
        if (nextStatus === OtaTaskStatus.SUCCESS) {
          await this.planRepo.updateCounters(payload.planId, { success: 1 });
        } else if (nextStatus === OtaTaskStatus.FAILED) {
          await this.planRepo.updateCounters(payload.planId, { failed: 1 });
        }

        // 5. 计划完成判定与自动闭环
        if (nextStatus === OtaTaskStatus.SUCCESS || nextStatus === OtaTaskStatus.FAILED) {
          const plan = await this.planRepo.findById(payload.planId);
          if (plan && !isTerminalOtaPlanStatus(plan.status)) {
            if (plan.successDevices + plan.failedDevices >= plan.totalDevices) {
              await this.planRepo.updateStatus(payload.planId, OtaPlanStatus.COMPLETED);

              // 广播计划完成事件
              this.wsGateway.emitToRoom(
                WebSocketRoomBuilder.otaPlanRoom(payload.planId),
                WebSocketEvent.OTA_COMPLETED,
                {
                  planId: payload.planId,
                  status: OtaPlanStatus.COMPLETED,
                  totalDevices: plan.totalDevices,
                  successDevices: plan.successDevices,
                  failedDevices: plan.failedDevices,
                }
              );

              // 审计记录
              this.auditService.logAction({
                tenantId: task.tenantId,
                userId: 'system',
                action: 'OTA_PLAN_COMPLETED',
                resourceType: 'OTA_PLAN',
                resourceId: payload.planId,
                details: {
                  totalDevices: plan.totalDevices,
                  successDevices: plan.successDevices,
                  failedDevices: plan.failedDevices,
                },
              });
            }
          }
        }
      }
    );
  }

  /**
   * 安全定位任务实体
   */
  private async findTask(planId: string, deviceNo: string): Promise<OtaDeviceTask | null> {
    const session = TenantContext.getOptional();
    if (session?.tenantId) {
      return this.taskRepo.findByPlanAndDevice(planId, deviceNo);
    }

    for (const item of (this.taskRepo as any).items?.values() || []) {
      if (item.planId === planId && item.deviceNo === deviceNo) {
        return item;
      }
    }

    return null;
  }
}
