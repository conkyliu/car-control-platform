# Sprint 3 Task 1 Brief: 远程车控全景运营台 (`CarControlWorkbench.tsx` + `command-core.ts` + `api/command.ts`)

## 1. 任务背景与目标
基于《手机控车平台功能清单.docx》模块 06（车控中心，P0 6.1~6.10 13类车控指令、6.11 防误触二次确认、6.12 状态机跟踪、6.13 安全码校验）、模块 07（7.3 车型能力继承）、《手机控车平台-Admin管理后台开发计划-V2.1-补充PM与UIUX.md》与《docs/design/page-specs/car-control-workbench.md》，在 `apps/web` 中交付生产级远程车控全景运营台 (`CarControlWorkbench.tsx`)。
替换早期的基础原型面板，提供高保真车辆全景车况看板、13 类指令分级安全触发机制（L0/L1/L2 防误触与 6 位安全码校验）、车型能力动态继承禁用以及 409 并发排他锁防风暴防护。

---

## 2. 详细功能与交互规范

### A. 核心纯逻辑与领域模型 (`apps/web/src/views/command/command-core.ts`)
1. **13 类车控指令全景元数据字典 (`COMMAND_METADATA`)**：
   - 包含指令代码 (`CommandCode`)、中文名称、图标、默认超时时间、安全级别 (`L0`, `L1`, `L2`)、危险警示语、参数要求。
   - 覆盖指令：
     1. `CMD_LOCK`: 车辆上锁 (L0)
     2. `CMD_UNLOCK`: 车辆解锁 (L1)
     3. `CMD_TRUNK_OPEN`: 开启后备箱 (L1 - 财产风险警示)
     4. `CMD_TRUNK_CLOSE`: 关闭后备箱 (L1)
     5. `CMD_FIND_VEHICLE`: 鸣笛寻车 (L0 - 鸣笛双闪 30s)
     6. `CMD_ENGINE_START`: 远程点火启动 (L2 - 高危，可选时长 5~45min，强制 6 位数字安全码)
     7. `CMD_ENGINE_STOP`: 远程熄火 (L2 - 高危，车辆车速为 0 且处于 P 档前置校验，强制安全码)
     8. `CMD_AC_START`: 开启空调 (L1 - 设定温度 16~30°C，风速 1~3 档，内外循环)
     9. `CMD_AC_STOP`: 关闭空调 (L0)
     10. `CMD_WINDOW_OPEN`: 一键降窗 (L1)
     11. `CMD_WINDOW_CLOSE`: 一键升窗 (L1 - 防夹手提示)
     12. `CMD_SEAT_HEAT`: 座椅加热 (L1 - 主驾/副驾加热档位 1/2/3 档)
     13. `CMD_SUNROOF_CONTROL`: 开启/关闭天窗 (L1)
2. **安全码校验纯函数 (`validateSecurityCode`)**：
   - L2 指令必须提供 6 位纯数字安全码 (`/^\d{6}$/`，默认测试验证码 `123456`)；
   - L1 指令在需要时进行操作密码校验；
   - 校验非法时输出明确拦截原因。
3. **时长与耗时格式化纯函数 (`formatExecutionDuration`)**：
   - `< 1000ms` 显示 `Xms`；
   - `≥ 1000ms` 显示 `X.XXs`（如 `1.28s`）。
4. **车型能力继承判定纯函数 (`isCommandSupportedByCapability`)**：
   - 结合车辆绑定的 `EffectiveCapabilityDto` 映射，判定当前指令是否被当前车型支持；
   - 若不支持，输出提示文案“该车型硬件配置不支持此功能”。

---

### B. 业务页面组件架构 (`apps/web/src/views/command/CarControlWorkbench.tsx`)
1. **顶部车辆快速选择与全景卡片**：
   - 车辆快捷下拉选择器（支持按车牌、VIN 后 6 位、品牌车型模糊检索）；
   - 实时工况透视看板：
     - 在线状态 Badge (🟢 在线 / ⚪ 离线)；
     - 蓄电池电压指标与色彩警示 (≥12.0V 绿色，<12.0V 橙色，<11.0V 红色)；
     - 发动机状态 (点火运行中 / 已熄火)；
     - 四门锁态 (已锁闭 / 已开启)；
     - 后备箱与天窗状态；
     - 空调状态与车舱温度；
     - 行驶里程与最新心跳时间。
2. **70% / 30% 响应式双栏工作台布局**：
   - **左栏 (70%)：13 类控车操作指令矩阵卡片**：
     - 按功能分组：
       - 【门锁与后备箱】：解锁、上锁、开尾箱、关尾箱；
       - 【动力与寻车】：寻车鸣笛、远程点火 (L2)、远程熄火 (L2)；
       - 【座舱温控】：开启空调、关闭空调、座椅加热；
       - 【车窗天窗】：一键降窗、一键升窗、天窗控制；
     - 按钮状态：
       - 若车辆离线，全局禁用所有按钮并提示“车载终端离线中”；
       - 若车型能力不支持，对应按钮置灰禁用，悬停展示 Tooltip；
       - 点击下发带 Loading 与状态反馈。
   - **右栏 (30%)：实时指令执行流水面板**：
     - 展示当前车辆最近指令执行流水；
     - 状态机跳变展示 (`WAITING_ACK` 黄色旋转 -> `SUCCESS` 绿色 / `DEVICE_REJECTED` 橙色 / `TIMEOUT` 红色)；
     - 显示精确耗时与应答详情；
     - 409 并发排他锁防风暴捕获提示（若有指令正在执行，二次点击提示“该车辆已有指令正在执行中，请稍候”）。
3. **分级安全二次确认与参数模态框**：
   - **L1 防误触确认**：解锁、开尾箱等弹出友好确认气泡或模态框；
   - **L2 高危确认模态框 (`L2SecurityModal`)**：
     - 远程点火：选择启动运行时间 (5~45 分钟滑块，默认 15 分钟)；
     - 远程熄火：校验车速=0 且 P 档；
     - 强制输入 6 位数字安全码（支持测试环境提示 `123456`）；
   - **空调温控参数模态框 (`AcConfigModal`)**：
     - 设定目标温度 (16°C ~ 30°C，步进 1°C)；
     - 风速档位选择 (1/2/3 档)；
   - **座椅加热模态框 (`SeatHeatModal`)**：
     - 选择主驾/副驾，档位 1~3 档。

---

### C. 数据分层与 API 抽象 (`apps/web/src/api/command.ts`)
1. `executeCommandApi(vehicleId: string, input: CreateCommandRequestDto): Promise<CommandRecord>`:
   - 发送 `POST /api/v1/vehicles/:vehicleId/commands`；
   - 捕获 409 状态码并抛出标准化 `CommandLockError`；
   - 离线/演示模式使用内存状态池原子推进并返回 ACK。
2. `fetchVehicleCapabilitiesApi(vehicleId: string): Promise<Record<CommandCode, EffectiveCapabilityDto>>`:
   - 发送 `GET /api/v1/vehicles/:vehicleId/capabilities`。
3. `fetchCommandHistoryApi(vehicleId: string): Promise<CommandRecord[]>`:
   - 获取该车辆最近指令历史记录。
4. 严格遵循 `isApiError` 模式。

---

### D. 页面集成与路由更新
1. 替换 `apps/web/src/layouts/AdminLayout.tsx` 中的旧版 `CarControlPanel`，改为挂载新版 `CarControlWorkbench`：
   - `if (activeKey === RoutePath.COMMANDS) return <CarControlWorkbench />;`
2. 导出自 `apps/web/src/views/command/index.ts`。

---

### E. 自动化测试要求 (`apps/web/src/test/car-control-workbench.test.ts`)
1. 指令元数据与安全等级划分纯逻辑测试 (L0, L1, L2)；
2. L2 6 位数字操作安全码强校验纯函数测试；
3. 耗时毫秒/秒格式化纯函数测试；
4. 车型能力继承判定与不支持置灰测试；
5. 指令下发 API 客户端集成与 409 并发排他锁异常捕获测试；
6. 离线状态降级与车况联动模拟测试。

---

### F. 编译与构建门禁
- `pnpm --filter @car-control/web test` 100% 通过；
- `pnpm --filter @car-control/web build` Vite 8 / Rolldown 0 报错通过。
