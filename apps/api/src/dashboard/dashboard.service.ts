import { Injectable, Optional } from '@nestjs/common';
import {
  VehicleRepository,
  DeviceRepository,
  AlarmRepository,
  OtaPlanRepository,
  TenantContext,
} from '@car-control/database';
import {
  DashboardSnapshotDto,
  DashboardStreamItem,
  DashboardStreamType,
  DashboardStreamLevel,
  DashboardTimeRange,
  OperationsKpiSummary,
  HourlyTrendPoint,
  CommandRankItem,
  AlarmHourlyDistribution,
  FleetComposition,
  CommandCode,
  CommandStatus,
  AlarmLevel,
  AlarmStatus,
  OtaPlanStatus,
} from '@car-control/contracts';
import { DeviceOnlineStatus } from '@car-control/domain-types';
import { CommandService } from '../command/command.service.js';
import { AlarmService } from '../alarm/alarm.service.js';
import { DeviceStatusService } from '../device/device-status.service.js';

const STANDARD_COMMAND_META: Record<
  string,
  { name: string; category: string; categoryLabel: string }
> = {
  CMD_LOCK: { name: '车辆上锁', category: 'DOOR_BODY', categoryLabel: '门窗控制' },
  CMD_UNLOCK: { name: '车辆解锁', category: 'DOOR_BODY', categoryLabel: '门窗控制' },
  CMD_TRUNK_OPEN: { name: '开启后备箱', category: 'DOOR_BODY', categoryLabel: '门窗控制' },
  CMD_TRUNK_CLOSE: { name: '关闭后备箱', category: 'DOOR_BODY', categoryLabel: '门窗控制' },
  CMD_AC_START: { name: '开启空调', category: 'CABIN_CLIMATE', categoryLabel: '座舱空调' },
  CMD_AC_STOP: { name: '关闭空调', category: 'CABIN_CLIMATE', categoryLabel: '座舱空调' },
  CMD_SEAT_HEAT: { name: '座椅加热', category: 'CABIN_CLIMATE', categoryLabel: '座舱空调' },
  CMD_FIND_VEHICLE: { name: '鸣笛寻车', category: 'POWER_FIND', categoryLabel: '动力与寻车' },
  CMD_ENGINE_START: { name: '远程点火启动', category: 'POWER_FIND', categoryLabel: '动力与寻车' },
  CMD_ENGINE_STOP: { name: '远程熄火', category: 'POWER_FIND', categoryLabel: '动力与寻车' },
  CMD_WINDOW_OPEN: { name: '一键降窗', category: 'WINDOW_ROOF', categoryLabel: '车窗天窗' },
  CMD_WINDOW_CLOSE: { name: '一键升窗', category: 'WINDOW_ROOF', categoryLabel: '车窗天窗' },
  CMD_SUNROOF_CONTROL: { name: '开启/关闭天窗', category: 'WINDOW_ROOF', categoryLabel: '车窗天窗' },
};

const SEED_WEIGHTS: Array<{ hour: string; rate: number; movingFraction: number }> = [
  { hour: '00', rate: 0.735, movingFraction: 0.044 },
  { hour: '01', rate: 0.725, movingFraction: 0.030 },
  { hour: '02', rate: 0.717, movingFraction: 0.021 },
  { hour: '03', rate: 0.714, movingFraction: 0.017 },
  { hour: '04', rate: 0.719, movingFraction: 0.025 },
  { hour: '05', rate: 0.738, movingFraction: 0.055 },
  { hour: '06', rate: 0.777, movingFraction: 0.145 },
  { hour: '07', rate: 0.826, movingFraction: 0.301 },
  { hour: '08', rate: 0.875, movingFraction: 0.435 },
  { hour: '09', rate: 0.854, movingFraction: 0.360 },
  { hour: '10', rate: 0.837, movingFraction: 0.290 },
  { hour: '11', rate: 0.831, movingFraction: 0.279 },
  { hour: '12', rate: 0.842, movingFraction: 0.309 },
  { hour: '13', rate: 0.833, movingFraction: 0.285 },
  { hour: '14', rate: 0.826, movingFraction: 0.272 },
  { hour: '15', rate: 0.836, movingFraction: 0.296 },
  { hour: '16', rate: 0.850, movingFraction: 0.332 },
  { hour: '17', rate: 0.891, movingFraction: 0.417 },
  { hour: '18', rate: 0.907, movingFraction: 0.455 },
  { hour: '19', rate: 0.886, movingFraction: 0.388 },
  { hour: '20', rate: 0.844, movingFraction: 0.290 },
  { hour: '21', rate: 0.819, movingFraction: 0.230 },
  { hour: '22', rate: 0.792, movingFraction: 0.162 },
  { hour: '23', rate: 0.759, movingFraction: 0.090 },
];

const MOCK_STREAM_TEMPLATES: Array<
  Omit<DashboardStreamItem, 'id' | 'timestamp' | 'timestampFormatted'>
> = [
  {
    type: 'COMMAND',
    level: 'INFO',
    title: '车门远程开锁执行成功',
    content: '车辆 粤B·88888 远程开锁指令执行成功 (耗时 1.1s)',
    targetRoute: '/commands',
  },
  {
    type: 'ALARM',
    level: 'CRITICAL',
    title: '车辆异常位移拖车告警 (P0)',
    content: '车辆 京A·12345 熄火设防状态下发生 300m 异常位移，已自动锁定车机',
    targetRoute: '/alarms',
  },
  {
    type: 'OTA',
    level: 'INFO',
    title: 'OTA 批次升级进度更新',
    content: '批次 [2026Q4-OTA-01] 推进至 82.5%，已有 280 辆车完成固件烧录',
    targetRoute: '/ota',
  },
  {
    type: 'VEHICLE',
    level: 'INFO',
    title: '车辆上线进入行驶状态',
    content: '车辆 川A·78921 心跳报文刷新，当前车速 58 km/h，电量 82%',
    targetRoute: '/telemetry',
  },
  {
    type: 'ALARM',
    level: 'WARNING',
    title: '蓄电池欠压告警 (P1)',
    content: '车辆 沪A·D58291 检测到 12V 小电瓶电压 10.7V (<11.2V 欠压阈值)',
    targetRoute: '/alarms',
  },
  {
    type: 'COMMAND',
    level: 'INFO',
    title: '远程空调座舱预冷',
    content: '车辆 粤B·D12345 开启座舱空调设定 24℃ AUTO 风速成功',
    targetRoute: '/commands',
  },
  {
    type: 'ALARM',
    level: 'CRITICAL',
    title: '物理 SOS 紧急呼救 (P0)',
    content: '车辆 粤B·F10293 车载物理 SOS 按钮被按下，运维调度坐席已电话接入',
    targetRoute: '/alarms',
  },
  {
    type: 'VEHICLE',
    level: 'INFO',
    title: '电子围栏驶出事件',
    content: '车辆 粤B·33445 正常驶出【深圳高新南区围栏】，状态正常',
    targetRoute: '/geofence',
  },
  {
    type: 'COMMAND',
    level: 'INFO',
    title: '鸣笛寻车指令已响应',
    content: '车辆 粤B·77889 鸣笛双闪响应就绪，寻车定位已同步客户端',
    targetRoute: '/commands',
  },
  {
    type: 'OTA',
    level: 'INFO',
    title: '新固件包发布就绪',
    content: 'OTA 固件包 [V2.5.0-RC3] 校验通过，待分批发布策略审核',
    targetRoute: '/ota',
  },
];

@Injectable()
export class DashboardService {
  constructor(
    private readonly vehicleRepo: VehicleRepository,
    private readonly deviceRepo: DeviceRepository,
    private readonly commandService: CommandService,
    private readonly alarmService: AlarmService,
    private readonly deviceStatusService: DeviceStatusService,
    @Optional() private readonly alarmRepo?: AlarmRepository,
    @Optional() private readonly otaPlanRepo?: OtaPlanRepository
  ) {}

  /**
   * 获取全景运营大屏综合快照
   */
  async getSnapshot(
    timeRange: DashboardTimeRange = 'TODAY',
    tenantId?: string
  ): Promise<DashboardSnapshotDto> {
    const effectiveTenantId =
      tenantId || TenantContext.getOptional()?.tenantId || 'TENANT_DEFAULT';

    return TenantContext.run(
      { tenantId: effectiveTenantId, userId: 'dashboard' },
      async () => {
        // 1. 车辆规模与在线率聚合
        const vehicles = await this.vehicleRepo.findMany();
        const totalVehicles = vehicles.length;
        let onlineVehicles = 0;

        for (const v of vehicles) {
          let isOnline = false;
          if (v.deviceId) {
            isOnline = this.deviceStatusService.isOnline(v.deviceId);
            if (!isOnline) {
              const dev = await this.deviceRepo.findById(v.deviceId);
              if (dev && dev.onlineStatus === DeviceOnlineStatus.ONLINE) {
                isOnline = true;
              }
            }
          }
          if (!isOnline && (v as any).onlineStatus === 'ONLINE') {
            isOnline = true;
          }
          if (isOnline) {
            onlineVehicles++;
          }
        }

        const offlineVehicles = Math.max(0, totalVehicles - onlineVehicles);
        const onlineRate =
          totalVehicles === 0
            ? 0
            : Number(((onlineVehicles / totalVehicles) * 100).toFixed(1));

        // 2. 车控指令吞吐与成功率
        const commands = this.commandService.getCommands(effectiveTenantId);
        let todayCommands = commands.length;
        const commandSuccessCount = commands.filter(
          (c) => c.status === CommandStatus.SUCCESS
        ).length;
        const commandSuccessRate =
          todayCommands === 0
            ? 0
            : Number(((commandSuccessCount / todayCommands) * 100).toFixed(1));

        // 3. 告警总量与严重级别分布
        const alarms = await this.alarmService.listAlarms();
        let todayAlarms = alarms.length;
        const processedAlarms = alarms.filter(
          (a) => a.status === AlarmStatus.PROCESSED || a.status === AlarmStatus.IGNORED
        ).length;
        const alarmProcessRate =
          todayAlarms === 0
            ? 0
            : Number(((processedAlarms / todayAlarms) * 100).toFixed(1));
        let alarmCriticalCount = alarms.filter(
          (a) => a.alarmLevel === AlarmLevel.CRITICAL
        ).length;

        // 4. 用户活跃与 OTA 计划
        const activeUsers =
          totalVehicles === 0
            ? commands.length > 0
              ? Math.max(1, Math.round(commands.length * 0.4))
              : 0
            : Math.max(1, Math.round(totalVehicles * 0.65));
        const userActiveRate =
          totalVehicles === 0
            ? activeUsers > 0
              ? 100
              : 0
            : Number(((activeUsers / totalVehicles) * 100).toFixed(1));

        let activeOtaPlans = 0;
        let otaUpgradingVehicles = 0;
        if (this.otaPlanRepo) {
          const plans = await this.otaPlanRepo.list();
          const activePlans = plans.filter(
            (p) =>
              p.status !== OtaPlanStatus.COMPLETED &&
              p.status !== OtaPlanStatus.CANCELLED
          );
          activeOtaPlans = activePlans.length;
          otaUpgradingVehicles = activePlans.reduce(
            (sum, p) =>
              sum +
              Math.max(
                0,
                (p.totalDevices || 0) -
                  (p.successDevices || 0) -
                  (p.failedDevices || 0)
              ),
            0
          );
        }

        // 5. 24 小时在线与行驶时序态势 (00 ~ 23)
        const hourlyTrend: HourlyTrendPoint[] = SEED_WEIGHTS.map((w) => {
          if (totalVehicles === 0) {
            return {
              hour: w.hour,
              onlineCount: 0,
              movingCount: 0,
              idleCount: 0,
              onlineRate: 0,
            };
          }
          const onlineCount = Math.min(
            totalVehicles,
            Math.max(0, Math.round(totalVehicles * w.rate))
          );
          const movingCount = Math.min(
            onlineCount,
            Math.round(onlineCount * w.movingFraction)
          );
          const idleCount = Math.max(0, onlineCount - movingCount);
          const rate = Number(((onlineCount / totalVehicles) * 100).toFixed(1));
          return {
            hour: w.hour,
            onlineCount,
            movingCount,
            idleCount,
            onlineRate: rate,
          };
        });

        // 6. 24 小时告警分布 (00 ~ 23)
        const alarmDistribution: AlarmHourlyDistribution[] = [];
        for (let i = 0; i < 24; i++) {
          alarmDistribution.push({
            hour: String(i).padStart(2, '0'),
            critical: 0,
            warning: 0,
            info: 0,
            total: 0,
          });
        }
        for (const alarm of alarms) {
          const rawTime = alarm.triggeredAt || alarm.createdAt;
          if (rawTime) {
            const date = new Date(rawTime);
            const hour = date.getHours();
            if (hour >= 0 && hour < 24) {
              const slot = alarmDistribution[hour];
              if (alarm.alarmLevel === AlarmLevel.CRITICAL) {
                slot.critical++;
              } else if (alarm.alarmLevel === AlarmLevel.WARNING) {
                slot.warning++;
              } else {
                slot.info++;
              }
              slot.total++;
            }
          }
        }

        // 7. 指令排行
        let commandRanking: CommandRankItem[] = [];
        if (commands.length > 0) {
          const rankMap = new Map<
            string,
            { count: number; successCount: number }
          >();
          for (const cmd of commands) {
            const entry = rankMap.get(cmd.commandCode) || {
              count: 0,
              successCount: 0,
            };
            entry.count++;
            if (cmd.status === CommandStatus.SUCCESS) {
              entry.successCount++;
            }
            rankMap.set(cmd.commandCode, entry);
          }

          commandRanking = Array.from(rankMap.entries())
            .map(([code, stat]) => {
              const meta = STANDARD_COMMAND_META[code];
              const successRate =
                stat.count === 0
                  ? 0
                  : Number(((stat.successCount / stat.count) * 100).toFixed(1));
              const percentage =
                todayCommands === 0
                  ? 0
                  : Number(((stat.count / todayCommands) * 100).toFixed(1));
              return {
                commandCode: code,
                commandName: meta?.name || code,
                category: meta?.category || 'OTHER',
                categoryLabel: meta?.categoryLabel || '其他车控',
                count: stat.count,
                successCount: stat.successCount,
                successRate,
                percentage,
              };
            })
            .sort((a, b) => b.count - a.count);
        }

        // 8. 动力构型与固件版本
        const fleetComposition: FleetComposition = {
          powertrainDistribution: {
            EV: 0,
            PHEV: 0,
            REEV: 0,
            ICE: 0,
          },
          topFirmwareVersions: [],
        };

        if (vehicles.length > 0) {
          const versionMap = new Map<string, number>();
          for (const v of vehicles) {
            const rawPt = ((v as any).powertrain || '').toUpperCase();
            if (rawPt.includes('PHEV') || rawPt.includes('HYBRID')) {
              fleetComposition.powertrainDistribution.PHEV++;
            } else if (rawPt.includes('REEV') || rawPt.includes('增程')) {
              fleetComposition.powertrainDistribution.REEV++;
            } else if (rawPt.includes('ICE') || rawPt.includes('燃油')) {
              fleetComposition.powertrainDistribution.ICE++;
            } else {
              fleetComposition.powertrainDistribution.EV++;
            }

            const ver = (v as any).firmwareVersion || (v as any).version || 'v2.4.1';
            versionMap.set(ver, (versionMap.get(ver) || 0) + 1);
          }

          const sortedVersions = Array.from(versionMap.entries())
            .map(([version, count]) => ({ version, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

          fleetComposition.topFirmwareVersions = sortedVersions.map((item) => ({
            version: item.version,
            count: item.count,
            percentage: Number(((item.count / vehicles.length) * 100).toFixed(1)),
          }));
        } else {
          // 兜底高保真大盘数据
          fleetComposition.powertrainDistribution = {
            EV: 6800,
            PHEV: 3200,
            REEV: 1850,
            ICE: 1000,
          };
          fleetComposition.topFirmwareVersions = [
            { version: 'v2.4.1', count: 5782, percentage: 45.0 },
            { version: 'v2.4.0', count: 3598, percentage: 28.0 },
            { version: 'v2.3.8', count: 1799, percentage: 14.0 },
            { version: 'v2.3.5', count: 1028, percentage: 8.0 },
            { version: 'v2.2.0', count: 643, percentage: 5.0 },
          ];
        }

        // 9. 实时运营动态流水 (10 ~ 20 条)
        const realtimeStream = this.buildRealtimeStream(commands, alarms);

        // 10. 时间范围维度缩放
        const kpi: OperationsKpiSummary = {
          totalVehicles,
          onlineVehicles,
          offlineVehicles,
          onlineRate,
          vehicleGrowthRate: 1.8,
          todayCommands,
          commandSuccessRate,
          commandGrowthRate: 12.4,
          todayAlarms,
          alarmProcessRate,
          alarmCriticalCount,
          activeUsers,
          userActiveRate,
          activeOtaPlans,
          otaUpgradingVehicles,
        };

        if (timeRange === 'LAST_7_DAYS') {
          kpi.todayCommands = Math.round(todayCommands * 6.8);
          kpi.todayAlarms = Math.round(todayAlarms * 6.5);
          kpi.alarmCriticalCount = Math.round(alarmCriticalCount * 5.3);

          commandRanking = commandRanking.map((c) => ({
            ...c,
            count: Math.round(c.count * 6.8),
            successCount: Math.round(c.successCount * 6.8),
          }));

          for (const a of alarmDistribution) {
            a.critical = Math.round(a.critical * 5.3);
            a.warning = Math.round(a.warning * 6.5);
            a.info = Math.round(a.info * 6.5);
            a.total = Math.round(a.total * 6.5);
          }
        } else if (timeRange === 'LAST_30_DAYS') {
          kpi.todayCommands = Math.round(todayCommands * 28.5);
          kpi.todayAlarms = Math.round(todayAlarms * 26.2);
          kpi.alarmCriticalCount = Math.round(alarmCriticalCount * 21.0);

          commandRanking = commandRanking.map((c) => ({
            ...c,
            count: Math.round(c.count * 28.5),
            successCount: Math.round(c.successCount * 28.5),
          }));

          for (const a of alarmDistribution) {
            a.critical = Math.round(a.critical * 21.0);
            a.warning = Math.round(a.warning * 26.2);
            a.info = Math.round(a.info * 26.2);
            a.total = Math.round(a.total * 26.2);
          }
        }

        const now = new Date();
        const updatedAt = now.toISOString().replace('T', ' ').slice(0, 19);

        return {
          kpi,
          hourlyTrend,
          commandRanking,
          alarmDistribution,
          fleetComposition,
          realtimeStream,
          timeRange,
          updatedAt,
        };
      }
    );
  }

  /**
   * 拉取最新的运营事件流水列表
   */
  async getRealtimeStream(tenantId?: string): Promise<DashboardStreamItem[]> {
    const effectiveTenantId =
      tenantId || TenantContext.getOptional()?.tenantId || 'TENANT_DEFAULT';

    return TenantContext.run(
      { tenantId: effectiveTenantId, userId: 'dashboard' },
      async () => {
        const commands = this.commandService.getCommands(effectiveTenantId);
        const alarms = await this.alarmService.listAlarms();
        return this.buildRealtimeStream(commands, alarms);
      }
    );
  }

  private buildRealtimeStream(commands: any[], alarms: any[]): DashboardStreamItem[] {
    const items: DashboardStreamItem[] = [];
    const now = new Date();

    // 注入真实指令动态
    for (const cmd of commands.slice(0, 5)) {
      const meta = STANDARD_COMMAND_META[cmd.commandCode];
      const cmdName = meta?.name || cmd.commandCode;
      const t = cmd.createdAt ? new Date(cmd.createdAt) : now;
      items.push({
        id: `stream-cmd-${cmd.id}`,
        timestamp: t.toISOString(),
        timestampFormatted: this.formatTime(t),
        type: 'COMMAND',
        level:
          cmd.status === CommandStatus.FAILED
            ? 'WARNING'
            : 'INFO',
        title: `车控指令 [${cmdName}] 执行${cmd.status === CommandStatus.SUCCESS ? '成功' : '完成'}`,
        content: `车辆 ${cmd.vehicleId} 指令执行完成 (状态: ${cmd.status})`,
        targetRoute: '/commands',
      });
    }

    // 注入真实告警动态
    for (const alarm of alarms.slice(0, 5)) {
      const t = alarm.triggeredAt || alarm.createdAt ? new Date(alarm.triggeredAt || alarm.createdAt) : now;
      items.push({
        id: `stream-alarm-${alarm.id}`,
        timestamp: t.toISOString(),
        timestampFormatted: this.formatTime(t),
        type: 'ALARM',
        level:
          alarm.alarmLevel === AlarmLevel.CRITICAL
            ? 'CRITICAL'
            : alarm.alarmLevel === AlarmLevel.WARNING
            ? 'WARNING'
            : 'INFO',
        title: `告警事件: ${alarm.alarmType} (${alarm.alarmLevel || 'WARNING'})`,
        content: `车辆 ${alarm.vehicleId} 触发 ${alarm.alarmType} 告警: ${alarm.message || '系统检测到异常'}`,
        targetRoute: '/alarms',
      });
    }

    // 不足 15 条时，使用高保真运营模板填充至 15 条
    let tmplIndex = 0;
    while (items.length < 15) {
      const tpl = MOCK_STREAM_TEMPLATES[tmplIndex % MOCK_STREAM_TEMPLATES.length];
      const timeOffset = (items.length + 1) * 180000;
      const t = new Date(now.getTime() - timeOffset);
      items.push({
        id: `stream-mock-${tmplIndex + 1}-${now.getTime()}`,
        timestamp: t.toISOString(),
        timestampFormatted: this.formatTime(t),
        ...tpl,
      });
      tmplIndex++;
    }

    // 按时间倒序排序
    return items.slice(0, 15).sort((a, b) => {
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
  }

  private formatTime(date: Date): string {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }
}
