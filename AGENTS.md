# AGENTS.md · 控车平台工程与 AI 协作者守则

本文档是本项目所有 Agent（Codex、Antigravity、SubAgent 等）的不可违反工程规则与红线。

## 1. 核心工程红线 (Non-negotiable Rules)

1. **链路直达约束**：React / 前端客户端绝对禁止直接连接设备 MQTT Broker。所有控车指令必须调用 NestJS Business API。
2. **命令收敛原则**：所有控车业务逻辑必须收敛于 `CommandDomain`（`CommandService`），严禁绕过状态机与权限下发指令。
3. **安全拦截链**：控车前必须依次执行：`TenantContext 检查 -> 权限检查 -> 车辆归属检查 -> 车型/车辆能力检查 -> 安全等级 (L0/L1/L2) -> 频次限制 -> 车辆/设备状态检查`。
4. **协议隔离原则**：设备私有编码、TLV、AES、CRC、MQTT Payload 解构只能存在于 Gateway/Messaging/Protocol 适配层，业务领域层只感知标准 Domain Command/Event。
5. **分层架构规范**：Controller 仅负责请求入参校验、路由和响应映射，不写业务逻辑；Prisma Model / 数据库实体绝对禁止直接透传给前端 API 响应。
6. **多租户数据隔离**：绝对禁止在无 `tenantId` 过滤条件的前提下查询业务数据（除系统级平台运营总控且显式切换上下文外）。禁止以“单一 ORM 拦截插件”作为唯一防线，必须依靠 Repository 层显式作用域 + E2E 验证。
7. **审计留痕要求**：所有控车操作、敏感指令及安全认证必须持久化记录到 `AuditLog`，并保证关联 `traceId` / `requestId` / `operatorId`。
8. **协议契约同步**：任何设备协议、MQTT Topic、CommandCode 变动，必须同步更新 `docs/specs/*` 并在 `apps/simulator` 设备模拟器中增加对应回归用例。
9. **测试质量底线**：严禁为了让测试通过而弱化或删除断言；新功能必须配套单元测试与集成测试，核心控车与多租户隔离必须有 E2E 测试。
10. **上下文一致性**：每次修改代码前后，必须保持与 `CURRENT.md`、`ROADMAP.md` 及对应 Spec 一致。

## 2. 模块与领域边界 (Domain Boundaries)

- **Auth & Tenant**: 鉴权、JWT、租户（SaaS 隔离）、机构树、项目（Project）、用户与 RBAC 权限。
- **Device & Vehicle**: 设备建档、SIM卡、绑定关系、实时状态、车型与品牌。
- **Capability**: 3 级继承（全局字典 -> 项目配置 -> 车型模板 -> 单车覆盖），解析最终有效能力与安全等级。
- **Command & IoT**: 命令完整状态机（CREATED -> VALIDATING -> QUEUED -> SENDING -> SENT -> WAITING_ACK -> SUCCESS / FAILED / TIMEOUT / DEVICE_REJECTED / EXPIRED）、幂等控制、重试与 ACK 处理。
- **Realtime / Messaging**: MQTT 连接适配、WebSocket 房间鉴权推送（禁止全租户广播敏感控车状态，必须房间授权）。
- **Alarm & Location**: 设备报警记录与规则初筛、设备定位分区存储与轨迹抽稀。
- **OTA**: 固件版本元数据、分批升级计划、熄火安全校验、断点续传。

领域间禁止形成环形依赖（如 Command -> Vehicle -> Device -> Project -> Tenant -> Command）。

## 3. Git 与修改规范

- 代码提交采用语义化规范：`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`。
- 修改核心 Schema (`packages/contracts`, `prisma/schema.prisma`) 需在更新前全面评估依赖影响。
