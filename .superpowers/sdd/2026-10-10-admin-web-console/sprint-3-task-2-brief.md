# Sprint 3 Task 2 Brief: 指令实时生命周期流水与状态机追踪抽屉 (`CommandStreamDrawer.tsx` + 状态跃迁耗时大屏 + 409 排他锁追踪)

## 1. 任务背景与目标
基于《手机控车平台功能清单.docx》模块 06（6.12 状态机流水跟踪、6.10 指令下发与结果反馈）、《手机控车平台-Admin管理后台开发计划-V2.1-补充PM与UIUX.md》与《docs/design/page-specs/car-control-workbench.md》3.3节，在 `apps/web` 中交付 720px 响应式指令实时生命周期流水与状态机追踪抽屉 (`CommandStreamDrawer.tsx`)。
支持：
1. **11 步有限状态机 (FSM) 全生命周期可视化流转**（从 `CREATED`、`VALIDATING`、`QUEUED`、`SENDING`、`SENT`、`WAITING_ACK` 到 `SUCCESS` / `DEVICE_REJECTED` / `TIMEOUT` / `FAILED`）；
2. **微秒/毫秒级阶梯耗时切片统计 (Timing Breakdown)**（平台校验耗时、排他加锁耗时、MQTT 下行耗时、终端处理与 ACK 上行耗时、全链路端到端总耗时）；
3. **原始报文与审计对照 (Raw JSON Payload Viewer)**（下行 Downlink 与上行 Uplink 报文一键复制、格式化高亮）；
4. **409 分布式排他锁冲突归因卡片**（持锁指令 ID、TTL 倒计时与防风暴提示）；
5. 深度集成于 `CarControlWorkbench.tsx`，支持从流水列表与历史记录一键滑出抽屉排查诊断。

---

## 2. 详细功能与交互规范

### A. 核心纯逻辑与数据模型 (`apps/web/src/views/command/command-stream-core.ts`)
1. **FSM 状态机步进映射纯函数 (`getCommandStatusStepIndex`)**：
   - 将 11 个 `CommandStatus` 映射至时间轴步骤节点：
     - Step 0: `CREATED` (客户端创建，记录 $T_0$)
     - Step 1: `VALIDATING` (权限与安全校验通过)
     - Step 2: `QUEUED` (分布式排他锁队列入队，加锁成功)
     - Step 3: `SENDING` / `SENT` (MQTT Broker 报文下发)
     - Step 4: `WAITING_ACK` (车载 T-Box 执行中，等待应答)
     - Step 5: 终态 (`SUCCESS` / `DEVICE_REJECTED` / `TIMEOUT` / `FAILED` / `CANCELLED`)
   - 返回当前激活步骤索引、步骤状态（`process` / `finish` / `error`）。
2. **时延切片计算纯函数 (`calculateStepTimings`)**：
   - 输入生命周期节点时间戳列表，精确计算：
     - 网关校验耗时 ($T_1 - T_0$)
     - 排他加锁耗时 ($T_2 - T_1$)
     - 下行发布耗时 ($T_3 - T_2$)
     - 终端执行与 ACK 往返耗时 ($T_{\text{ack}} - T_3$)
     - 全链路总耗时 ($T_{\text{end}} - T_0$)
   - 健康度色彩标记（总耗时 $< 1500\text{ms}$ 绿色健康，$1500 \sim 3000\text{ms}$ 橙色警告，$> 3000\text{ms}$ 红色延迟过高）。
3. **409 排他锁冲突归因分析器 (`parseCommandLockDetails`)**：
   - 提取冲突 Key (`lock:cmd:${tenantId}:${vehicleId}`)、持锁指令 ID、当前排队等待策略。
4. **高保真种子追踪数据 (`SEED_COMMAND_TRACES`)**：
   - 覆盖 4 类典型执行全链路：正常成功链路 (SUCCESS，耗时约 1.1s)、终端拒绝链路 (REJECTED，挡位非P档)、超时链路 (TIMEOUT，10s 无应答)、409 排他冲突链路。

---

### B. 交互抽屉设计 (`apps/web/src/views/command/CommandStreamDrawer.tsx`)
1. **抽屉规格与头部信息**：
   - 宽度 `720px`，右侧滑出抽屉，支持 `destroyOnClose`；
   - 头部展示：指令编号 (`commandId` monospace copyable)、指令名称 Tag、操作员姓名、触发时间、实时状态 Badge。
2. **核心内容区四大板块**：
   - **板块 1: 全链路状态机跃迁时间轴 (`Steps` / `Timeline`)**：
     - 纵向展示 6 个核心阶段，带有状态图标（绿勾、黄色 Spin、红色叉号、橙色警告）；
     - 每个步骤标注阶段耗时与精确时间戳（如 `10:25:31.120 (+15ms)`）；
     - 若发生异常（如 REJECTED），高亮展开车机拒绝根因卡片（如“车速非 0 且挡位处于 D 档，禁止点火”）。
   - **板块 2: 耗时阶梯分布图 (Timing Breakdown)**：
     - 进度条分段展示：网关校验、分布式锁、下行网络、车机执行与上行；
     - 突出展示全链路端到端总耗时 (如 `1,085 ms (1.09s)`) 与 SLA 健康等级 (绿色/橙色/红色)。
   - **板块 3: 原始通信报文对照 (JSON Payload Viewer)**：
     - 双标签页 (`Tabs`)：
       - Tab A: 下行指令报文 (`Downlink Payload`，包含 traceId, commandCode, params, timestamp)；
       - Tab B: 上行应答报文 (`Uplink ACK Payload`，包含 code, message, data, latency)；
     - 代码块格式化展示，支持一键复制到剪贴板。
   - **板块 4: 409 排他锁冲突警示卡片 (条件展示)**：
     - 当指令因并发排他被阻断时，展示浅红警示卡片，解析持锁指令与释锁建议。

---

### C. 数据分层与 API 抽象 (`apps/web/src/api/command.ts`)
1. `fetchCommandTraceApi(commandId: string): Promise<CommandTraceDto>`:
   - 发起 `GET /api/v1/commands/:commandId/trace`，获取全量链路切片数据；
   - 离线环境在本地内存池与 `SEED_COMMAND_TRACES` 中匹配返回。
2. 遵循 `isApiError` 模式。

---

### D. 页面集成 (`CarControlWorkbench.tsx`)
1. 在右侧【实时指令执行流水】列表的每条记录中，增加【追踪详情】快捷按钮或整行点击；
2. 顶部新增【历史链路大屏】按钮，点击均滑出 `CommandStreamDrawer`；
3. 从 `apps/web/src/views/command/index.ts` 导出 `CommandStreamDrawer` 与核心纯逻辑工具。

---

### E. 自动化测试要求 (`apps/web/src/test/command-stream.test.ts`)
1. 11 步状态机步骤索引与状态转换映射测试 (`getCommandStatusStepIndex`)；
2. 阶段耗时切片与 SLA 健康评定测试 (`calculateStepTimings`)；
3. 409 排他冲突归因解析测试；
4. API 客户端集成测试 (`fetchCommandTraceApi`)；
5. 离线状态降级与全链路样例回显测试。

---

### F. 编译与构建门禁
- `pnpm --filter @car-control/web test` 100% 通过；
- `pnpm --filter @car-control/web build` Vite 8 / Rolldown 0 报错通过。
