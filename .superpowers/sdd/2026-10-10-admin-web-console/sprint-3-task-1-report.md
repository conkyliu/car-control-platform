# Sprint 3 Task 1 Implementation Report: 远程车控全景运营台

- **Task Name**: 远程车控全景运营台 (`CarControlWorkbench.tsx` + `command-core.ts` + `api/command.ts`)
- **Base Commit**: `4093719`
- **Feature Commit**: `084836c`
- **Execution Date**: 2026-10-13

---

## 1. 交付物汇总

| 文件路径 | 变更类型 | 说明 |
|---|---|---|
| `packages/contracts/src/command/command-codes.ts` | 修改 | 新增 `CMD_SEAT_HEAT` 与 `CMD_SUNROOF_CONTROL` 完整覆盖 13 类指令 |
| `apps/web/src/views/command/command-core.ts` | 新建 | 13 类车控指令元数据字典 (`COMMAND_METADATA`)、L2 纯数字 6 位安全码校验 (`validateSecurityCode`)、耗时格式化纯函数 (`formatExecutionDuration`)、车型能力继承判定 (`isCommandSupportedByCapability`)、蓄电池电压健康度评估 (`evaluateVoltageHealth`)、409 排他锁异常 (`CommandLockError`) 与离线测试种子数据 |
| `apps/web/src/api/command.ts` | 新建 | 指令执行 API (`executeCommandApi` 带 409 排他锁自动转换)、车型能力拉取 API (`fetchVehicleCapabilitiesApi`)、历史指令流水拉取 API (`fetchCommandHistoryApi`) 及离线仿真状态流转管理 |
| `apps/web/src/views/command/CarControlWorkbench.tsx` | 新建 | 生产级远程车控全景运营台：顶部车牌/VIN/车型快速切换、实时工况透视看板、70%/30% 响应式双栏布局（左侧 13 类指令 4 大功能分组与分级二次确认模态框，右侧实时指令执行流水与 409 防风暴提示） |
| `apps/web/src/views/command/index.ts` | 新建 | 模块标准导出 |
| `apps/web/src/layouts/AdminLayout.tsx` | 修改 | 将 `RoutePath.COMMANDS` 挂载组件从旧原型 `CarControlPanel` 升级替换为生产级 `CarControlWorkbench` |
| `apps/web/src/test/car-control-workbench.test.ts` | 新建 | 涵盖 13 类指令元数据划分、L2 6 位纯数字安全码校验、耗时格式化、车型能力模板继承判断、409 并发排他锁异常及 API 离线仿真等 28 个细项的自动化 TDD 单元测试 |

---

## 2. 自动化测试与构建门禁验证

### 2.1 单元测试验证
执行指令：
```bash
pnpm --filter @car-control/web test
```
**结果**：
- 测试用例总数：193 tests passed (原 165 个全部通过，本任务新增 28 个用例 100% 通过)
- 失败用例：0
- 执行耗时：~2.7s

### 2.2 生产环境构建验证
执行指令：
```bash
pnpm --filter @car-control/web build
```
**结果**：
- `tsc` 类型推断检查：0 errors
- `vite build` 打包构建：0 errors，成功生成生产 bundle：`dist/index.html` (0.39 kB) 和 `dist/assets/index-ubUlgRtE.js` (1,761.01 kB)

### 2.3 全工作区回归验证
执行指令：
```bash
pnpm -r test
```
**结果**：所有微服务、契约包与 Web 控制台测试套件全部通过 (100% pass)。

---

## 3. 关键特性与设计决策

1. **13 类车控指令全景分级覆盖 (L0 / L1 / L2)**：
   - **L0 常规下发**：车辆上锁、寻车鸣笛、关闭空调。
   - **L1 防误触二次确认**：车辆解锁、后备箱开闭（带财产防盗警示弹窗）、一键升降窗（带防夹手安全提醒）、开启空调（设定 16~30°C 温度与风速）、座椅加热（主/副驾 1~3 档调节）、全景天窗控制。
   - **L2 强安全高危核验**：远程点火启动（滑块调节 5~45 分钟时长）、远程熄火（强制车速=0 且 P 档前置安全校验）；强制输入 6 位纯数字安全操作码 (`validateSecurityCode`，测试环境预置 `123456`)。
2. **车型能力动态继承与优雅置灰**：
   - 联动 `EffectiveCapabilityDto` 字典，若车型硬件不支持（如低配车型无座椅加热或无天窗），自动禁用按钮并在悬停 Tooltip 中展示“该车型硬件配置不支持此功能”，杜绝非法指令下发。
3. **409 并发排他锁与防风暴防护**：
   - 捕获后端 HTTP 409 冲突状态，标准化包装为 `CommandLockError`；
   - 前端触发状态锁与友好 Alert/Notification 提示“该车辆已有指令正在执行中，请稍候”，避免指令风暴并展示于实时执行流水。
4. **实时车况与指令流水双向闭环**：
   - 指令成功执行后，自动平滑过渡流水状态（`WAITING_ACK` -> `SUCCESS`），计算毫秒/秒级端到端耗时，并联动左侧车辆工况看板（四门锁态、动力状态、空调温度、后备箱与车窗开闭）。
