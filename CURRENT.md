# CURRENT.md · 当前执行状态记录

> 最后更新：2026-10-08  
> 当前阶段：**Phase 1 (Week 0-1) - Transport POC & 规范基础设施**

## 1. 当前进展
- **已完成**：
  - 初始化 Monorepo 目录结构与 Git 仓库。
  - 确立核心规范：`AGENTS.md`、`ARCHITECTURE.md`、`ROADMAP.md`。
- **进行中**：
  - 编写系统 ADR（架构决策记录）与核心领域 Spec（`docs/specs/*`）。
  - 配置 pnpm Monorepo 基础配置文件 (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`)。
  - 建设 `packages/contracts`、`packages/domain-types` 与 `packages/config`。
  - 建设 `apps/simulator` 与 `apps/api` 运行 Gate 0 Transport POC 闭环。
- **阻塞项**：无。
- **已知问题**：无。

## 2. 下一步任务
1. 创建系统核心 ADR（ADR-001 ~ ADR-005）与 Command/Capability/MQTT 规范。
2. 搭建 pnpm workspace，引入 TypeScript 基础配置。
3. 编写共享契约与设备模拟器。
