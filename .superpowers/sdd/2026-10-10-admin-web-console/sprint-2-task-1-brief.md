# Sprint 2 Task 1 Brief: 设备资产管理中心 (`DeviceListView.tsx` + `device-core.ts` + `api/device.ts`)

## 1. 任务背景与目标
基于《手机控车平台功能清单.docx》模块 04（设备管理，P0 4.1~4.4, 4.11~4.14）、《开发计划-V2.1》与《docs/design/page-specs/device-management.md》，在 `apps/web` 中交付生产级设备资产台账管理中心，支持多维组合筛选、在线状态与信号监测、配额预警 Banner、单个设备建档模态框与生命周期状态流转。

## 2. 详细功能与交互规范

### A. 核心纯逻辑与数据模型 (`apps/web/src/views/device/device-core.ts`)
1. **正则与表单校验**：
   - IMEI: 15 位纯数字强正则校验 (`/^\d{15}$/`)
   - ICCID: 19~20 位规范字母数字校验 (`/^[a-zA-Z0-9]{19,20}$/`)
2. **指标统计纯函数 (`calculateDeviceStats`)**：
   - 设备总数 (Total Devices)
   - 在线设备数 (Online Devices)
   - 在线率百分比 (Online Rate %，如 94.2%)
   - 告警设备数 (Alarming Devices)
   - 离线设备数 (Offline Devices)
   - 配额占用率 (Quota Usage %, 如 85%) 与预警标志位 (isQuotaWarning: usage >= 90%)
3. **组合过滤纯函数 (`filterDevices`)**：
   - 关键字搜索（模糊匹配 deviceNo / imei / iccid / plateNumber）
   - 项目归属过滤 (projectId)
   - 在线状态过滤 (onlineStatus: ALL / ONLINE / OFFLINE / ALARMING)
   - 固件版本号过滤 (firmwareVersion)
   - 生命周期状态过滤 (status: ALL / ACTIVE / INACTIVE / DECOMMISSIONED)
4. **信号与状态格式化工具**：
   - 4G 信号 RSRP 映射（≥ -85 dBm: 4格优秀绿色，-86~-95 dBm: 3格良好蓝色，-96~-105 dBm: 2格一般橙色，< -105 dBm: 1格极差红色）
   - 在线状态 Tag 与呼吸灯徽标色彩映射
5. **种子数据 (`SEED_DEVICES`)**：
   - 至少 10 条真实且多样化的设备台账数据（覆盖深圳、广州等真实项目、已绑定车牌如 `粤B·88888` 与未绑定状态、在线/离线/告警设备、不同固件版本）。

### B. 业务页面组件 (`apps/web/src/views/device/DeviceListView.tsx`)
1. **配额超限预警 Banner**：
   - 当设备配额占用比 $\ge 90\%$ 时，在页面顶部呈现警告 `Alert`："租户设备配额已占用 X/Y (Z%)，即将达到上限，请及时扩容"。
2. **顶部指标卡片 (Summary Cards)**：
   - 设备总数
   - 在线设备 (绿色，含在线率 % 徽标)
   - 离线设备 (灰色)
   - 异常告警设备 (红色)
3. **多维筛选工具栏 (Filter Bar)**：
   - 关键字搜索输入框 (设备号 IMEI / ICCID / 绑定车牌)
   - 项目归属 Select 下拉（从项目列表动态加载）
   - 在线状态筛选（全部 / 在线 / 离线 / 告警）
   - 固件版本筛选 Select
   - 动作按钮：`+ 新建设备` (触发单个建档弹窗)、`📥 批量导入` (Task 2 集成占位)、`刷新`、`重置`
4. **Ant Design 6 响应式 Table**：
   - 设备编号 (deviceNo，等宽字体，支持一键复制)
   - IMEI (15 位数字，Tooltip 复制)
   - ICCID (等宽字体，支持复制)
   - 绑定车辆 (已绑定显示车牌 Tag，未绑定显示灰色 Tag "未绑定")
   - 在线状态 (带状态徽标圆点：🟢 在线 / ⚪ 离线 / 🔴 告警)
   - 信号质量 (RSRP 阶梯条形指示器与数值)
   - 固件版本 (Tag 渲染)
   - 激活时间 / 最后心跳时间 (等宽时间)
   - 操作列：`详情` 按钮 (触发事件/弹窗，Task 3 接入抽屉)、`状态变更` Popconfirm (启用 / 停用 / 报废)
5. **单个设备建档模态框 (`CreateDeviceModal`)**：
   - 表单字段：设备编号 deviceNo (带一键生成唯一序列号按钮)、IMEI (15位数字强校验)、产品型号 ProductKey (下拉预设)、归属项目 projectId (下拉选择)、ICCID (选填)。
   - 提交验证与持久化，遵循 `isApiError`。

### C. 数据分层与 API 抽象 (`apps/web/src/api/device.ts`)
- `fetchDevicesApi(params)`
- `createDeviceApi(data)`
- `updateDeviceStatusApi(id, status)`
- `fetchProjectsApi()` (项目下拉数据)
- 遵循 `isApiError` 模式：真实服务端异常抛出中断并提示，离线环境平滑降级至 `SEED_DEVICES`。

### D. 路由与主布局挂载
1. 在 `apps/web/src/views/device/index.ts` 导出 `DeviceListView`。
2. 在 `apps/web/src/layouts/AdminLayout.tsx` 中挂载：
   - `activeKey === RoutePath.DEVICES` -> `<DeviceListView />` (替换旧的 `CarControlPanel` 临时占位)。

### E. 自动化测试要求 (`apps/web/src/test/device-views.test.ts`)
1. IMEI 与 ICCID 正则表达式严格校验断言；
2. `calculateDeviceStats` 指标统计与配额告警阈值判定；
3. `filterDevices` 多维筛选组合（关键字、项目、在线状态、固件版本）；
4. 4G 信号 RSRP 分级计算与图标映射；
5. 设备生命周期状态流转合法性断言；
6. API 客户端方法存在性与基础调用断言。

### F. 编译与构建门禁
- `pnpm --filter @car-control/web test` 100% 通过；
- `pnpm --filter @car-control/web build` Vite 8 / Rolldown 0 报错通过。
