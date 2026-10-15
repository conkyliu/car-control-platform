# Sprint 1 Task 4 Brief: 租户与多级机构管理中心 (`TenantListView.tsx` + `OrgTreeView.tsx`)

## Context & Base Commit
- **Base Commit**: `020e8094ebc7f7d7491eee4dd6e25c9af0b00419`
- **Plan File**: `docs/superpowers/plans/2026-10-10-admin-web-console.md`
- **Design Tokens**: `docs/design/design-tokens.md` (Ant Design 6 纯 CSS 变量体系)
- **Component Guidelines**: `docs/design/component-guidelines.md` (13 类状态规范与自然交互文案)
- **Tech Stack**: React 19 + TypeScript 5 + Ant Design 6 (原生纯 CSS 变量) + Vite 8 + Zustand 5
- **Work Directory**: `/Users/mac/Work/AI/car-control-platform`

## Requirements

### 1. 租户管理视图 (`apps/web/src/views/tenant/TenantListView.tsx`)
实现符合《功能清单》22.1~22.4 与 2.4 配额管理的企业级租户管理页面：
- **统计看板 (Header Summary)**：
  - 展示：总入驻企业租户数、有效活跃租户数、全网分配设备总配额、即将超限租户预警数。
- **筛选工具栏 (Toolbar)**：
  - 关键字快速搜索（按租户名称、租户代码模糊匹配）；
  - 状态筛选（全部 / 正常 ACTIVE / 停用 SUSPENDED / 即将到期）；
  - `+ 新接入租户` 按钮（触发创建租户 Modal）。
- **租户列表表格 (Table)**：
  - 列定义：
    - 租户名称与代码 (Tag 标识)；
    - 企业信用代码 / 负责人与电话；
    - 设备配额：展示已用/上限 Progress 进度条，使用率 $\ge 90\%$ 呈现警告色橙红；
    - 车辆配额：展示车辆分配量；
    - 状态：Tag 渲染（正常绿、停用灰、预警橙）；
    - 创建时间；
    - 操作列：`编辑`、`配额扩容`、`启用/停用`（带 Popconfirm 二次确认）。
- **模态框交互 (Modals)**：
  - `CreateTenantModal`：入驻表单，录入企业名称、租户唯一代码、初始设备配额、超管账号与密码；
  - `AdjustQuotaModal`：调整设备与车辆上限，校验新配额不得小于当前已占用数。

### 2. 多级机构管理视图 (`apps/web/src/views/tenant/OrgTreeView.tsx`)
实现符合《功能清单》2.1~2.6 的多级树形机构管理页面：
- **双栏分栏布局**：
  - **左侧树形面板 (35% 宽度)**：
    - Ant Design 6 `Tree` 组件，支持树节点层级展示（如：总公司 → 华东大区 → 杭州运营中心）；
    - 顶部实时搜索过滤输入框，匹配节点高亮展开；
    - 节点带有部门图标 (`ClusterOutlined`) 与停用标识；
    - 底部或顶部提供 `+ 添加顶级机构` 按钮。
  - **右侧详情与管理面板 (65% 宽度)**：
    - 展示当前选中节点的详细信息卡片：机构名称、机构编码、所属上级机构、负责人、联系方式、备注；
    - 机构下属资源概览卡片：本级及子机构设备总数、绑定车辆数、分配用户数；
    - 操作按钮：`+ 添加下级子机构`、`编辑本机构`、`停用机构`（若下属存在有效设备或车辆，提示需先迁移资产，阻断直接删除）。
- **模态框交互**：
  - `OrgFormModal`：支持新增子机构与编辑机构属性，自动关联上级机构 ID。

### 3. 与路由和 AdminLayout 联动
- 在 `apps/web/src/views/tenant/index.ts` 中导出 `TenantListView` 和 `OrgTreeView`。
- 在 `AdminLayout.tsx` 的 `renderActiveView()` 中挂载：
  - 路径 `/tenants` -> `<TenantListView />`
  - 路径 `/orgs` -> `<OrgTreeView />`
- 租户管理与机构管理均与 `useTenantStore` 及 `apps/web/src/api/tenant.ts` 接口体系联动。

### 4. 测试与构建验证
- 在 `apps/web/src/test/tenant-views.test.ts` 中编写测试：
  - 验证租户列表筛选与配额超限警戒计算；
  - 验证租户创建与配额调整校验；
  - 验证机构多级树构建算法与父子节点增删改查；
  - 验证租户数据隔离防线（无权限阻断）。
- 编译通过：`pnpm --filter @car-control/web build` 0 报错。
- 运行测试：`pnpm --filter @car-control/web test` 100% 通过。
- 提交信息：`feat(web): implement TenantListView and OrgTreeView management center`
- 报告文件：`.superpowers/sdd/2026-10-10-admin-web-console/task-4-report.md`
