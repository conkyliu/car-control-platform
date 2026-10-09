# CURRENT.md · 当前执行状态记录

> 最后更新：2026-10-09  
> 当前阶段：**Gate 2 设备与车辆管理验收通过，准备进入 Gate 3 (Week 5-10) 控车核心域与三级能力继承引擎**

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
    - 核心业务服务：`DeviceService`（唯一性校验、租户配额硬拦截、批量导入去重、状态机管控、四级反查）、`VehicleService`（车辆录入、防占用软硬件绑定/解绑、在线状态联动）、`ProjectService`。
    - 接口控制器：`DeviceController`、`VehicleController`。
    - **Gate 2 验收测试 7/7 100% 通过**：
      1. 设备单条建档与 DeviceNo/IMEI 唯一性校验
      2. 批量导入设备与批次内部防重复校验
      3. 车辆建档与 VIN 唯一性校验
      4. 软硬件绑定与防占用/换件解绑完整业务流
      5. `Device -> Vehicle -> Project -> Tenant` 四级反查链路验证
      6. 跨租户硬件绑定安全拦截验证
      7. 设备心跳上线与车辆看板状态实时联动验证

- **阻塞项**：无。
- **已知问题**：无。

## 2. 下一步任务
- 启动 **Gate 3 (Week 5-10): Command Core & Capability (控车核心域与能力引擎)**：
  1. 建设 `CapabilityEngine`：三级能力继承解析引擎（全局字典 -> 项目配置 -> 车型模板 -> 单车覆盖），解析最终生效配置。
  2. 建设 `SecurityGuard`：车控安全等级校验（L0 无需、L1 安全码二次验证、L2 强安全二次确认）与频次限制（Rate Limiting）。
  3. 整合 CommandService 与 CapabilityEngine，完成具备完整车型能力与安全等级检查的端到端控车闭环。
