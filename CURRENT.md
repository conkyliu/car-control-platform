# CURRENT.md · 当前执行状态记录

> 最后更新：2026-10-09  
> 当前阶段：**Gate 4 (Week 7-12) 实时业务与报警轨迹中心验收全部通过，全量回归测试 100% 通行，准备进入 Gate 5 (Week 11-14) 生产级高可用与运维监控**

## 1. 当前进展
- **已完成**：
  - [x] **Phase 1: 工程底座与知识体系**
    - `car-control-platform` 独立 Git 仓库与 Monorepo。
    - `AGENTS.md`、`ARCHITECTURE.md`、`ROADMAP.md`、`traceability.md`。
    - 领域规范：`command.md`、`capability.md`、`mqtt.md`。
    - 架构决策：`ADR-001`、`ADR-003`、`ADR-004`。
  - [x] **Phase 2: 共享契约与核心领域**
    - `@car-control/contracts`、`@car-control/domain-types`、`@car-control/config`、`@car-control/database`。
  - [x] **Phase 3: Gate 0 Transport POC 与设备模拟器**
    - `@car-control/simulator`（设备上线、心跳、下行命令监听、执行时延、成功 ACK、拒绝 ACK、丢包及重复 ACK 仿真）。
    - `@car-control/api`（CommandService 11 状态机、直通 MQTT MessagingPort、WebSocket 推送）。
    - 6 项核心闭环与防重测试全部通过。
  - [x] **Phase 4: 多租户数据模型与隔离防线**
    - PostgreSQL Prisma 7 模型架构。
    - `TenantContext` + `TenantAwareRepository` 强制隔离防线测试全部通过。
  - [x] **Phase 5: React Web 控制台**
    - `@car-control/web`（React 19 + Vite + AntD 5 + Zustand 车控交互看板与状态流水构建）。
  - [x] **Phase 6: Gate 1 Platform Safe (Week 2-4 Foundation 平台底座)**
    - 双令牌认证规范与架构决策：`docs/specs/auth.md`、`docs/specs/tenant.md`、`ADR-009`、`ADR-010`。
    - PBKDF2/Scrypt 加盐密码哈希，带唯一 JTI 的无状态 HMAC-SHA256 JWT 工具。
    - `AuthService`、`UserService`、`TenantService`、`AuditService`、`JwtAuthGuard`、`PermissionsGuard`。
    - 7 项 Platform Safe 验收测试全部通过。
  - [x] **Phase 7: Gate 2 Vehicle Online (Week 3-6 设备与车辆管理)**
    - 领域规范：`docs/specs/device.md`、`docs/specs/vehicle.md`。
    - 共享 DTO：`CreateDeviceDto`、`BatchImportDevicesDto`、`DeviceFilterDto`、`DeviceHierarchyDto`、`CreateVehicleDto`、`BindDeviceDto`、`VehicleDetailDto`。
    - 租户隔离仓储：`DeviceRepository`、`VehicleRepository`。
    - 核心业务服务：`DeviceService`、`VehicleService`、`ProjectService`。
    - 接口控制器：`DeviceController`、`VehicleController`。
    - Gate 2 验收测试 7/7 全部通过。
  - [x] **Phase 8: Gate 3 Control Closed Loop (Week 5-10 控车核心域与三级能力继承引擎)**
    - 领域规范与架构决策：`docs/specs/security.md`、`docs/adr/ADR-005`、`docs/adr/ADR-008`。
    - 共享契约与 DTOs：`EffectiveCapabilityDto`、`SecurityCheckInput`、`SecurityLevel` 等。
    - 核心引擎与仓储：
      - `CapabilityRepository` 支持车型模板、项目覆盖与单车覆盖持久化。
      - `CapabilityEngine` 实现四级能力继承优先级算法（Global Default -> Project Override -> Model Template -> Vehicle Override）。
    - 控车安全防线：
      - `ControlSecurityService` 支持 L0 无校验 / L1 六位数字安全码二次认证 / L2 强防盗与点火强二次确认 Token。
      - 滑动窗口频次限制与防抖（Rate Limiting）。
      - 车辆风控与维保状态安全拦截（`LOCKED` 禁控、`MAINTENANCE` 禁点火）。
    - 升级 `CommandService` 12 步控车安全流水线，深度整合 CapabilityEngine、ControlSecurityService 与设备状态联动。
    - Gate 3 验收测试 8/8 100% 通过。
  - [x] **Phase 9: Gate 4 Telemetry, Geofence & Alert Center (Week 7-12 实时业务与报警轨迹中心)**
    - 领域规范与架构决策：
      - `docs/specs/telemetry.md`（高频遥测报文、热点定位缓存、Douglas-Peucker 轨迹抽稀与电子围栏）。
      - `docs/specs/alert.md`（设备主动告警与平台规则告警、8大告警枚举、不可逆处置终态拓扑与操作审计）。
      - `docs/adr/ADR-006`（Douglas-Peucker 轨迹抽稀算法与容差设计）。
      - `docs/adr/ADR-007`（不可逆终态保护的告警处置生命周期与多租户审计）。
    - 共享契约与 DTOs：
      - `TelemetryLocationPayload`, `SimplifiedTrajectoryDto`, `TrajectoryTolerance`。
      - `AlarmType`, `AlarmLevel`, `AlarmStatus`, `AlarmRecordDto`, `ProcessAlarmDto`, `AlarmFilterDto`。
      - `CommunicationLogDto`, `CommunicationLogFilterDto`, `CommunicationDirection`, `CommunicationChannel`。
      - `MqttTopicBuilder` 支持 MQTT 标准规范 Topic 构造与解析。
    - 数据库租户隔离仓储：
      - `LocationRepository` 支持租户限定的车辆最新位置热缓存与历史时序轨迹存储。
      - `AlarmRepository` 强制多租户上下文隔离与终态不可逆状态机流转。
      - `CommunicationLogRepository` 多维检索设备上下行通讯报文。
    - 仿真器与通信端口：
      - `DeviceSimulator` 扩展 GPS 轨迹上报 (`reportLocation`) 与主动报警上报 (`reportAlarm`)。
      - `InMemoryMessagingAdapter` 统一派发定位、告警与指令 ACK 报文并注入上下文。
    - 核心业务服务与控制器：
      - `GeofenceService` 实现高精度 Haversine 大圆距离公式与圆形围栏出入判定。
      - `douglasPeucker` 实现经典递归分治矢量抽稀，106 点抽稀至 4 点（<4% 点位），首尾端点与直角折弯转折点 100% 精确保留。
      - `TelemetryService` 与 `TelemetryController` 负责位置上报、热点缓存与 WebSocket 实时广播 (`LOCATION_UPDATED`)。
      - `AlarmService` 与 `AlarmController` 负责告警触发、WebSocket 广播 (`ALARM_TRIGGERED` / `ALARM_PROCESSED`)、人工处置闭环、终态防线与安全审计留痕。
      - `CommunicationLogService` 与 `CommunicationLogController` 负责下行控制、上行 ACK、定位与告警全链路自动归档与检索。
    - **Gate 4 验收测试 7/7 项 (8/8 subtests) 100% 通过**：
      1. 实时位置上报与 WebSocket 广播 (`LOCATION_UPDATED`)
      2. 历史轨迹服务端 Douglas-Peucker 抽稀（<20% 点位，首尾点与转折点 100% 保持精准）
      3. 圆形地理围栏出入判定与 `GEOFENCE_OUT` 报警触发
      4. 设备端主动告警上报（`LOW_BATTERY` 与 `VIBRATION`）与 WebSocket 广播
      5. 报警生命周期流转（`PROCESSED`）、留痕审计与不可逆终态保护
      6. 通讯上下行日志自动沉淀（下行指令、ACK、定位、告警）与基于 vehicleId / traceId 检索
      7. 多租户全方位安全隔离防线（最新定位、历史轨迹、告警列表与通讯日志跨租户完全隔离）
    - **全工程全量回归测试通过率：87/87 (100% PASS)**。

- **阻塞项**：无。
- **已知问题**：已修复 `CommandService` 与 `CommunicationLogService` 对上行 ACK 的重复归档问题，清除 `AppModule` 冗余 provider 声明，全套验收测试稳定全绿。

## 2. 下一步任务
- 启动 **Gate 5 (Week 11-14): Production Readiness & Observability (生产级高可用与运维监控)**：
  1. 分布式缓存与 Redis 集成方案评估。
  2. Prometheus 指标与 OpenTelemetry 分布式链路追踪接入。
  3. 压测用例构建与性能调优（高并发下行控车与密集遥测上报）。
