# CURRENT.md · 当前执行状态记录

> 最后更新：2026-10-10  
> 当前阶段：**Gate 6 (Week 15-18) 生产级高可用与运维监控 (Production Readiness & Observability) 验收全部通过，全量回归测试 100% 通行，112/112 tests PASS，千级高并发压测与 SLA 硬门禁全部达标**

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
    - Gate 4 验收测试 7/7 项 100% 通过。
  - [x] **Phase 10: Gate 5 OTA Firmware Upgrade System (Week 11-16 OTA 固件升级系统)**
    - 领域规范与架构决策：
      - `docs/specs/ota.md`（固件包元数据、分批并发调度、行车安全门禁、分片下载断点上报与生命周期拓扑）。
      - `docs/adr/ADR-013-ota-firmware-pipeline-and-safety-precheck.md`（固件全生命周期流水线与行车安全前置检查决策）。
      - `docs/adr/ADR-014-ota-batch-scheduling-and-resume.md`（分批并发限流调度与分片断点续传架构决策）。
    - 共享契约与 DTOs：
      - `OtaPlanStatus`, `OtaTaskStatus`, `OtaStep`, `OtaTargetType`, `OtaPreCheckConfig`。
      - `FirmwarePackageDto`, `CreateFirmwareDto`, `OtaPlanDto`, `CreateOtaPlanDto`, `OtaDeviceTaskDto`。
      - `OtaUpgradeDownlinkPayload`, `OtaProgressPayload`。
      - `MqttTopicBuilder.otaUpgrade(...)` 与 `MqttTopicBuilder.otaProgress(...)`。
      - `WebSocketEvent.OTA_PROGRESS`, `WebSocketEvent.OTA_COMPLETED`。
    - 多租户数据仓储层：
      - `FirmwareRepository` 支持车型版本唯一性索引与多租户安全查询。
      - `OtaPlanRepository` 支持原子累加计数器 (`successDevices`, `failedDevices`) 与生命周期状态转移。
      - `OtaTaskRepository` 严格防线保护，终态任务单向不可逆。
    - 模拟器仿真引擎：
      - `DeviceSimulator` 订阅 OTA 下行指令，支持行车状态/电压安全拦截、分片下载（25% -> 50% -> 100%）、SHA256 完整性校验、FLASHING 仿真与 SUCCESS 自动更新本地固件版本。
      - 支持故障注入参数 (`failOtaAtStep`) 验证失败重试链路。
    - 核心业务服务与控制器：
      - `FirmwareService`（固件创建、SHA-256 自动计算、同车型版本冲突检测、租户隔离检索）。
      - `OtaSafetyService`（行车状态与小蓄电池低压强安全前置门禁）。
      - `OtaPlanService`（多维目标设备解析、分批次并发下发、安全拦截与原子计数）。
      - `OtaProgressService`（MQTT 进度消费、任务状态映射、WebSocket 房间广播、计划完成自动闭环）。
      - `OtaController`（RESTful API 暴露与多租户权限校验防护）。
    - Gate 5 验收测试 7/7 项 (8/8 subtests) 100% 通过 (`ota-firmware.e2e.test.ts`)。
  - [x] **Phase 11: Gate 6 Production Readiness & Observability (Week 15-18 生产级高可用与运维监控)**
    - 领域规范与架构决策：
      - `docs/specs/observability.md`（Prometheus 7 项核心指标体系、SLA 关键直方图 Buckets、OpenTelemetry W3C 5-Span 分布式链路追踪、千级并发性能 SLA 门禁）。
      - `docs/adr/ADR-015-distributed-lock-and-caching-strategy.md`（Hexagonal 架构解耦 CachePort/DistributedLockPort、Redis/InMemory 双模适配器、SET NX PX 与原子 Lua 释放）。
      - `docs/adr/ADR-016-observability-metrics-and-e2e-benchmarks.md`（Prometheus 文本协议暴露、OpenTelemetry W3C Trace Context 贯穿与阶梯压测自动化验证）。
    - 核心分布式缓存与排他锁：
      - `CachePort`, `DistributedLockPort`, `InMemoryLockAdapter`, `RedisLockAdapter`。
      - 车辆级互斥锁 `lock:cmd:${tenantId}:${vehicleId}`，同一车辆并发指令安全排他阻断 409 `VEHICLE_COMMAND_IN_PROGRESS`，终态 ACK 与超时自动释放。
    - Prometheus 标准指标服务与端点：
      - `MetricsService`, `MetricsController` (`GET /metrics`), `ObservabilityModule`。
      - 支持全部 7 项核心指标（`car_commands_total`, `car_command_duration_seconds`, `car_telemetry_uplinks_total`, `car_alarms_total`, `car_active_simulators`, `car_websocket_connections`, `car_lock_contention_total`）。
      - 直方图 Buckets 精准覆盖车控 SLA：`[0.05, 0.1, 0.25, 0.5, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0]`。
    - OpenTelemetry W3C 5 阶段分布式链路追踪：
      - `TracerService`, `CommandTrace`, `STANDARD_SPAN_NAMES`。
      - 覆盖 5 阶段：`http.inbound_request` ($T_0 \to T_1$), `command.security_and_dispatch` ($T_1 \to T_2$), `device.execution_ack` ($T_2 \to T_4$), `ack.processing_and_persistence` ($T_4 \to T_5$), `websocket.client_notification` ($T_5 \to T_6$)。
      - 耗时和严格等于 `totalDurationMs`，符合 W3C 32-hex 规范。
    - 阶梯式并发压测执行器与性能基准：
      - `LoadTestRunner`, `calculatePercentile`, `verifySla`, `generateMarkdownReport`。
      - 阶梯并发阶梯压测（100 / 500 / 1000 规模），自动化分位数计算与 GitHub Flavored Markdown 报表输出。
    - **Gate 6 验收测试 7/7 项 (8/8 subtests) 100% 通过** (`production-readiness.e2e.test.ts`):
      1. 分布式缓存与并发防重排他锁 (AC-1)
      2. Prometheus 标准指标端点导出 (AC-2)
      3. OpenTelemetry 5 阶段分布式 Span 链路追踪 (AC-3)
      4. 100 设备并发基准测试 (Tier 1: 100 Device Concurrency) (AC-4)
      5. 500 设备并发平滑扩展测试 (Tier 2: 500 Device Concurrency) (AC-5)
      6. 1000 级设备高并发压测与 SLA 硬门禁 (Tier 3: 1000 Device Concurrency & SLA Gates) (AC-6)
      7. 高压场景下的多租户强隔离防线 (AC-7)
    - **全工程全量回归测试通过率：112/112 tests (100% PASS)**，0 失败 0 回归。

- **阻塞项**：无。
- **已知问题**：无。

## 2. 下一步任务
- 全面总结项目全量 Gates (Gate 0 ~ Gate 6) 研发交付产物，输出生产环境部署指导手册与验收决议。

