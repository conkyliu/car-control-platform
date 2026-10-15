# Sprint 2 Task 3 Report: 设备详情监控抽屉与远程参数配置中心 (`DeviceDetailDrawer.tsx` + 远程参数下发 + L2 远程重启门禁)

## 1. 任务基本信息
- **任务编号**：Sprint 2 Task 3
- **任务目标**：基于《手机控车平台功能清单.docx》模块 04（4.3 设备详情、4.4 状态监测、4.5 远程参数配置）与《docs/design/page-specs/device-management.md》3.3 节，在 `apps/web` 中交付 640px 响应式设备详情监控抽屉，包含 3 大标签页（硬件与基础信息、实时工况监测仪表盘、远程参数配置与 L2 高危重启门禁），完成与 `DeviceListView.tsx` 的全闭环联动。
- **Base Commit**：`ebbd2f3` (`fix(web): address reviewer feedback on rowNumber display fallback in BatchImportModal`)
- **Current Commit**：`26bb2ce` (`feat(web): implement DeviceDetailDrawer telemetry diagnostics and remote configuration`)
- **状态**：COMPLETED (100% 验收通过)

---

## 2. 交付物清单与代码路径

### 2.1 纯逻辑与类型扩展 (`apps/web/src/views/device/device-core.ts`)
1. **纯函数实现**：
   - `validateVoltage(v?: number | null): VoltageHealth`: 判定主电瓶电压健康度（11.5V~15.0V 为 `NORMAL`；<11.5V 判定为 `LOW` 低电压告警；>15.0V 判定为 `OVERVOLTAGE` 发电机过压告警；空值返回 `UNKNOWN`）。
   - `getVoltageStatusMeta(v?: number | null)`: 映射电压告警标签、主题色与 Alert 类型。
   - `validateTemperature(t?: number | null): TemperatureHealth`: 芯片工作温度评定（<60°C 为 `NORMAL`；60~75°C 为 `WARNING` 偏高预警；>75°C 为 `OVERHEAT` 严重过热告警；空值返回 `UNKNOWN`）。
   - `getTemperatureStatusMeta(t?: number | null)`: 映射芯片温度告警元数据。
   - `validateHeartbeatInterval(sec?: number | null): boolean`: 心跳上报周期有效性校验（严格限制在 10 ~ 3600 秒区间）。
   - `validateSecurityCode(code?: string | null): boolean`: L2 重启防误触安全确认码强校验（严格匹配 `'REBOOT'`）。
2. **数据类型抽象**：
   - `BoundVehicleDetail`: 车牌、VIN、车型、车主姓名与脱敏联系电话。
   - `DeviceConfigInput`: 心跳周期、APN、定位上报开关与间隔、蓝牙 PKE 感应开关与灵敏度档位。
   - `DeviceDetailDto`: 继承 `DeviceDto`，扩充机构名称、CSQ、GPS 经纬度坐标、锁星状态、搜星颗数、心跳延迟、绑定车辆卡片与配置项。

### 2.2 数据分层与 API 抽象 (`apps/web/src/api/device.ts`)
1. `fetchDeviceDetailApi(id: string): Promise<DeviceDetailDto>`:
   - 发起 `GET /devices/:id`，支持真实后端 API 响应。
   - 遵循 `isApiError` 模式：异常自动抛出，离线/开发环境在内存池中查找并补全详细工况与关联车辆卡片数据。
2. `updateDeviceConfigApi(id: string, config: DeviceConfigInput): Promise<DeviceDetailDto>`:
   - 前置调用 `validateHeartbeatInterval` 校验心跳区间。
   - 发起 `PATCH /devices/:id/config`。
   - 遵循 `isApiError` 模式：离线/开发环境在 `inMemoryDevices` 状态池中原子更新配置并返回最新详情。
3. `rebootDeviceApi(id: string, securityCode: string): Promise<{ success: boolean; message: string }>`:
   - 前置安全校验 `validateSecurityCode(securityCode)`，非合法安全码直接拦截抛错。
   - 发起 `POST /devices/:id/reboot`。
   - 离线/开发环境安全降级并返回审计确认提示消息。

### 2.3 设备详情监控抽屉 (`apps/web/src/views/device/DeviceDetailDrawer.tsx`)
1. **抽屉规格与头部架构**：
   - 640px 右侧滑出抽屉，头部展示设备编号（等宽高亮并支持复制）、在线状态 Badge、所属项目 Tag 与右上角即时刷新按钮。
2. **Tab 1: 硬件与基础档案**：
   - **基础参数 Descriptions**：设备编号、IMEI、ICCID、产品型号、归属项目、所属机构、固件版本（cyan Tag）、激活入网时间、最后心跳时间与生命周期状态 Tag。
   - **绑定车辆卡片**：
     - 若已绑定：蓝色高亮车牌 Tag、等宽 VIN 码、车型品牌规格、车主姓名与脱敏电话；
     - 若未绑定：浅灰空态提示卡片，引导前往车辆资产中心进行配对。
3. **Tab 2: 实时工况监控仪表**：
   - **异常告警横幅**：根据电压（低压/过压）、芯片温度（偏高/过热）及备用电池（<20%）动态渲染顶部 Alert 提示条。
   - **通讯态势卡片**：在线状态与心跳耗时延迟 Statistic、4G 阶梯信号条形指示器与 dBm 数值、CSQ 信号等级（0~31 阶梯）。
   - **电气环境卡片**：主电瓶电压大字指标与状态 Tag、备用锂电池百分比环形进度条（<20% 变红）、芯片运行温度与健康度 Tag。
   - **高精度卫星定位卡片**：WGS-84 经纬度坐标（一键复制）、定位锁星状态 Tag（GPS已锁定/基站定位）、可用搜星颗数 Statistic。
4. **Tab 3: 远程参数配置与 L2 重启门禁**：
   - **参数配置表单**：
     - 心跳上报周期（10~3600秒，步长 5，默认 30 秒，数字输入框）；
     - APN 接入点名称（输入框 + `CMNET` / `UNINET` / `CTNET` 快捷填充 Tag）；
     - 定位数据自动上报 Switch + 定位上报间隔（5~600秒数字输入框）；
     - 蓝牙 PKE 感应开关 Switch + 灵敏度档位 Slider（1~5 档，带近/中/远刻度）；
     - 【下发参数配置】Primary 按钮带 Loading 与成功提示。
   - **极高危操作区：远程设备重启**：
     - 浅红警示背景卡片，红色高危操作提醒；
     - 点击触发 **L2 二次确认防误触弹窗 (`Modal`)**；
     - 必须准确键入 `REBOOT` 方可激活确认按钮，严格防误触。

### 2.4 页面集成与导出
1. `apps/web/src/views/device/DeviceListView.tsx`:
   - 替换临时 Modal 为 `DeviceDetailDrawer`。
   - 列表操作列【详情】按钮与点击设备编号高亮链接均触发滑出抽屉。
   - 抽屉配置修改或重启指令执行后，通过 `onSuccess` 无缝重新载入列表。
2. `apps/web/src/views/device/index.ts`:
   - 导出 `DeviceDetailDrawer`。

---

## 3. 自动化测试结果 (TDD)
- **测试文件**：`apps/web/src/test/device-detail.test.ts`
- **执行命令**：`pnpm --filter @car-control/web test`

### 测试套件覆盖清单 (19 项新增断言全部通过)：
1. `validateVoltage`: 11.5V~15.0V 正常区间判定为 NORMAL
2. `validateVoltage`: <11.5V 判定为 LOW 并置位 warning 预警
3. `validateVoltage`: >15.0V 判定为 OVERVOLTAGE 并置位 error 告警
4. `validateVoltage`: undefined / null / NaN 安全处理为 UNKNOWN
5. `validateTemperature`: <60°C 判定为 NORMAL
6. `validateTemperature`: 60~75°C 判定为 WARNING 偏高告警
7. `validateTemperature`: >75°C 判定为 OVERHEAT 严重过热告警
8. `validateTemperature`: undefined / null / NaN 安全处理为 UNKNOWN
9. `validateHeartbeatInterval`: 接收 [10, 3600] 秒边界与正常取值
10. `validateHeartbeatInterval`: 拦截 <10 或 >3600 秒异常取值
11. `validateHeartbeatInterval`: 拦截非数字、NaN 与空值输入
12. `validateSecurityCode`: 严格匹配 "REBOOT" 返回 true
13. `validateSecurityCode`: 拦截小写、首尾空格及其他任意字符串
14. `fetchDeviceDetailApi`: 获取完整设备档案、车载卡片、卫星定位与工况指标
15. `fetchDeviceDetailApi`: 针对不存在的 ID 抛出明确 Error
16. `updateDeviceConfigApi`: 参数校验通过并在内存状态池中原子持久化
17. `updateDeviceConfigApi`: 拦截超出 [10, 3600] 范围的心跳参数
18. `rebootDeviceApi`: 校验通过 "REBOOT" 安全码并下发重启指令
19. `rebootDeviceApi`: 错误安全码强制拦截，保护设备不被意外重启

- **测试结果**：99 / 99 tests passed (100% 成功，0 失败)

---

## 4. 生产构建验证
- **执行命令**：`pnpm --filter @car-control/web build`
- **结果**：`tsc && vite build` 0 报错通过，TypeScript 类型检查无警告。
