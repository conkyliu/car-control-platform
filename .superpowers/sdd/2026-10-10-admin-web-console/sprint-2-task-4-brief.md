# Sprint 2 Task 4 Brief: 车辆档案台账中心 (`VehicleListView.tsx` + `vehicle-core.ts` + `api/vehicle.ts`)

## 1. 任务背景与目标
基于《手机控车平台功能清单.docx》模块 05（车辆管理，P0 5.1 车辆列表检索、5.5 车辆状态监控、5.7 操作记录、5.8 预警记录；P1 5.3 品牌车型关联）、《手机控车平台-Admin管理后台开发计划-V2.1-补充PM与UIUX.md》与《docs/product/requirements-map.md》，在 `apps/web` 中交付企业级车辆档案台账管理中心。
支持 17 位标准 VIN 校验（排除 I/O/Q）、标准大陆车牌正则（含新能源绿牌）、品牌与车型级联联动、实时车况微图元（门锁/引擎/电压）、多维组合筛选、配额超限预警与生命周期状态流转。

## 2. 详细功能与交互规范

### A. 核心纯逻辑与领域模型 (`apps/web/src/views/vehicle/vehicle-core.ts`)
1. **VIN 17 位标准校验与规范化 (`validateVin`)**：
   - 依据 ISO 3779 国际标准，VIN 必须由 17 位字母和数字组成，且**严禁包含大写字母 I, O, Q**（避免与数字 1, 0 混淆）。
   - 正则表达式：`/^[A-HJ-NPR-Z0-9]{17}$/`。
   - 输入处理：自动转换为大写并去除首尾空格。
2. **大陆车牌号码校验 (`validatePlateNumber`)**：
   - 支持标准燃油车牌（7 位，如 `粤B·88888` 或 `粤B88888`）与新能源车牌（8 位绿牌，如 `粤B·D12345` / `京A·F66666`）。
   - 正则表达式：`/^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领][A-Z][·]?[A-HJ-NP-Z0-9]{4,5}[A-HJ-NP-Z0-9挂学警港澳]$/`。
3. **统计指标计算纯函数 (`calculateVehicleStats`)**：
   - 车辆总数 (Total Vehicles)
   - 正常运营中数 (Normal Count)
   - 维保检修中数 (Maintenance Count)
   - 风控锁死数 (Locked Count)
   - 报废数 (Scrapped Count)
   - 设备绑定数 (Bound Count) 与绑定率百分比 (Bound Rate %，如 92.5%)
   - 车载设备在线数 (Online Count) 与在线率百分比 (Online Rate %)
   - 配额占用率 (Quota Usage %, 如 80%) 与配额告警标志 (isQuotaWarning: usage >= 90%)
4. **组合过滤纯函数 (`filterVehicles`)**：
   - 关键字搜索（模糊匹配 plateNumber / vin / deviceNo / ownerName / ownerPhone）
   - 项目归属过滤 (projectId)
   - 品牌归属过滤 (brandId)
   - 车型归属过滤 (modelId)
   - 车辆生命周期状态过滤 (status: ALL / NORMAL / MAINTENANCE / LOCKED / SCRAPPED)
   - 绑定状态过滤 (bindStatus: ALL / BOUND / UNBOUND)
   - 在线状态过滤 (onlineStatus: ALL / ONLINE / OFFLINE)
5. **车况与状态元数据工具**：
   - `getVehicleStatusMeta(status)`:
     - `NORMAL`: 标签 "正常运营"，绿色 `#52c41a`；
     - `MAINTENANCE`: 标签 "维保检修"，橙色 `#fa8c16`；
     - `LOCKED`: 标签 "风控锁死"，紫红色 `#722ed1`；
     - `SCRAPPED`: 标签 "已报废"，终态灰色 `#8c8c8c`。
   - `isValidVehicleStatusTransition(from, to)`:
     - `SCRAPPED` 为物理终态，不可逆向转为其他状态；
     - 其余状态之间允许合理流转。
6. **种子基础数据 (`SEED_BRANDS`, `SEED_MODELS`, `SEED_VEHICLES`)**：
   - 品牌：比亚迪 (BYD)、特斯拉 (Tesla)、广汽埃安 (AION)、吉利极氪 (ZEEKR)；
   - 车型：汉 EV (0x02代号 0x0101)、Model Y (0x02代号 0x0201)、AION S (0x02代号 0x0301)、极氪 001 (0x02代号 0x0401)；
   - 至少 10 条真实且多样化的车辆台账记录（覆盖已绑定车牌如 `粤B·88888`、未绑定车辆、不同状态、不同电压 11.5~14.4V、不同车锁/点火状态、脱敏车主与手机号）。

---

### B. 业务页面组件 (`apps/web/src/views/vehicle/VehicleListView.tsx`)
1. **配额超限预警 Banner**：
   - 动态获取当前租户的车辆配额（从 `useTenantStore`）；
   - 当车辆配额使用率 $\ge 90\%$ 时，在顶部渲染警告 `Alert`："租户车辆配额已占用 X/Y (Z%)，即将达到上限，请及时联系商务扩容"。
2. **顶部指标卡片 (Summary Statistic Cards)**：
   - 车辆总数 (Total)；
   - 正常运营中 (绿色，含在线率 % 徽标)；
   - 维保与风控 (橙/紫色预警)；
   - 设备绑定率 (蓝色，展示已绑定数/总数)。
3. **多维筛选工具栏 (Filter Bar)**：
   - 关键字输入框 (模糊搜索车牌/VIN/设备号/车主)；
   - 项目选择下拉 `Select`；
   - 品牌选择下拉 `Select` (动态联动车型)；
   - 运营状态下拉 `Select` (全部/正常/维保/风控锁死/已报废)；
   - 绑定状态下拉 `Select` (全部/已绑定/未绑定)；
   - 动作按钮：`+ 录入车辆` (Primary，触发建档 Modal)、`刷新`、`重置`。
4. **Ant Design 6 响应式 Table**：
   - 车牌号：蓝色突出 `Tag` (如 `粤B·88888`)，支持点击弹出车况卡片；
   - VIN (车架号)：等宽字体，支持一键复制；
   - 车型规格：品牌 + 车型名称 Tag；
   - 绑定设备：已绑定展示设备编号 (等宽可复制) 与在线状态徽标 (🟢/⚪)；未绑定展示浅灰 "未绑定" Tag；
   - 实时车况微图元 (Telemetry)：
     - 门锁：🔒 已锁 (绿) / 🔓 未锁 (橙)；
     - 引擎：🟢 点火运行 / ⚪ 熄火静止；
     - 蓄电池电压：数值 + 色彩 (如 12.6V 正常绿色，<11.5V 橙色低压预警)；
   - 运营状态：Tag 渲染 (正常/维保/风控锁死/报废)；
   - 归属项目与车主：项目名称，车主姓名与脱敏手机号 (如 `138****8888`)；
   - 创建时间：等宽格式化时间；
   - 操作列：
     - 【车况概览】: Popover 或 Modal 弹出车况与遥测详情卡片；
     - 【状态变更】: Popconfirm 快速切换状态（受 `isValidVehicleStatusTransition` 保护）；
     - 【软硬件绑定/解绑】按钮预留 (触发后续 Task 5 `VehicleBindModal`)。
5. **单个车辆录入模态框 (`CreateVehicleModal`)**：
   - 表单字段：
     - VIN (17位大写强校验，提供示例生成快速填充)；
     - 车牌号 (标准大陆车牌校验，含点号与绿牌支持)；
     - 归属项目 (Select，必填)；
     - 品牌与车型级联 (Brand 选择后动态过滤 Model，必填)；
     - 车主姓名 (选填) 与联系电话 (11位大陆手机正则，选填)；
     - 绑定车载设备 (Select 下拉选择当前未绑定的空闲设备，选填)；
   - 提交验证并调用 `createVehicleApi`，防重与 Loading 态，遵循自然语言友好提示。

---

### C. 数据分层与 API 抽象 (`apps/web/src/api/vehicle.ts`)
1. `fetchVehiclesApi(params?: VehicleQueryParams): Promise<VehicleDto[]>`
2. `fetchVehicleDetailApi(id: string): Promise<VehicleDto>`
3. `createVehicleApi(data: CreateVehicleInput): Promise<VehicleDto>`
4. `updateVehicleStatusApi(id: string, status: VehicleStatus): Promise<VehicleDto>`
5. `fetchBrandsApi(): Promise<BrandDto[]>`
6. `fetchModelsApi(brandId?: string): Promise<ModelDto[]>`
7. 遵循 `isApiError` 模式：真实服务端异常抛出并提示，离线环境在本地内存池中同步更新并返回。

---

### D. 页面集成 (`apps/web/src/layouts/AdminLayout.tsx`)
1. 在 `AdminLayout.tsx` 的路由渲染分支中挂载：
   - `if (activeKey === RoutePath.VEHICLES) return <VehicleListView />;`
2. 从 `apps/web/src/views/vehicle/index.ts` 导出 `VehicleListView`。

---

### E. 自动化测试要求 (`apps/web/src/test/vehicle-views.test.ts`)
1. 17 位 VIN 校验纯函数测试 (ISO 3779，拦截 I/O/Q 与长度错误)；
2. 大陆车牌号码校验纯函数测试 (燃油车 7 位、新能源 8 位绿牌、特殊字符防御)；
3. 指标统计纯函数测试 (`calculateVehicleStats` 计算总数、绑定率、在线率、配额预警)；
4. 组合筛选纯函数测试 (`filterVehicles` 关键字、项目、品牌、状态、绑定关系)；
5. 状态转换守卫测试 (`isValidVehicleStatusTransition` 报废终态保护)；
6. 车况状态与电压色彩指示测试；
7. 车辆 API 客户端集成测试 (`fetchVehiclesApi`, `createVehicleApi`, `updateVehicleStatusApi`)；
8. 离线状态降级与内存池更新测试。

---

### F. 编译与构建门禁
- `pnpm --filter @car-control/web test` 100% 通过；
- `pnpm --filter @car-control/web build` Vite 8 / Rolldown 0 报错通过。
