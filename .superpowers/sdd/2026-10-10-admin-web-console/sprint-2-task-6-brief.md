# Sprint 2 Task 6 Brief: 车型品牌维护与项目归属中心 (`ModelManageView.tsx` & `ProjectManageView.tsx`)

## 1. 任务背景与目标
基于《手机控车平台功能清单.docx》模块 05（5.2 车型管理、5.3 车辆品牌管理）与模块 21（21.1 项目管理、21.2 设备项目归属）、《手机控车平台-Admin管理后台开发计划-V2.1-补充PM与UIUX.md》与《docs/product/requirements-map.md》，在 `apps/web` 中交付车型品牌维护中心 (`ModelManageView.tsx`) 与项目归属管理中心 (`ProjectManageView.tsx`)。
支持：
1. **车型管理与协议车型代号 0x02 映射**：
   - 协议车型代号 0x02 格式校验（16 进制，如 `0x0101`, `0x0201`，正则 `/^0x[0-9a-fA-F]{4}$/`），与底层车控协议规范 100% 映射；
   - 动力类型（纯电动 EV / 插电混动 PHEV / 燃油 ICE / 增程式 REEV）；
   - 控车能力模板关联；
   - 车型关联已有车辆防删除安全守卫。
2. **品牌与车系维护**：
   - 品牌名称、品牌英文大写代号、国别性质；
   - 品牌关联已有车型防删除安全守卫。
3. **项目管理与设备项目归属配置**：
   - 项目生命周期状态（ACTIVE 运营中 / PAUSED 暂停 / ARCHIVED 归档）；
   - 项目设备分配与回收（支持设备批量调配至指定项目）；
   - 项目关联运行中车辆/在线设备防归档保护。
4. **路由与主布局集成**：
   - `RoutePath.MODELS = '/models'` 与 `RoutePath.PROJECTS = '/projects'`；
   - 保持主菜单 14 项基准不受破坏（`hideInMenu: true`）；
   - 支持通过 NavTabs、多标签页切换，以及 `VehicleListView` / `DeviceListView` 的快捷入口直接唤起。

---

## 2. 详细功能与交互规范

### A. 车型与品牌纯逻辑与数据模型 (`apps/web/src/views/vehicle/model-core.ts` 或 `vehicle-core.ts`)
1. **协议车型代号 0x02 校验 (`validateProtocolCode`)**：
   - 正则：`/^0x[0-9a-fA-F]{4}$/`；
   - 格式化：统一转为小写十六进制字符串（如 `0x0101`）；
   - 业务含义：车控通讯协议 0x02 指令集所对应的两字节车型代号。
2. **品牌代号校验 (`validateBrandCode`)**：
   - 正则：`/^[A-Z0-9_]{2,12}$/`（大写英文或数字）。
3. **车型防删除守卫 (`canDeleteModel`)**：
   - 若 `model.vehicleCount > 0`，返回 `false` 并提示“已有 X 辆车引用该车型，禁止删除”。
4. **品牌防删除守卫 (`canDeleteBrand`)**：
   - 若 `brand.modelCount > 0`，返回 `false` 并提示“该品牌下存在 X 个车型，禁止删除”。
5. **增删改查纯函数与种子池**：
   - `SEED_BRANDS`, `SEED_MODELS` 扩展完整字段。

---

### B. 项目管理纯逻辑与数据模型 (`apps/web/src/views/device/project-core.ts` 或 `device-core.ts`)
1. **项目代号校验 (`validateProjectCode`)**：
   - 正则：`/^[A-Z0-9_]{3,20}$/`（大写字母/数字/下划线）。
2. **项目归档守卫 (`canArchiveProject`)**：
   - 若项目下存在在线设备或绑定车辆，禁止直接归档，提示安全原因。
3. **设备分配与项目转移计算纯函数 (`allocateDevices`)**：
   - 接收项目 ID 与待分配设备 ID 列表，原子化更新设备池中的 `projectId` 与 `projectName`。

---

### C. 视图组件实现

#### 1. `apps/web/src/views/vehicle/ModelManageView.tsx`
- 双 Tab 设计（Ant Design 6 `Tabs`）：
  - **Tab 1: 车型管理**：
    - 统计卡片：车型总数、纯电 EV 数、插混 PHEV 数、燃油/增程数；
    - 筛选栏：品牌选择下拉、动力类型下拉、关键字搜索 (车型名/代号)、`+ 新建车型` 按钮；
    - 表格列：车型名称、归属品牌、协议车型代号 (0x02 monospace code)、动力类型 Tag、关联能力模板 Tag、归属车辆数 Badge、操作列 (编辑、删除 Popconfirm)；
    - 车型新建/编辑模态框 (`ModelEditModal`)。
  - **Tab 2: 品牌维护**：
    - 统计卡片：品牌总数、自主品牌、合资/独资品牌；
    - 筛选栏：关键字搜索、`+ 新建品牌` 按钮；
    - 表格列：品牌名称、品牌代号、国别性质、车型总数、创建时间、操作列 (编辑、删除 Popconfirm)；
    - 品牌新建/编辑模态框 (`BrandEditModal`)。

#### 2. `apps/web/src/views/device/ProjectManageView.tsx`
- 统计卡片：项目总数、运营中项目、已分配设备总数、关联车辆数；
- 筛选栏：状态筛选 (全部/运营中/暂停/归档)、关键字搜索、`+ 新建项目` 按钮；
- 表格列：项目名称、项目代号 (monospace)、归属机构、负责人与脱敏电话、设备与车辆数、状态 Tag (🟢 运营中 / 🟠 暂停 / ⚪ 归档)、创建时间、操作列；
- 操作列功能：
  - 【编辑项目】：修改基本信息与负责人；
  - 【设备调配】：弹出 `DeviceAllocateModal`，展示可选空闲设备并一键批量分配或移出；
  - 【状态切换/归档】：受 `canArchiveProject` 安全守卫保护；
- 项目新建/编辑模态框 (`ProjectEditModal`)。

---

### D. 数据分层与 API 抽象
1. 在 `apps/web/src/api/vehicle.ts` 中提供：
   - `createModelApi(data: CreateModelInput): Promise<ModelDto>`
   - `updateModelApi(id: string, data: UpdateModelInput): Promise<ModelDto>`
   - `deleteModelApi(id: string): Promise<boolean>`
   - `createBrandApi(data: CreateBrandInput): Promise<BrandDto>`
   - `updateBrandApi(id: string, data: UpdateBrandInput): Promise<BrandDto>`
   - `deleteBrandApi(id: string): Promise<boolean>`
2. 在 `apps/web/src/api/device.ts` (或 `project.ts`) 中提供：
   - `createProjectApi(data: CreateProjectInput): Promise<ProjectDto>`
   - `updateProjectApi(id: string, data: UpdateProjectInput): Promise<ProjectDto>`
   - `updateProjectStatusApi(id: string, status: ProjectStatus): Promise<ProjectDto>`
   - `allocateDevicesToProjectApi(projectId: string, deviceIds: string[]): Promise<boolean>`
3. 遵循 `isApiError` 模式，具备高可用离线状态持久化。

---

### E. 页面集成与路由更新
1. 在 `apps/web/src/router/routes.ts` 中：
   - 增加 `RoutePath.MODELS = '/models'`，`hideInMenu: true`；
   - 增加 `RoutePath.PROJECTS = '/projects'`，`hideInMenu: true`；
   - 确保 `getMenuRoutes()` 仍严格返回 14 条菜单，保持现有测试 100% 兼容。
2. 在 `apps/web/src/layouts/AdminLayout.tsx` 中：
   - 挂载 `RoutePath.MODELS` -> `<ModelManageView />`；
   - 挂载 `RoutePath.PROJECTS` -> `<ProjectManageView />`。
3. 在 `VehicleListView.tsx` 顶部操作栏提供【车型与品牌管理】快捷按钮；
4. 在 `DeviceListView.tsx` 顶部操作栏提供【项目归属管理】快捷按钮。

---

### F. 自动化测试要求 (`apps/web/src/test/model-project-views.test.ts`)
1. 协议车型代号 0x02 格式强校验测试（严格要求 `0x[0-9a-fA-F]{4}`，拦截非十六进制及长度异常）；
2. 品牌代号大写校验测试；
3. 车型与品牌防删除安全守卫测试（`canDeleteModel`, `canDeleteBrand`）；
4. 项目代号规范性与归档安全守卫测试（`canArchiveProject`）；
5. 设备跨项目调配纯逻辑测试（批量分配与移出）；
6. 车型、品牌与项目 API 客户端集成测试；
7. 离线状态降级与内存状态池持久化测试。

---

### G. 编译与构建门禁
- `pnpm --filter @car-control/web test` 100% 通过；
- `pnpm --filter @car-control/web build` Vite 8 / Rolldown 0 报错通过。
