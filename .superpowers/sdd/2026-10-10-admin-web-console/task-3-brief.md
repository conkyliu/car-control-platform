# Sprint 1 Task 3 Brief: Ant Design 6 响应式 Admin 主布局与多租户中枢 (`AdminLayout.tsx`)

## Context & Base Commit
- **Base Commit**: `f5579a5ac95600fe4e3e43a6728abbe0d37412c3`
- **Plan File**: `docs/superpowers/plans/2026-10-10-admin-web-console.md`
- **Page Spec**: `docs/design/page-specs/admin-layout.md` (已通过 Sprint 0 评审)
- **Design Tokens**: `docs/design/design-tokens.md` (Ant Design 6 纯 CSS 变量体系)
- **Component Guidelines**: `docs/design/component-guidelines.md` (13 类状态规范与自然交互文案)
- **Tech Stack**: React 19 + TypeScript 5 + Ant Design 6 (原生纯 CSS 变量) + Vite 8 + Zustand 5
- **Work Directory**: `/Users/mac/Work/AI/car-control-platform`

## Requirements

### 1. 主后台布局架构 (`apps/web/src/layouts/AdminLayout.tsx`)
严格匹配 `docs/design/page-specs/admin-layout.md` 的结构与交互：
- **左侧侧边栏 (Sider & Menu)**：
  - 宽度可折叠 (`width: 220`, `collapsedWidth: 64`)，带平滑动画；
  - 顶部 Brand Logo：展示车标图标与标题“手机控车平台”（收起时仅展示 Icon）；
  - 动态 RBAC 菜单：根据 `useAuthStore.permissions` 与 `routes.ts` 的 `filterAccessibleRoutes` 动态过滤；
  - 菜单分组：概览看板、平台中枢、资产管理、车控运营、位置与围栏、运维保障；当前激活路由高亮。
- **顶部 Header 沉浸栏**：
  - 折叠展开切换按钮 (`MenuFoldOutlined` / `MenuUnfoldOutlined`)；
  - **全局租户切换器 (`TenantSelector`)**：
    - `SUPER_ADMIN` 显示下拉选择租户列表（名称 + 配额 Badge），选择后更新 `useTenantStore.setCurrentTenantId` 并触发全局请求上下文切换；
    - 普通租户只读展示租户名称与配额（例如 `配额: 850/1000`）；
  - **面包屑导航 (Breadcrumb)**：根据当前活动路由自动计算层级路径；
  - **未读告警通知钟 (`AlarmNotificationBell`)**：展示未读告警红点角标，点击展示最近告警下拉抽屉；
  - **用户中心 (`HeaderUserMenu`)**：用户头像、姓名、角色 Tag，下拉包含“修改密码”（弹出 Drawer）与“退出登录”（Popconfirm 确认后调用 `logoutApi` 并清理状态）。
- **多标签页工作台 (`NavTabs`)**：
  - 顶部标签栏支持多页面并行打开（如：[ 仪表盘 x ] [ 设备管理 x ] [ 远程车控 x ]）；
  - 支持点击切换激活页、点击小叉关闭、右键上下文菜单（关闭当前、关闭其他、全部关闭）。
- **主内容区 (Content)**：
  - 渲染当前激活的业务视图；
  - 底部版权说明：`Copyright © 2026 手机控车平台. All rights reserved.`

### 2. 路由鉴权守卫与组件级权限控制 (`apps/web/src/router/`)
- `apps/web/src/router/AuthGuard.tsx`:
  - 检查 `useAuthStore.isAuthenticated`；
  - 未登录时渲染 `LoginView`；
  - 已登录时渲染 `AdminLayout`，并根据当前激活路径动态调度视图。
- `apps/web/src/router/PermissionGuard.tsx`:
  - 声明式按钮级权限守卫 `<PermissionGuard code="device:write" fallback={null}>{children}</PermissionGuard>`。

### 3. 测试与构建验证
- 在 `apps/web/src/test/admin-layout.test.ts` 中编写测试：
  - 验证 `AdminLayout` 根据用户权限动态过滤菜单项；
  - 验证 `TenantSelector` 租户切换更新 `useTenantStore`；
  - 验证 `NavTabs` 打开新标签、切换标签、关闭标签逻辑；
  - 验证 `AuthGuard` 鉴权拦截与登录态放行；
  - 验证退出登录清理状态并重置。
- 编译通过：`pnpm --filter @car-control/web build` 0 报错。
- 运行测试：`pnpm --filter @car-control/web test` 100% 通过。
- 提交信息：`feat(web): implement Ant Design 6 responsive AdminLayout and AuthGuard`
- 报告文件：`.superpowers/sdd/2026-10-10-admin-web-console/task-3-report.md`
