# Sprint 3 Task 6 Brief: 指令字典与协议参数管理 (`CommandDictionaryModal.tsx` + `command-dictionary-core.ts` + `api/command-dictionary.ts`)

## 1. 任务背景与核心业务场景
依据《手机控车平台功能清单.docx》模块 07（7.1 指令字典管理、7.2 协议参数映射）：
在车联网管理系统中，控车指令是连接业务层（Web 控制台/移动端 App）与物联网通信网关（MQTT Broker/TCP 网关/车端 T-Box/车身 CAN 网络）的核心契约。
平台需要一套集中式、可视化、具备协议报文映射与安全分级定义的 **指令字典与协议参数管理中心**：
1. **全局统一指令规范 (7.1)**：集中维护 13 类标准控车指令的代码、中英文名称、4 大业务功能分类、默认安全等级 (L0/L1/L2)、默认超时时间 (3,000~60,000ms)、默认冷却频控 (0~300s) 及人机交互安全提示；
2. **协议参数与 CAN 报文映射 (7.2)**：结构化定义下行控制帧 (Downlink Frame) 的 JSON Payload Schema（参数名、类型、取值范围、单位、缺省值）、CAN 信号代号映射及终端 ACK 响应契约；
3. **协议手册与离线文档导出**：支持一键导出指令字典与协议规范为 Markdown / CSV 文档，便于车规研发与测试人员对账；
4. **全端多入口协同**：在 `CarControlWorkbench.tsx` (车控工作台) 与 `CapabilityTemplateView.tsx` (车型模板配置) 顶部提供一键呼出弹窗 (`CommandDictionaryModal`)，同时提供完整独立视图路由 `/command-dictionary`。

---

## 2. 交付文件清单

1. `apps/web/src/views/command/command-dictionary-core.ts`：
   - 纯领域模型、Schema 与协议映射定义：
     - `ProtocolParamSchema`: 参数名、类型、必填性、取值范围描述、默认值、CAN 映射信号名 (如 `CAN_BCM_DoorLockCmd`)
     - `CommandDictionaryItem`:
       ```ts
       export interface CommandDictionaryItem {
         code: CommandCode;
         name: string;
         category: CommandCategory;
         defaultSecurityLevel: SecurityLevel;
         defaultTimeoutMs: number;
         defaultFrequencyLimitSeconds: number;
         canSignalName: string;
         downlinkOpcode: string; // 如 0x02_01
         payloadSchema: Record<string, ProtocolParamSchema>;
         samplePayload: Record<string, unknown>;
         description: string;
         safetyWarning?: string;
       }
       ```
     - 纯函数：
       - `calculateDictionaryStats(items: CommandDictionaryItem[])`: 分类统计、L0/L1/L2 比例、带参数指令数、平均超时
       - `filterDictionaryItems(items: CommandDictionaryItem[], query: { keyword?: string; category?: CommandCategory; securityLevel?: SecurityLevel })`
       - `generateDictionaryMarkdown(items: CommandDictionaryItem[])`: 生成标准格式的 Markdown 控车协议手册
       - `generateDictionaryCsv(items: CommandDictionaryItem[])`: UTF-8 BOM CSV 导出 (含 CWE-1236 公式注入防御)
     - 高保真全量指令字典 `SEED_COMMAND_DICTIONARY`: 完整覆盖全部 13 类指令的下行参数与 CAN 映射。
2. `apps/web/src/api/command-dictionary.ts`：
   - `fetchCommandDictionaryApi(): Promise<CommandDictionaryItem[]>`
   - `fetchCommandDictionaryItemApi(code: CommandCode): Promise<CommandDictionaryItem>`
   - `updateCommandDictionaryItemApi(code: CommandCode, data: Partial<CommandDictionaryItem>): Promise<CommandDictionaryItem>`
   - 严格遵循 `isApiError` 模式与内存离线降级状态池。
3. `apps/web/src/views/command/CommandDictionaryModal.tsx` & `CommandDictionaryView.tsx`:
   - 弹窗形式 (`CommandDictionaryModal`)：宽 960px，支持从工作台或车型能力页面一键唤起；
   - 页面形式 (`CommandDictionaryView`)：作为 `/command-dictionary` 独立页面渲染；
   - 响应式 UI（Ant Design 6 纯原生 CSS 变量，`styles={{ body: ... }}`）：
     - 4 张统计 KPI 卡片（指令总数 13 项、L2 强门禁指令数、座舱/门锁/动力/车窗分布、支持下行参数指令数）；
     - 搜索与筛选工具栏（分类筛选 Segmented/Select、安全等级筛选、关键字快速过滤、导出 Markdown 协议手册按钮、导出 CSV 按钮）；
     - 核心 Table：
       - 指令名称（图标 + 名称 + 描述 Tooltip）
       - 指令代号与 Opcode（Monospace 复制、如 `CMD_LOCK` / `0x02_01`）
       - 所属分类（分类彩色 Tag）
       - 默认安全等级（L0 / L1 / L2 Tag）
       - 默认超时与冷却（如 `10s / 冷却 5s`）
       - 下行参数与 CAN 信号（参数数量 Badge、CAN 信号名 Monospace）
       - 操作：【查看协议报文】Drawer/Modal 触发器、【编辑】弹窗
     - `ProtocolDetailDrawer` (600px)：
       - 详细展示下行 JSON Schema 表格与可交互的代码高亮 JSON 示例
       - CAN 总线信号物理值映射
       - 异常码与终端 ACK 规范
4. 路由与多入口集成：
   - `apps/web/src/router/routes.ts`:
     - 注册 `RoutePath.COMMAND_DICTIONARY = '/command-dictionary'`，配置 `hideInMenu: true`，严格保持 `getMenuRoutes().length === 14` 契约不变；
   - `apps/web/src/layouts/AdminLayout.tsx`:
     - 挂载路由 `RoutePath.COMMAND_DICTIONARY` -> `<CommandDictionaryView />`；
   - `apps/web/src/views/command/CarControlWorkbench.tsx`:
     - 顶部操作栏增加【指令字典】按钮，呼出 `CommandDictionaryModal`；
   - `apps/web/src/views/command/CapabilityTemplateView.tsx`:
     - 顶部操作栏增加【指令字典与协议参数】按钮，呼出 `CommandDictionaryModal`；
   - `apps/web/src/views/command/index.ts`:
     - 统一导出 `CommandDictionaryModal`、`CommandDictionaryView` 及 `command-dictionary-core.ts`。
5. `apps/web/src/test/command-dictionary.test.ts`：
   - TDD 全量单元测试套件：覆盖 13 类指令完整性、参数 Schema 校验、Markdown/CSV 文档生成与防公式注入、过滤搜索、API 客户端及离线内存降级。

---

## 3. 验收与质量门禁 (Gate Constraints)
- **纯 CSS 变量与 AntD 6 原生规范**：全部使用纯原生 CSS 变量，Card 采用 `styles={{ body: ... }}`，杜绝废弃的 `bodyStyle`。
- **保护主菜单路由恒定**：保持主菜单 14 条路由基准不变。
- **全量门禁检查**：
  - `pnpm --filter @car-control/web test` 100% 通过（新增测试用例不少于 20 项）；
  - `pnpm --filter @car-control/web build` Vite 8 Rolldown 0 错误编译通过。
