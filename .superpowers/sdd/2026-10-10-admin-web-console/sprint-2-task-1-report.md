# Sprint 2 Task 1 Report: 设备资产管理中心 (`DeviceListView.tsx` + `device-core.ts` + `api/device.ts`)

## 1. 任务基本信息
- **任务编号**：Sprint 2 Task 1
- **任务目标**：基于功能清单模块 04 与页面规格《docs/design/page-specs/device-management.md》，交付生产级设备资产台账管理中心，支持多维组合筛选、在线状态与 4G 信号监测、租户配额预警 Banner、单个设备规范建档模态框与生命周期状态流转。
- **Base Commit**：`bfa8a5d` (`fix(web): address reviewer recommendations on RangePicker key reset and CSV formula injection defense`)
- **Current Commit**：`e5ee58f` (`feat(web): implement DeviceListView asset management center`)
- **状态**：COMPLETED (100% 验收通过)

---

## 2. 交付物清单与代码路径

### 2.1 API 契约与 HTTP 客户端
1. `apps/web/src/api/device.ts`:
   - `fetchDevicesApi(params)`: 支持项目归属、在线状态、固件版本、生命周期状态及关键字检索
   - `createDeviceApi(data)`: 单个设备建档接口，支持本地内存池平滑降级
   - `updateDeviceStatusApi(id, status)`: 生命周期状态流转接口 (ACTIVE / INACTIVE / DECOMMISSIONED)
   - `fetchProjectsApi()`: 获取项目下拉数据接口
   - 类型导出：`DeviceDto`, `DeviceQueryParams`, `DeviceStatsDto`, `ProjectDto`, `CreateDeviceInput`, `DeviceLifecycleStatus`, `OnlineStatus`
   - 遵循 `isApiError` 模式：真实服务端异常抛出中断并提示，离线/开发环境无后端服务时平滑降级至 `SEED_DEVICES` 与内存状态池

### 2.2 核心纯逻辑与数据模型
2. `apps/web/src/views/device/device-core.ts`:
   - `validateImei` & `IMEI_REGEX`: 15 位严格纯数字硬件识别码强校验 (`/^\d{15}$/`)，拒绝首尾空格或非法字符
   - `validateIccid` & `ICCID_REGEX`: 19~20 位严格字母数字校验 (`/^[a-zA-Z0-9]{19,20}$/`)
   - `generateDeviceNo`: 自动生成规范唯一序列号工具纯函数 (如 `DEV_123456_7890`)
   - `calculateDeviceStats`: 统计设备总数、在线设备数、在线率 % (保留 1 位小数)、离线设备数、告警设备数、配额占用比 % 及配额预警标志位 (`isQuotaWarning`: usage >= 90%)
   - `filterDevices`: 多维组合过滤（关键字模糊匹配设备号、IMEI、ICCID、绑定车牌、VIN，项目归属、在线状态、固件版本号、生命周期状态）
   - `getSignalQuality`: 4G 信号 RSRP 映射（≥ -85 dBm: 4格极佳绿色 `#52c41a`，-86~-95 dBm: 3格良好蓝色 `#1677ff`，-96~-105 dBm: 2格一般橙色 `#faad14`，< -105 dBm: 1格极差红色 `#ff4d4f`，缺失: 0格无信号灰色 `#8c8c8c`）
   - `getOnlineStatusMeta`: 在线状态 Tag 与呼吸灯徽标色彩映射（ONLINE 绿、OFFLINE 灰、ALARMING 红、UPGRADING 蓝、UNACTIVATED 浅灰）
   - `getLifecycleStatusMeta`: 生命周期状态标签色彩映射
   - `isValidStatusTransition`: 状态流转守卫（DECOMMISSIONED 为终态，不可逆向流转；ACTIVE 与 INACTIVE 自由切换）
   - `isApiError`: 结构化错误类型守护函数
   - `SEED_PROJECTS`: 包含深圳极速、广州网约、上海城际、北方冷链等真实业务项目
   - `SEED_DEVICES`: 12 条多样化设备台账种子数据（覆盖真实车牌如 `粤B·88888` 与未绑定状态、各信号区间、电压/电池/温度实时数据与固件版本）

### 2.3 业务视图组件与主布局挂载
3. `apps/web/src/views/device/DeviceListView.tsx`:
   - **配额超限预警 Banner (`Alert`)**：当租户设备配额占用率 $\ge 90\%$ 时，在顶部高亮呈现警告 Banner，提示已使用比例并引导扩容。
   - **顶部指标卡片 (Summary Cards)**：设备总数卡片、在线设备卡片（带在线率 % 绿色 Tag）、离线设备卡片、异常告警设备卡片。
   - **多维筛选工具栏 (Filter Bar)**：关键字搜索框 (设备号/IMEI/ICCID/车牌/VIN)、项目归属 Select、在线状态 Select、固件版本 Select、生命周期 Select、查询与重置按钮；动作按钮组：`+ 新建设备` (触发建档模态框)、`📥 批量导入` (占位引导 Task 2)、`刷新`。
   - **Ant Design 6 响应式 Table**：
     - 设备编号（等宽高亮字体，支持一键复制，点击查看详情）
     - IMEI（15 位数字，等宽字体，支持复制）
     - ICCID（SIM卡识别码，支持复制）
     - 所属项目（Tooltip 提示完整名称）
     - 绑定车辆（绑定车牌蓝色 Tag，悬浮展示 VIN；未绑定展示浅灰 Tag）
     - 在线状态（Ant Design 6 Badge 圆点指示器：🟢 在线 / ⚪ 离线 / 🔴 告警）
     - 4G 信号强度（RSRP 4 阶梯条形指示器与数值）
     - 固件版本（青色 Tag）
     - 资产状态（正常启用 / 已停用 / 已报废）
     - 最后心跳时间（等宽字体展示）
     - 操作列：`详情` 按钮、生命周期状态变更 Popconfirm（启用 / 停用 / 报废二次确认）
   - **单个设备建档模态框 (`CreateDeviceModal`)**：
     - 设备编号（带一键生成序列号按钮）
     - IMEI（15 位强校验 validator）
     - 产品型号 ProductKey（下拉预设）
     - 归属项目（下拉选择）
     - ICCID（选填，19~20 位 validator）
   - **设备详情简要预览模态框 (`Modal`)**：
     - Descriptions 展示 16 项软硬件与工况字段（电压、电量、芯片温度、心跳、网络等），并提示 Task 3 专属 640px 抽屉对接。
4. `apps/web/src/views/device/index.ts`:
   - 导出 `DeviceListView` 及 `device-core.ts` 全部模型与函数。
5. `apps/web/src/layouts/AdminLayout.tsx`:
   - 挂载路由：`activeKey === RoutePath.DEVICES` -> `<DeviceListView />`。

---

## 3. 自动化测试结果 (TDD)
- **测试文件**：`apps/web/src/test/device-views.test.ts`
- **执行命令**：`pnpm --filter @car-control/web test`

### 测试套件明细：
1. `IMEI and ICCID regexes strictly validate hardware identifiers` ✔
2. `generateDeviceNo produces unique sequential or randomized device serial numbers` ✔
3. `calculateDeviceStats accurately computes summary metrics, online rate, and quota warning` ✔
4. `filterDevices filters across keyword, project, onlineStatus, firmwareVersion, and lifecycle status` ✔
5. `getSignalQuality maps RSRP values to 4G bar steps, labels, and theme colors` ✔
6. `getOnlineStatusMeta and getLifecycleStatusMeta provide correct tags and badge colors` ✔
7. `isValidStatusTransition validates lifecycle state transitions correctly` ✔
8. `SEED_DEVICES contains production-grade sample entries with diverse projects and plates` ✔
9. `isApiError differentiates server ApiError instances correctly` ✔
10. `device API functions are exported and handle fallback gracefully` ✔

- **Web 测试通过率**：72 / 72 tests passed (100%)
- **Monorepo 测试通过率**：184 / 184 tests passed (100% across api & web)

---

## 4. 生产构建验证
- **执行命令**：`pnpm --filter @car-control/web build`
- **结果**：`tsc && vite build` 0 错误编译通过，构建耗时 929ms，生成符合纯 CSS 变量体系的优化产物。
