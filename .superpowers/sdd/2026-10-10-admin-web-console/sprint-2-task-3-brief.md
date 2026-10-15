# Sprint 2 Task 3 Brief: 设备详情监控抽屉与远程参数配置中心 (`DeviceDetailDrawer.tsx` + 远程参数下发 + L2 远程重启门禁)

## 1. 任务背景与目标
基于《手机控车平台功能清单.docx》模块 04（4.3 设备详情、4.4 状态监测、4.5 远程参数配置）与《docs/design/page-specs/device-management.md》3.3节，在 `apps/web` 中交付 640px 响应式设备详情监控抽屉。支持 3 大标签页（硬件与基础信息、实时工况监测仪表盘、远程参数配置与 L2 高危重启门禁），完成与 `DeviceListView.tsx` 的全闭环联动。

## 2. 详细功能与交互规范

### A. 视图架构与标签页设计 (`apps/web/src/views/device/DeviceDetailDrawer.tsx`)
- 抽屉规格：右侧滑出抽屉，宽度 `640px`，头部展示设备编号、在线状态 Badge 与所属项目。
- 包含 3 大标签页 (`Tabs`)：

#### Tab 1: 硬件与基础档案 (Hardware & Profile)
1. **基础参数 Descriptions**：
   - 设备编号 (deviceNo，等宽字体，支持一键复制)；
   - IMEI (15位硬件串号，支持复制)；
   - ICCID (SIM 卡号，等宽字体，支持复制)；
   - 硬件型号 (productKey / productName)；
   - 所属项目 (projectName)；
   - 所属机构 (orgName)；
   - 固件版本号 (Tag 渲染，如 `v2.1.0`)；
   - 激活入网时间与最后心跳时间；
   - 资产状态 (正常使用 / 已停用 / 已报废)。
2. **绑定车辆卡片 (Bound Vehicle Card)**：
   - 若已绑定：展示车牌号 (蓝色突出 Tag，如 `粤B·88888`)、VIN (等宽复制)、车型品牌与型号、车主姓名与脱敏联系电话；
   - 若未绑定：展示浅灰“当前设备未绑定任何车辆”，提供“去绑定车辆”提示。

#### Tab 2: 实时工况监控仪表 (Real-time Telemetry & Diagnostics)
1. **通讯与工况态势**：
   - 当前连接状态：在线 (🟢 在线，显示最后心跳耗时) / 离线 (⚪ 离线) / 告警 (🔴 告警)；
   - 4G 信号强度：RSRP 阶梯指示器与 dBm 数值（-85 dBm 4 格优秀至 <-105 dBm 极差）、CSQ 等级；
2. **电气与环境监测仪表**：
   - 主电瓶电压 (V)：标准 12V 蓄电池健康区间 (11.8V ~ 14.4V 绿色正常；低于 11.5V 标橙黄色低电压告警，高于 15V 标红过压告警)；
   - 备用锂电池 (%)：环形进度条 (`Progress type="circle"`)，低于 20% 变红；
   - 芯片运行温度 (°C)：数值与温度指示器，低于 60°C 正常绿色，60~75°C 橙色，>75°C 标红过热告警；
3. **定位数据监测**：
   - 经纬度坐标 (WGS-84，如 `22.543099, 114.057868`)；
   - 定位状态 (GPS 已锁定 / 基站定位)；
   - 搜星颗数 (如 12 颗卫星)。

#### Tab 3: 远程参数配置 (Remote Configuration & L2 Reboot)
1. **参数配置表单 (`Form`)**：
   - 心跳上报周期 (数字输入框，范围 10~3600 秒，步长 5，默认 30 秒)；
   - APN 接入点名称 (输入框，如 `CMNET`, `UNINET`, `CTNET`，支持快捷预设)；
   - 定位上报开关与上报间隔 (Switch + 数字输入框 5~600 秒)；
   - 蓝牙 PKE 感应开关与灵敏度档位 (Switch + Slider 1~5 档)；
   - 【下发参数配置 (Primary)】按钮：表单校验并调用 `updateDeviceConfigApi`，带 Loading 态与成功 Toast；
2. **极高危操作区：远程设备重启 (Remote Reboot)**：
   - 警示卡片：浅红背景与红色边框，提示“下发远程重启将导致 T-Box 瞬时离线 30~60 秒，行驶中车辆请谨慎操作”；
   - 点击【远程设备重启】按钮触发 **L2 二次确认防误触弹窗 (`Modal`)**；
   - L2 弹窗要求操作者输入安全确认码（必须输入 `REBOOT` 方可激活确定按钮）；
   - 确认后下发重启命令，记录操作审计并提示“重启指令已下发”。

### B. 数据分层与 API 抽象 (`apps/web/src/api/device.ts`)
1. `fetchDeviceDetailApi(id: string)`: 获取单台设备详情与实时工况。
2. `updateDeviceConfigApi(id: string, config: DeviceConfigInput)`: 下发参数配置。
3. `rebootDeviceApi(id: string, securityCode: string)`: 远程重启指令下发，验证 `securityCode === 'REBOOT'`。
4. 遵循 `isApiError` 模式：真实服务端异常抛出并提示，离线环境在本地内存池中同步更新并返回。

### C. 纯逻辑工具函数扩展 (`apps/web/src/views/device/device-core.ts`)
1. `validateVoltage`: 主电瓶电压健康度评定纯函数 (NORMAL, LOW, HIGH)。
2. `validateTemperature`: 芯片工作温度评定纯函数 (NORMAL, WARNING, OVERHEAT)。
3. `validateHeartbeatInterval`: 心跳参数范围校验 (10~3600s)。
4. `validateSecurityCode`: 安全确认码严格校验 (`code === 'REBOOT'`)。

### D. 页面集成 (`DeviceListView.tsx`)
1. 列表操作列【详情】按钮与点击设备编号均触发打开 `DeviceDetailDrawer`。
2. 传递当前选中设备的 `deviceId`，并在抽屉参数配置或重启成功后联动列表状态。

### E. 自动化测试要求 (`apps/web/src/test/device-detail.test.ts`)
1. 电压区间评定逻辑纯函数测试；
2. 温度区间评定逻辑纯函数测试；
3. 心跳参数与配置字段校验纯逻辑测试；
4. L2 安全确认码校验纯逻辑测试；
5. `updateDeviceConfigApi` 与 `rebootDeviceApi` 客户端调用测试；
6. 离线状态降级与内存池更新测试。

### F. 编译与构建门禁
- `pnpm --filter @car-control/web test` 100% 通过；
- `pnpm --filter @car-control/web build` Vite 8 / Rolldown 0 报错通过。
