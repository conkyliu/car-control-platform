# Sprint 2 Task 4 Report: 车辆档案台账中心 (`VehicleListView.tsx` + `vehicle-core.ts` + `api/vehicle.ts`)

## 1. 任务基本信息
- **任务编号**：Sprint 2 Task 4
- **任务目标**：基于《手机控车平台功能清单.docx》模块 05（5.1 车辆列表检索、5.5 车辆状态监控、5.7 操作记录、5.8 预警记录；P1 5.3 品牌车型关联）、《手机控车平台-Admin管理后台开发计划-V2.1-补充PM与UIUX.md》与《docs/product/requirements-map.md》，在 `apps/web` 中交付企业级车辆档案台账管理中心。支持 17 位标准 VIN 校验（ISO 3779 排除 I/O/Q）、标准大陆车牌正则（含新能源绿牌）、品牌与车型级联联动、实时车况微图元（门锁/引擎/电压）、多维组合筛选、配额超限预警与生命周期状态流转。
- **Base Commit**：`c8621bb` (`fix(web): reset activeTab on drawer close and add APN whitespace validation`)
- **Current Commit**：`d773da5` (`feat(web): implement VehicleListView asset management center and VIN validation`)
- **状态**：COMPLETED (100% 验收通过)

---

## 2. 交付物清单与代码路径

### 2.1 核心纯逻辑与领域模型 (`apps/web/src/views/vehicle/vehicle-core.ts`)
1. **VIN 17 位标准校验与规范化 (`validateVin`)**：
   - 依据 ISO 3779 国际标准，VIN 必须由 17 位大写字母与数字组成，排除 I, O, Q（避免与数字 1, 0 混淆）。
   - 正则表达式：`/^[A-HJ-NPR-Z0-9]{17}$/`。
   - 输入处理：自动去除首尾空格并转换为大写。
   - 辅助生成器 `generateSampleVin`：快速生成符合规范的示例 VIN，用于建档模态框快速填充。
2. **大陆车牌号码校验 (`validatePlateNumber`)**：
   - 支持标准燃油车牌（7 位，如 `粤B·88888` 或 `粤B88888`）与新能源车牌（8 位绿牌，如 `粤B·D12345` / `京A·F66666`）。
   - 正则表达式：`/^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领][A-Z][·.]?[A-HJ-NP-Z0-9]{4,5}[A-HJ-NP-Z0-9挂学警港澳]$/`。
3. **统计指标计算纯函数 (`calculateVehicleStats`)**：
   - 统计总数、正常运营中数、维保检修数、风控锁死数、报废数。
   - 设备绑定数与绑定率百分比 (`boundRate`)。
   - 车载设备在线数与在线率百分比 (`onlineRate`)。
   - 租户配额占用率 (`quotaUsage` %) 与配额预警标志 (`isQuotaWarning`: usage >= 90%)。
4. **多维组合筛选纯函数 (`filterVehicles`)**：
   - 关键字搜索（模糊匹配 plateNumber / vin / deviceNo / ownerName / ownerPhone / brandName / modelName）。
   - 归属项目过滤 (`projectId`)。
   - 品牌与车型级联过滤 (`brandId`, `modelId`)。
   - 运营状态过滤 (`status`: ALL / NORMAL / MAINTENANCE / LOCKED / SCRAPPED)。
   - 绑定状态过滤 (`bindStatus`: ALL / BOUND / UNBOUND)。
   - 在线状态过滤 (`onlineStatus`: ALL / ONLINE / OFFLINE)。
5. **车况与状态元数据工具**：
   - `getVehicleStatusMeta(status)`:
     - `NORMAL`: 标签 "正常运营"，绿色 `#52c41a`；
     - `MAINTENANCE`: 标签 "维保检修"，橙色 `#fa8c16`；
     - `LOCKED`: 标签 "风控锁死"，紫红色 `#722ed1`；
     - `SCRAPPED`: 标签 "已报废"，终态灰色 `#8c8c8c`。
   - `isValidVehicleStatusTransition(from, to)`:
     - `SCRAPPED` 为物理终态，严禁逆向恢复为正常运营、维保或风控状态；
     - 其余状态之间允许正常业务流转。
   - `formatVoltage(voltage)`:
     - 格式化电压并标注健康度（<11.5V 橙色低压预警，>14.8V 红色过压预警，11.5~14.8V 绿色正常）。
   - `maskPhone(phone)`:
     - 掩码保护大陆手机号敏感信息（如 `138****8888`）。
   - `isApiError(err)`:
     - 准确区分后端 HTTP 业务异常与网络环境降级。
6. **真实种子数据**：
   - `SEED_BRANDS`: 比亚迪 (BYD)、特斯拉 (Tesla)、广汽埃安 (AION)、吉利极氪 (ZEEKR)；
   - `SEED_MODELS`: 汉 EV、Model Y、AION S、极氪 001；
   - `SEED_VEHICLES`: 12 条高保真样例车辆记录（包含已绑定、未绑定、在线、离线、各种遥测工况、各种运营状态与脱敏车主）。

### 2.2 数据分层与 API 抽象 (`apps/web/src/api/vehicle.ts`)
1. `fetchVehiclesApi(params?: VehicleQueryParams): Promise<VehicleDto[]>`:
   - 发起 `GET /vehicles`，遵循 `isApiError` 模式；离线或开发环境降级至内存数据池并应用多维过滤。
2. `fetchVehicleDetailApi(id: string): Promise<VehicleDto>`:
   - 发起 `GET /vehicles/:id`，支持读取单车详细档案与实时遥测指标。
3. `createVehicleApi(data: CreateVehicleInput): Promise<VehicleDto>`:
   - 发起 `POST /vehicles`，离线时在本地内存状态池建档。
4. `updateVehicleStatusApi(id: string, status: VehicleStatus): Promise<VehicleDto>`:
   - 发起 `PATCH /vehicles/:id/status`，前置执行 `isValidVehicleStatusTransition` 终态守卫。
5. `fetchBrandsApi(): Promise<BrandDto[]>`:
   - 发起 `GET /vehicles/brands`，支持品牌字典加载。
6. `fetchModelsApi(brandId?: string): Promise<ModelDto[]>`:
   - 发起 `GET /vehicles/models`，支持品牌与车型级联联动查询。

### 2.3 业务视图组件 (`apps/web/src/views/vehicle/VehicleListView.tsx`)
1. **配额超限预警 Banner**：
   - 从 `useTenantStore` 动态读取当前激活租户配额；
   - 当占用率 $\ge 90\%$ 时，在顶部渲染警告 `Alert`，指引联系商务人员扩容。
2. **顶部指标卡片 (4 卡布局)**：
   - 车辆总数 (Total Vehicles，含配额已用百分比)；
   - 正常运营中 (含在线数与在线率 % 徽标)；
   - 维保与风控 (含维保与风控锁死细分统计)；
   - 终端设备绑定率 (含绑定数与未绑定数对比)。
3. **多维筛选工具栏**：
   - 关键字搜索输入框 (模糊搜索车牌/VIN/设备号/车主/品牌)；
   - 归属项目选择下拉 `Select`；
   - 品牌选择下拉 `Select` (动态联动车型下拉选项)；
   - 车型选择下拉 `Select`；
   - 运营状态选择下拉 `Select`；
   - 绑定状态选择下拉 `Select`；
   - 操作按钮：`+ 录入车辆` (Primary)、`刷新`、`重置`。
4. **Ant Design 6 响应式 Table**：
   - 车牌号：蓝色突出 `Tag` (如 `粤B·88888`)，点击触发车况遥测弹窗；
   - VIN：等宽字体并支持一键复制；
   - 车型规格：品牌 + 车型 Tag；
   - 绑定设备：已绑定展示设备编号 (等宽可复制) 与在线状态徽标 (🟢/⚪)；未绑定展示浅灰 "未绑定" Tag；
   - 实时车况微图元：
     - 门锁：🔒 已锁 (绿) / 🔓 未锁 (橙)；
     - 引擎：🟢 点火 / ⚪ 熄火；
     - 电压：12.xV 数值 + 色彩指示；
   - 运营状态：规范色彩 Tag 渲染；
   - 归属项目与车主：项目名称，车主姓名与脱敏手机号；
   - 创建时间：等宽时间戳；
   - 操作列：
     - 【车况】：打开 `VehicleDetailModal` 查看全量车况与遥测详情；
     - 【变更】：打开 `statusChangeModal` 进行生命周期状态流转（受报废终态保护）；
     - 【绑定/换绑】：预留软硬件绑定中心 (Task 5) 联动接口。
5. **单个车辆录入模态框 (`CreateVehicleModal`)**：
   - VIN 17 位强校验，配备 "生成示例 VIN" 快速填充按钮；
   - 大陆标准车牌格式强校验（支持燃油车与新能源绿牌）；
   - 归属项目下拉选择；
   - 品牌下拉选择 -> 车型动态联动级联选择；
   - 车主姓名与大陆 11 位手机号码校验；
   - 可选空闲设备绑定；
   - 提交防重与友好自然语言提示。
6. **车况遥测详情模态框 (`VehicleDetailModal`)**：
   - 完整展示基本档案、车载设备、车门锁态、尾箱状态、动力状态、电瓶电压、剩余油电量、行驶里程、当前车速、定位位置与最新报文时间。
7. **状态变更模态框**：
   - 允许操作员选择目标状态；
   - 当选择【已报废】时展示红色高危不可逆警告条；
   - 当目标为终态时阻止非法流转。

### 2.4 页面集成与路由挂载
1. `apps/web/src/views/vehicle/index.ts`:
   - 导出 `VehicleListView` 与 `vehicle-core.ts` 全部纯函数及类型定义。
2. `apps/web/src/layouts/AdminLayout.tsx`:
   - 引入 `VehicleListView`；
   - 在 `renderActiveView` 中挂载 `if (activeKey === RoutePath.VEHICLES) return <VehicleListView />;`。

---

## 3. 自动化测试结果 (TDD)
- **测试文件**：`apps/web/src/test/vehicle-views.test.ts`
- **执行命令**：`pnpm --filter @car-control/web test`

### 测试套件覆盖清单 (27 项新增断言全部通过)：
1. `validateVin`: 17 位大写字母与数字强校验通过。
2. `validateVin`: 排除 I, O, Q 字符拦截有效。
3. `validateVin`: 16位/18位等长度异常与特殊符号拦截有效。
4. `validateVin`: 首尾空格修剪与大小写规范化有效。
5. `generateSampleVin`: 自动生成有效 17 位 VIN 并满足校验规则。
6. `validatePlateNumber`: 7位传统燃油车牌校验通过（含点与无点）。
7. `validatePlateNumber`: 8位新能源绿牌校验通过（如 `粤B·D12345` / `京A·F66666`）。
8. `validatePlateNumber`: 非法省份简称、非法字符与长度防御生效。
9. `validatePlateNumber`: 车牌首尾空格与大小写修剪规范化生效。
10. `calculateVehicleStats`: 统计总数、运营状态细分、设备绑定数及绑定率准确。
11. `calculateVehicleStats`: 在线设备数及在线率统计准确。
12. `calculateVehicleStats`: 配额占用比计算及超限（$\ge 90\%$）预警标志判定准确。
13. `calculateVehicleStats`: 空列表安全防御（杜绝 NaN）。
14. `filterVehicles`: 车牌/VIN/设备号/车主/手机/品牌/车型关键字模糊搜索生效。
15. `filterVehicles`: 项目、品牌、车型归属过滤生效。
16. `filterVehicles`: 运营生命周期状态过滤生效。
17. `filterVehicles`: 绑定状态过滤（已绑定/未绑定）生效。
18. `filterVehicles`: 在线状态过滤（在线/离线）生效。
19. `isValidVehicleStatusTransition`: NORMAL/MAINTENANCE/LOCKED 之间自由流转生效。
20. `isValidVehicleStatusTransition`: SCRAPPED 报废终态保护拦截不可逆流转。
21. `getVehicleStatusMeta`: 规范色彩主题与标签文本映射准确。
22. `formatVoltage`: 电压格式化与低压告警判定准确。
23. `maskPhone`: 大陆手机号中间4位掩码脱敏生效。
24. `isApiError`: 准确识别后端 ApiError 实例与结构体。
25. `fetchBrandsApi` & `fetchModelsApi`: 品牌与车型级联数据正常返回。
26. `createVehicleApi`: 车辆建档并在状态池中成功持久化。
27. `updateVehicleStatusApi`: 状态变更与终态防御守卫在接口层正确执行。

### 综合构建门禁验证：
- `pnpm --filter @car-control/web test`: **126 tests passed (18 suites, 0 failed, 100% 通过)**。
- `pnpm --filter @car-control/web build`: **tsc & vite build 编译 0 错误 (耗时 1.14s，打包产物就绪)**。

---

## 4. 结论与后续关注
- Sprint 2 Task 4 已高标准交付，代码结构清晰，严格遵循领域模型、Ant Design 6 视觉设计规范与 TDD 规范。
- 下一阶段（Sprint 2 Task 5）将在此基础上构建**软硬件绑定与配对管理中心 (`VehicleBindModal.tsx`)**。
