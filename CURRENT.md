# CURRENT.md · 当前执行状态记录

> 最后更新：2026-10-08  
> 当前阶段：**Gate 0 完成，进入 Week 2-4 Foundation 平台底座建设**

## 1. 当前进展
- **已完成**：
  - [x] 初始化 `car-control-platform` 独立 Git 仓库与 Monorepo 工程体系。
  - [x] 确立 AI 协作者工程规范：`AGENTS.md`、`ARCHITECTURE.md`、`ROADMAP.md`、`docs/product/traceability.md`。
  - [x] 架构决策记录：`ADR-001 Modular Monolith`、`ADR-003 Aliyun MQTT Transport`、`ADR-004 Command State Machine`。
  - [x] 核心业务规范：`command.md`（完整 11 状态机）、`capability.md`（3 级继承）、`mqtt.md`（标准 Topic 与报文）。
  - [x] 共享基础设施包：`@car-control/contracts`、`@car-control/domain-types`、`@car-control/config`、`@car-control/database`。
  - [x] 设备模拟器：`@car-control/simulator`（设备上线、周期心跳、下行命令监听、执行时延、成功 ACK、拒绝 ACK、丢包及重复 ACK 仿真）。
  - [x] 业务后端核心：`@car-control/api`（CommandService、MessagingPort、WebSocketGateway、REST Controller）。
  - [x] **Gate 0: Transport POC 端到端闭环验证通过**：
    1. 设备上线与心跳上报测试
    2. API -> Command -> Simulator -> ACK -> SUCCESS & WebSocket 事件闭环测试
    3. 幂等性防护（相同 idempotencyKey 返回已有指令）测试
    4. 设备业务拒绝（DEVICE_REJECTED）测试
    5. ACK 超时（TIMEOUT）处理测试
    6. 迟到 ACK 与重复 ACK 终态不可逆防护测试
  - [x] **多租户数据隔离机制验证通过**：
    1. 无 TenantContext 触发安全异常拦截
    2. 租户 A 与租户 B 互不可见、越权查询返回 null、越权删除被拦截
    3. 列表查询强制限定租户作用域
  - [x] Web 控制台管理应用：`@car-control/web`（React 19 + Vite + AntD 5 + Zustand 控车操作面板与实时状态机流水完成构建）。

- **阻塞项**：无。
- **已知问题**：无。

## 2. 下一步任务
- 启动 **Week 2-4: Foundation**：
  1. 完善 Auth 认证模块（用户注册、登录、密码 Hash、JWT Access/Refresh Token 流转）。
  2. 完善 RBAC 权限与数据作用域拦截中间件。
  3. 完善组织机构树与项目关联。
