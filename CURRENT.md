# CURRENT.md · 当前执行状态记录

> 最后更新：2026-10-09  
> 当前阶段：**Gate 3 (Week 5-10) 控车核心域与三级能力继承引擎验收全部通过，准备进入 Gate 4 (Week 7-12) 实时业务与报警轨迹中心**

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
    - **Gate 3 验收测试 8/8 100% 通过**：
      1. 车型模板继承拦截（如纯电车型禁用点火并给出清晰原因）
      2. 项目级覆盖继承拦截（如大客户项目覆盖禁用后备箱开启）
      3. 单车级个性化覆盖最高优先级验证（如单车覆盖禁用车窗）
      4. Security L1 校验：缺失安全码与错误安全码双重阻断
      5. Security L2 校验：高危指令缺失二次确认凭据阻断
      6. 滑动窗口频次限流：快速重发触发 429 冷却拦截
      7. 车辆运营状态风控：`LOCKED` 与 `MAINTENANCE` 状态安全阻断
      8. 端到端全链路闭环：下发指令 -> 模拟器应答 -> WAITING_ACK -> SUCCESS -> WebSocket 广播
    - **全工程回归测试通过率：41/41 (100%)**。

- **阻塞项**：无。
- **已知问题**：已修复此前频次限制在错误凭据拦截前过早计时的缺陷，全套验收套件测试全绿。

## 2. 下一步任务
- 启动 **Gate 4 (Week 7-12): Telemetry, Geofence & Alert Center (实时业务与报警轨迹中心)**：
  1. 编写遥测与报警规范：`docs/specs/telemetry.md`, `docs/specs/alert.md`。
  2. 扩展共享契约：定义 GPS 上报报文格式、电子围栏数据结构、报警事件枚举。
  3. 建设遥测上行处理管道与地理围栏出入判定引擎。
  4. 建设报警中心生命周期管理与实时广播推送。
