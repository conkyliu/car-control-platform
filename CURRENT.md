# CURRENT.md · 当前执行状态记录

> 最后更新：2026-10-09  
> 当前阶段：**Gate 1 平台底座验收通过，准备进入 Gate 2 (Week 3-6) 设备与车辆管理**

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
    - 认证规范与架构决策：`docs/specs/auth.md`、`docs/specs/tenant.md`、`ADR-009`、`ADR-010`。
    - 共享 DTO 与权限枚举：`LoginRequestDto`、`LoginResponseDto`、`RefreshTokenRequestDto`、`UserTokenPayload`、`Permission`、`RoleCode`。
    - 安全算法：PBKDF2/Scrypt 加盐密码哈希，带随机 JTI 的无状态 HMAC-SHA256 JWT 工具。
    - 核心业务服务：`AuthService`、`UserService`、`TenantService`、`AuditService`。
    - 守卫与拦截器：`JwtAuthGuard`（自动解析 Bearer 令牌并绑定 `TenantContext`）、`PermissionsGuard`（细粒度 `@RequirePermissions` 校验）。
    - **Gate 1 验收测试 7/7 100% 通过**：
      1. 凭据正确登录签发双 Token 测试
      2. 密码错误 401 拦截测试
      3. Refresh Token 单次轮换与旧 Token 吊销重放防护测试
      4. RBAC 细粒度权限守卫 403 拦截测试
      5. 审计流水多租户严格隔离测试
      6. 设备接入配额硬约束拦截测试
      7. 关键操作 traceId 审计留痕追踪测试

- **阻塞项**：无。
- **已知问题**：无。

## 2. 下一步任务
- 启动 **Gate 2 (Week 3-6): Device / Vehicle 设备与车辆管理**：
  1. 完善设备建档、批量导入、设备状态反查（`Device -> Vehicle -> Project -> Tenant`）。
  2. 完善车辆档案、车型模板能力继承、设备绑定/解绑业务。
  3. 完善设备真实在线状态实时同步。
