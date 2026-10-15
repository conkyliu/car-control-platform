# Sprint 2 Task 6 Task Report: 车型品牌维护与项目归属中心 (`ModelManageView.tsx` & `ProjectManageView.tsx`)

## 1. 任务基本信息
- **任务编号**: Sprint 2 Task 6
- **完成状态**: COMPLETED
- **基线 Commit**: `8e595c6`
- **交付 Commit**: `4649b9f`
- **提交信息**: `feat(web): implement ModelManageView and ProjectManageView asset centers`
- **完成时间**: 2026-10-12
- **技术栈**: React 19 + TypeScript 5 + Ant Design 6 (原生纯 CSS 变量) + Vite 8 + Zustand 5

---

## 2. 交付物与功能清单 (Deliverables & Features)

### A. 纯领域模型与守卫函数 (Pure Domain Logic)
1. **车型与品牌核心 (`apps/web/src/views/vehicle/model-core.ts`)**:
   - `validateProtocolCode(code)`: 严格校验车控通讯协议 0x02 指令集两字节车型标识十六进制正则 `/^0x[0-9a-fA-F]{4}$/`。
   - `formatProtocolCode(code)`: 规范化为统一小写十六进制（如 `0X01AB` -> `0x01ab`）。
   - `validateBrandCode(code)`: 大写英文/数字/下划线正则 `/^[A-Z0-9_]{2,12}$/`。
   - `canDeleteModel(model)`: 防物理删除守卫，若 `vehicleCount > 0` 严格阻断并输出自然语言告警文案。
   - `canDeleteBrand(brand)`: 防物理删除守卫，若 `modelCount > 0` 严格阻断删除。
   - `PowertrainType` (EV / PHEV / ICE / REEV) 标准元数据、色彩规范与 Ant Design 6 Tag 映射。
   - `CAPABILITY_TEMPLATE_OPTIONS`: 5 大车控能力模板标准定义。

2. **项目归属与调配核心 (`apps/web/src/views/device/project-core.ts`)**:
   - `validateProjectCode(code)`: 严格校验项目唯一代号正则 `/^[A-Z0-9_]{3,20}$/`。
   - `canArchiveProject(project, onlineDeviceCount, boundVehicleCount)`: 归档安全守卫，若项目下存在在线设备或关联车辆则拦截归档。
   - `allocateDevices(devices, projectId, projectName, deviceIds)`: 不可变纯函数，原子批量分配设备并刷新时间戳。
   - `ProjectStatus` (ACTIVE 运营中 / PAUSED 已暂停 / ARCHIVED 已归档) 生命周期状态机。

### B. API 数据访问层 (API Client Layer)
1. **车辆与品牌 API (`apps/web/src/api/vehicle.ts`)**:
   - `createModelApi(data: CreateModelInput): Promise<ModelDto>`
   - `updateModelApi(id: string, data: UpdateModelInput): Promise<ModelDto>`
   - `deleteModelApi(id: string): Promise<boolean>`
   - `createBrandApi(data: CreateBrandInput): Promise<BrandDto>`
   - `updateBrandApi(id: string, data: UpdateBrandInput): Promise<BrandDto>`
   - `deleteBrandApi(id: string): Promise<boolean>`
   - 全部方法均遵循 `isApiError` 模式，真实后端异常直接抛出，离线/开发环境在内存状态池中执行安全增删改查。

2. **项目管理与设备调配 API (`apps/web/src/api/device.ts`)**:
   - `createProjectApi(data: CreateProjectInput): Promise<ProjectDto>`
   - `updateProjectApi(id: string, data: UpdateProjectInput): Promise<ProjectDto>`
   - `updateProjectStatusApi(id: string, status: ProjectStatus): Promise<ProjectDto>`
   - `allocateDevicesToProjectApi(projectId: string, deviceIds: string[]): Promise<boolean>`
   - 具备归档守卫与批量原子调配支持。

### C. 视图与交互组件 (UI Components)
1. **`ModelManageView.tsx` (`apps/web/src/views/vehicle/ModelManageView.tsx`)**:
   - 双 Tab 架构（Ant Design 6 `Tabs`）：
     - **Tab 1: 车型管理**：四卡片关键统计（车型总数、纯电 EV、插混 PHEV、燃油与增程）、多维过滤栏、0x02 协议代号 monospace 渲染、动力类型 Tag、能力模板关联、关联车辆数 Badge、新建/编辑 Modal、防删除 Popconfirm。
     - **Tab 2: 品牌维护**：三卡片统计（品牌总数、自主品牌、合资独资品牌）、关键字检索、新建/编辑 Modal、在册车型数 Badge、防删除 Popconfirm。
2. **`ProjectManageView.tsx` (`apps/web/src/views/device/ProjectManageView.tsx`)**:
   - 统计卡片：管理项目总数、运营中项目数、已调配终端数、关联车辆资产数。
   - 筛选与搜索：状态单选下拉（全部 / 运营中 / 暂停 / 归档）、关键字模糊搜索。
   - 表格与状态操作：负责人手机号脱敏（`maskPhone`）、状态流转操作（暂停 / 恢复 / 归档受守卫保护）。
   - `DeviceAllocateModal`: 调配弹窗支持范围快速过滤（全部 / 本项目 / 其它项目），支持多选批量将设备跨项目原子调配。
3. **导航与页面联动**:
   - `VehicleListView.tsx`: 顶部右侧新增【车型与品牌管理】按钮，快速唤起 `/models` 选项卡。
   - `DeviceListView.tsx`: 顶部右侧新增【项目归属管理】按钮，快速唤起 `/projects` 选项卡。

### D. 路由与主布局 (Router & AdminLayout)
- `apps/web/src/router/routes.ts`:
  - 增加 `RoutePath.MODELS = '/models'`，配置 `hideInMenu: true`。
  - 增加 `RoutePath.PROJECTS = '/projects'`，配置 `hideInMenu: true`。
  - `getMenuRoutes().length === 14` 严格保持不变，确保侧边栏 14 个核心业务菜单不受任何污染。
- `apps/web/src/layouts/AdminLayout.tsx`:
  - 挂载 `RoutePath.MODELS` -> `<ModelManageView />`。
  - 挂载 `RoutePath.PROJECTS` -> `<ProjectManageView />`。

---

## 3. 自动化测试结果与覆盖率 (Test Execution & Parity)

新增单元测试文件：`apps/web/src/test/model-project-views.test.ts`（包含 21 个 TDD 断言）。

### 测试结果摘要：
```text
▶ Sprint 2 Task 6: Model, Brand, and Project Asset Centers Test Suite (TDD)
  ✔ 1. Vehicle Control Protocol 0x02 Code Validation (validateProtocolCode) (3 tests)
  ✔ 2. Brand Code & Powertrain Types Validation (2 tests)
  ✔ 3. Delete Safety Guards (canDeleteModel & canDeleteBrand) (4 tests)
  ✔ 4. Project Code & Archival Safety Guard (canArchiveProject) (4 tests)
  ✔ 5. Immutable Device Allocation Pool (allocateDevices) (1 test)
  ✔ 6. Vehicle & Brand API Client Operations (3 tests)
  ✔ 7. Project API Client Operations & Lifecycle State Guard (2 tests)
  ✔ 8. Router and Navigation Integration Verification (2 tests)
✔ Sprint 2 Task 6: Model, Brand, and Project Asset Centers Test Suite (TDD) (21 tests passed)

Total Test Suite:
ℹ tests 165
ℹ suites 32
ℹ pass 165
ℹ fail 0
```

### 构建检查：
- `pnpm --filter @car-control/web build`：`tsc && vite build` 0 错误编译通过，生成生产包。

---

## 4. 验证的功能需求映射 (Requirements Parity)
- **5.2 车型管理**: 车型代号 0x02 校验、品牌关联、动力类型与能力模板关联。
- **5.3 车辆品牌管理**: 品牌代号、国别性质、车型聚合与删除保护。
- **21.1 项目管理**: 项目生命周期（ACTIVE / PAUSED / ARCHIVED）、联系人信息、状态变更门禁。
- **21.2 设备项目归属**: 设备批量跨项目调配与解耦。
- **23.1~23.6 自然交互与容错**: 手机号脱敏掩码、删除与归档不可逆保护、友好操作反馈。

---

## 5. 潜在风险与注意事项 (Concerns)
- 无阻塞性风险。
- 当前车辆与设备内存状态池已完全对接品牌、车型与项目数据池；后端接口上线后可无缝平滑切至真实 HTTP 链路。
