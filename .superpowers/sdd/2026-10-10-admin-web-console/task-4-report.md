# Sprint 1 Task 4 Implementation Report: 租户与多级机构管理中心

- **Task**: Sprint 1 Task 4: 租户与多级机构管理中心 (`TenantListView.tsx` + `OrgTreeView.tsx`)
- **Status**: Completed
- **Commit**: `ed51918a720f1761553f23a6d57c662eb0c6edb2`
- **Base Commit**: `020e8094ebc7f7d7491eee4dd6e25c9af0b00419`
- **Spec References**:
  - `docs/superpowers/plans/2026-10-10-admin-web-console.md`
  - `docs/design/design-tokens.md`
  - `docs/design/component-guidelines.md`
  - `.superpowers/sdd/2026-10-10-admin-web-console/task-4-brief.md`

---

## 1. 交付物与文件清单

| 文件路径 | 类型 | 功能说明 |
|---|---|---|
| `apps/web/src/views/tenant/tenant-core.ts` | 新增 | 租户与机构核心纯逻辑层（统计计算、筛选匹配、配额警戒计算、配额调整校验、多级树递归构建与资源向上聚合、树搜索过滤、机构停用前置安全资产校验） |
| `apps/web/src/views/tenant/TenantListView.tsx` | 新增 | 企业级租户管理视图（4 类核心统计指标看板、多维组合筛选工具栏、Ant Design 6 表格、配额进度条警戒色彩、新接入租户 Modal、配额扩容 Modal、编辑与停用 Popconfirm） |
| `apps/web/src/views/tenant/OrgTreeView.tsx` | 新增 | 多级机构管理视图（35%/65% 双栏布局、左侧实时搜索与高亮机构树、右侧机构详情与下属资源指标全景卡片、添加顶级机构/下级机构/编辑/停用资产安全阻断） |
| `apps/web/src/views/tenant/index.ts` | 新增 | 统一导出 `TenantListView`、`OrgTreeView` 与 `tenant-core` 数据契约 |
| `apps/web/src/api/tenant.ts` | 修改 | 扩展租户与机构 API 体系：`createTenantApi`、`updateTenantApi`、`adjustTenantQuotaApi`、`updateOrgApi`、`deleteOrgApi` |
| `apps/web/src/store/useTenantStore.ts` | 修改 | 扩展 `TenantDto` 与 `OrgNodeDto` 业务字段（联系人、统一社会信用代码、已用设备与车辆数、状态、直属与汇总资源统计等） |
| `apps/web/src/layouts/AdminLayout.tsx` | 修改 | 在 `renderActiveView()` 中挂载 `/tenants` -> `<TenantListView />` 与 `/orgs` -> `<OrgTreeView />` |
| `apps/web/src/test/tenant-views.test.ts` | 新增 | 自动化测试套件（9 大核心场景覆盖：租户统计指标、模糊搜索与状态筛选、配额阈值预警、配额硬约束校验、多级机构树构建与聚合、搜索展开算法、资产阻断门禁、多租户上下文隔离） |

---

## 2. 规范符合性核验 (Parity & Spec Checklist)

### 2.1 租户管理视图 (`TenantListView.tsx`)
- [x] **统计看板 (Header Summary)**:
  - 总入驻企业租户数（`totalTenants`）、有效活跃租户数（`activeTenants`，绿色）、全网分配设备总配额（`totalDeviceQuota`，紫色）、即将超限(≥90%)租户预警数（`warningTenantsCount`，橙红色）；
- [x] **筛选工具栏 (Toolbar)**:
  - 关键字快速模糊搜索（名称、租户代码、统一社会信用代码、联系人）；
  - 状态筛选（全部 / 正常运行 ACTIVE / 暂停服务 SUSPENDED / 已停用 DISABLED / 配额超限预警 WARNING）；
  - `+ 新接入租户` 按钮触发入驻 Modal；
- [x] **租户列表表格 (Table)**:
  - 租户名称与代码（`Tag color="geekblue"` 规范代码标识）；
  - 统一社会信用代码 / 负责人与电话；
  - 设备配额使用率（Progress 进度条，使用率 $\ge 90\%$ 呈现警告色 `#fa541c` / `#ff4d4f` 与“临界预警”Tag）；
  - 车辆配额（展示车辆分配量与图标）；
  - 状态 Tag 渲染（正常绿 `ACTIVE`、已暂停橙 `SUSPENDED`、停用灰 `DISABLED`）；
  - 入驻时间格式化；
  - 操作列：`编辑` 基础信息、`配额扩容` 模态框、`启用/停用`（带 Popconfirm 二次防误触与影响提示）；
- [x] **模态框交互**:
  - `CreateTenantModal`：录入企业名称、租户唯一代码（大写英文字母与下划线）、统一社会信用代码、负责人及电话、初始设备配额、超管账号与密码；
  - `AdjustQuotaModal`：调整设备上限与车辆上限，严格校验新配额不得小于当前已占用数。

### 2.2 多级机构管理视图 (`OrgTreeView.tsx`)
- [x] **双栏分栏布局**:
  - **左侧树形面板 (35% 宽度)**：
    - Ant Design 6 `Tree` 组件，支持树节点多层级展示（总指挥中心 → 华东干线事业部 → 杭州/宁波运营中心）；
    - 顶部实时搜索过滤输入框，匹配节点蓝色高亮，且自动展开匹配节点的所有父级祖先分支；
    - 节点带有部门图标（`ClusterOutlined`）、停用标识与下属设备聚合数量；
    - 顶部提供 `+ 添加顶级机构` 按钮；
  - **右侧详情与管理面板 (65% 宽度)**：
    - 选中节点详细信息卡片：机构名称、机构唯一编码 Tag、所属上级机构路径、负责人、联系电话、职责备注、状态 Tag；
    - 下属资源概览卡片：统计管辖车载设备总数（本级直属 + 子级汇总）、绑定运营车辆数、分配中台账户数；
    - 操作按钮：`+ 添加下级子机构`、`编辑本机构`、`停用机构/启用机构`；
    - 资产安全阻断门禁：若本级或下属分支存在有效设备或车辆，停用时触发阻断提示“该机构或其下级机构下仍有 X 台设备与 Y 辆车辆，请先迁移资产后再停用”，防范数据孤儿与资产失控。

### 2.3 与路由和 AdminLayout 联动
- [x] `TenantListView` 与 `OrgTreeView` 通过 `apps/web/src/views/tenant/index.ts` 导出；
- [x] 在 `AdminLayout.tsx` 的 `renderActiveView()` 中挂载 `/tenants` 与 `/orgs`，点击侧边栏菜单即刻呈现对应工作台；
- [x] 完整接入 `useTenantStore` 全局多租户状态与 `api/tenant.ts`。

---

## 3. 测试与构建验证

### 自动化测试验证
执行命令：`pnpm --filter @car-control/web run test`
- 测试全部通过：
  - `Tenant & Org Management Center Logic Test Suite (TDD)` (9/9 pass)
    - `calculateTenantStats accurately computes summary metrics`
    - `filterTenants handles keyword and status filters correctly`
    - `calculateQuotaUsage computes percentage and warning flag correctly`
    - `validateQuotaAdjustment checks and rejects quotas smaller than current used counts`
    - `validateTenantForm validates required fields and codes`
    - `buildOrgTree builds recursive hierarchy and aggregates sub-resource counts`
    - `filterOrgTree matches nodes and generates expanded keys along the branch`
    - `canDisableOrg blocks disabling if devices or vehicles are associated`
    - `useTenantStore correctly maintains tenant and org state isolation`
  - `AdminLayout and Navigation Hub Core Test Suite` (7/7 pass)
  - `API Client, Stores, and Route Definitions Test Suite` (9/9 pass)
  - `LoginView Page Core Logic Test Suite` (5/5 pass)
  - `SliderCaptcha Human Verification Logic Test Suite` (4/4 pass)
- **总测试数**: 39 / 39 通过 (100% pass)

### 生产构建验证
执行命令：`pnpm --filter @car-control/web run build`
- `tsc && vite build` 0 错误编译通过，产物打包完成。

---

## 4. Review 审查问题修复报告 (Fix Round 1)

- **修复项说明**:
  1. **`createOrgApi` 补充传递组织元数据字段** (`OrgTreeView.tsx`):
     - 新建顶级机构及下属子机构表单提交时，将 `leader: values.leader`、`phone: values.phone`、`description: values.description` 完整透传给 `createOrgApi`，确保组织部门负责人与联系方式的后端持久化。
  2. **租户切换自动重新拉取机构树** (`OrgTreeView.tsx`):
     - 在 `useEffect([currentTenantId])` 监听中移除 `orgTreeRaw.length === 0` 条件拦截，确保当多租户切换器切换 `currentTenantId` 时始终重新触发 `loadOrgs()`，严格保证多租户组织数据上下文隔离。
  3. **区分网络离线错误与业务 ApiError** (`TenantListView.tsx` 与 `OrgTreeView.tsx`):
     - 引入 `isApiError` 守卫函数，当捕获的错误包含 HTTP 业务状态码（400/403/409 等）时，直接展示后端返回的真实错误信息（`message.error(error.message)`）并阻断提交，杜绝静默 Mock 成功掩盖真实权限与规则冲突；仅在无网络/无服务端环境时保留安全降级。
  4. **扩展自动化测试覆盖**:
     - 在 `tenant-views.test.ts` 新增 `isApiError` 异常分类判定测试以及机构元数据透传完整性测试，总测试用例增至 41/41 (100% 通过)。
