# Sprint 1 Task 3 Implementation Report: Ant Design 6 响应式 Admin 主布局与多租户中枢

- **Task**: Sprint 1 Task 3: Ant Design 6 响应式 Admin 主布局与多租户中枢 (`AdminLayout.tsx` + `AuthGuard.tsx`)
- **Status**: Completed
- **Commit**: `aebfd00c065becf814ef3cfaa4d0307e94726d4f`
- **Base Commit**: `f5579a5ac95600fe4e3e43a6728abbe0d37412c3`
- **Spec References**:
  - `docs/design/page-specs/admin-layout.md`
  - `docs/design/design-tokens.md`
  - `.superpowers/sdd/2026-10-10-admin-web-console/task-3-brief.md`

---

## 1. 交付物与文件清单

| 文件路径 | 类型 | 功能说明 |
|---|---|---|
| `apps/web/src/layouts/AdminLayout.tsx` | 新增 | 主后台响应式骨架（固定可折叠深蓝侧边栏、顶部沉浸 Header、多标签栏、工作区与底部版权说明） |
| `apps/web/src/layouts/TenantSelector.tsx` | 新增 | 全局多租户切换器（`SUPER_ADMIN` 下拉选择 + 配额/状态 Badge；普通租户只读锁定展示） |
| `apps/web/src/layouts/AlarmNotificationBell.tsx` | 新增 | 未读告警红点角标与最近高危告警抽屉，支持一键直达报警中心 |
| `apps/web/src/layouts/HeaderUserMenu.tsx` | 新增 | 用户中心（头像、姓名、角色 Tag、修改密码 Drawer、退出登录 Popconfirm 确认） |
| `apps/web/src/layouts/NavTabs.tsx` | 新增 | 多标签页工作台（标签切换、关闭、右键上下文菜单与批量操作：关闭当前/关闭其他/全部关闭） |
| `apps/web/src/layouts/admin-layout-core.ts` | 新增 | 布局纯逻辑核心（租户配额格式化、租户切换上下文重载、退出登录会话清空、鉴权路由判定） |
| `apps/web/src/router/AuthGuard.tsx` | 新增 | 路由鉴权守卫（未登录渲染 `LoginView`，已登录调度 `AdminLayout`） |
| `apps/web/src/router/PermissionGuard.tsx` | 新增 | 声明式按钮级 RBAC 权限守卫 `<PermissionGuard code="perm">{children}</PermissionGuard>` |
| `apps/web/src/store/useNavTabsStore.ts` | 新增 | 多标签页 Zustand 状态管理器（管理 activeKey、tabs 队列、refresh 计数器） |
| `apps/web/src/router/routes.ts` | 修改 | 新增 `filterAccessibleRoutes`、`getAccessibleRoutesByCategory`、`computeBreadcrumbs` |
| `apps/web/src/App.tsx` | 修改 | 将顶层入口改造为挂载 Ant Design 6 `ConfigProvider` 与 `AuthGuard` |
| `apps/web/src/test/admin-layout.test.ts` | 新增 | 自动化测试套件（RBAC 菜单过滤、多租户切换、NavTabs 生命周期、AuthGuard 拦截） |

---

## 2. 规范符合性核验 (Parity & Spec Checklist)

- [x] **左侧侧边栏 (Sider & Menu)**:
  - 宽度可折叠：`width: 220px`，`collapsedWidth: 64px`，平滑动画过渡；
  - 顶部 Brand Logo：展示车标图标与标题“手机控车平台”（折叠时仅展示 Icon）；
  - 动态 RBAC 菜单：根据 `useAuthStore.permissions` 与 `routes.ts` 的 `filterAccessibleRoutes` 动态过滤，无权限项彻底隐藏，空分组自动剔除；
  - 菜单分类归集：概览看板、平台中枢、资产管理、车控运营、位置与围栏、运维保障；激活路由高亮。
- [x] **顶部 Header 沉浸栏**:
  - 折叠展开切换按钮（`MenuFoldOutlined` / `MenuUnfoldOutlined`）；
  - 全局租户选择器（`TenantSelector`）：`SUPER_ADMIN` 显示租户下拉与配额 Badge，切换后更新 `useTenantStore.currentTenantId` 并触发视图重载；普通租户只读锁定展示；
  - 面包屑导航（`Breadcrumb`）：根据当前激活路由自动计算多级层级路径；
  - 未读告警通知钟（`AlarmNotificationBell`）：展示未读告警红点角标，点击展示最近高危告警抽屉与直达通道；
  - 用户中心（`HeaderUserMenu`）：头像、姓名、角色 Tag，下拉包含“修改密码” Drawer 与“退出登录” Popconfirm。
- [x] **多标签页工作台 (`NavTabs`)**:
  - 顶部标签栏支持多页面并行打开（默认仪表盘常驻，不可关闭）；
  - 支持标签点击切换激活页、小叉关闭、右键上下文菜单（刷新当前、关闭当前、关闭其他、全部关闭）。
- [x] **主内容区 (Content) & Footer**:
  - 渲染当前激活的业务视图；
  - 底部版权说明：`Copyright © 2026 手机控车平台. All rights reserved.`
- [x] **Ant Design 6 纯 CSS 变量**:
  - 配置 `carControlTheme` 并通过 `ConfigProvider` 挂载，开启原生 CSS 变量体系，0 运行时 CSS-in-JS 开销。

---

## 3. 测试与构建验证

### 自动化测试验证
执行命令：`pnpm --filter @car-control/web run test`
- 测试套件全部通过：
  - `AdminLayout and Navigation Hub Core Test Suite` (7/7 pass)
    - `filterAccessibleRoutes filters out hidden routes and unauthorized routes`
    - `getAccessibleRoutesByCategory groups accessible routes and omits empty categories`
    - `TenantSelector updates active tenant and formats quota correctly`
    - `NavTabs handles multi-tabs lifecycle and boundary conditions`
    - `computeBreadcrumbs generates hierarchical breadcrumbs for given path`
    - `AuthGuard and PermissionGuard evaluate access state accurately`
    - `executeLogout purges auth tokens, tenant state, and resets nav tabs`
  - `API Client, Stores, and Route Definitions Test Suite` (9/9 pass)
  - `LoginView Page Core Logic Test Suite` (5/5 pass)
  - `SliderCaptcha Human Verification Logic Test Suite` (4/4 pass)
- **总测试数**: 29 / 29 通过 (100% pass)

### 生产构建验证
执行命令：`pnpm --filter @car-control/web run build`
- `tsc && vite build` 编译产物生成正常，0 TypeScript 错误，0 构建警告/报错。

---

## 4. Review 审查问题修复与优化报告

- **Fix Commit**: `020e8094ebc7f7d7491eee4dd6e25c9af0b00419`
- **修复项说明**:
  1. **HeaderUserMenu 退出登录调用服务端 `logoutApi`**：
     - 在 `HeaderUserMenu.tsx` 中引入 `logoutApi`（`apps/web/src/api/auth.ts`），并在确认退出时传入 `executeLogout(logoutApi)`，确保向后端发送撤销请求并触发安全退出事件。
  2. **TenantSelector 普通租户初始化租户隔离绑定**：
     - 在 `TenantSelector.tsx` 的 `useEffect` 初始化逻辑中，非 `SUPER_ADMIN` 用户若持有 `user.tenantId`，强制且优先绑定为当前活动租户，杜绝使用演示租户覆盖造成的租户隔离穿透。
  3. **Tab 刷新与租户切换视图重载绑定**：
     - 在 `AdminLayout.tsx` 中订阅当前活动标签的刷新计数值 `const refreshCounter = useNavTabsStore((s) => s.refreshCount[s.activeKey] ?? 0);`，并将 `<Content key={`${activeKey}-${refreshCounter}`}>` 进行 key 绑定，确保右键刷新标签及租户切换时触发业务视图强制卸载重新挂载。
  4. **Sider Menu 分组默认展开**：
     - 在 `AdminLayout.tsx` 的 `<Menu>` 组件添加 `defaultOpenKeys={Object.keys(accessibleGroups).map((k) => 'group-' + k)}`，首屏即完整展示二级菜单项。
- **回归验证**:
  - `pnpm --filter @car-control/web test`: 29/29 测试 100% 通过（耗时 864ms）。
  - `pnpm --filter @car-control/web build`: 0 错误通过（耗时 729ms）。
