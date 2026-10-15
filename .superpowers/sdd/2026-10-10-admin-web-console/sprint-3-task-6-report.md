# Sprint 3 Task 6 Implementation Report: 指令字典与协议参数管理

## 1. 任务概述与核心交付物
- **任务名称**：指令字典与协议参数管理 (`CommandDictionaryModal.tsx` + `CommandDictionaryView.tsx` + `command-dictionary-core.ts` + `api/command-dictionary.ts`)
- **实现基线提交**：`6f5e1553e87eb3a27e7b7af768245ae9018f8122`
- **成果提交 Hash**：`05dbc56`
- **遵循规范**：React 19 + TypeScript 5 + Ant Design 6 原生纯 CSS 变量体系 + Vite 8 (Rolldown)

## 2. 交付文件与架构落地

### 2.1 纯领域模型与契约 (`apps/web/src/views/command/command-dictionary-core.ts`)
1. **领域模型与 Schema**：
   - `ProtocolParamSchema`：参数名、数据类型 (`string` | `number` | `boolean` | `enum` | `object`)、必填性、单位、默认值、CAN 映射信号、取值范围/枚举约束；
   - `CommandDictionaryItem`：包含 13 类标准控车指令的代号、中英文名称、4 大业务功能集群、默认安全等级 (L0/L1/L2)、默认超时时间 (3,000~60,000ms)、频控冷却限制 (0~300s)、CAN 信号映射、下行控制字 Opcode (如 `0x02_01`)、下行 Payload JSON Schema 结构约束、JSON 示例报文与人机交互安全警示文案；
   - `SEED_COMMAND_DICTIONARY`：覆盖 13 类业务指令高保真生产环境种子数据集。
2. **纯函数运算与防御**：
   - `calculateDictionaryStats(items)`：计算指令总数 (13)、L0/L1/L2 比例、4 大业务集群分布、支持动态参数指令数、平均超时与平均频控冷却时长；
   - `filterDictionaryItems(items, query)`：支持按关键词、业务集群、安全等级进行多维组合筛选；
   - `validatePayloadAgainstSchema(schema, payload)`：严格校验下行 Payload 字段类型、必填性与范围；
   - `generateDictionaryMarkdown(items)`：一键生成格式规范的 Markdown 协议手册；
   - `generateDictionaryCsv(items)` 与 `sanitizeCsvCell(val)`：支持导出 RFC 4180 标准 CSV，严格前置 UTF-8 BOM (`\uFEFF`) 防乱码，并对 `=, +, -, @, \t, \r` 实施 CWE-1236 针对 Excel 公式注入的单引号前缀转义清洗防御。

### 2.2 API 客户端与离线仿真降级 (`apps/web/src/api/command-dictionary.ts`)
- `fetchCommandDictionaryApi()`：拉取全量指令字典列表，网络或服务端异常时平滑降级至本地内存状态池；
- `fetchCommandDictionaryItemApi(code)`：检索单条指令详情，不存在时规范抛出 404 `ApiError`；
- `updateCommandDictionaryItemApi(code, data)`：支持动态更新超时阈值、频控、业务描述及安全警示，更新同步至内存池；
- `resetInMemoryDictionary()`：用于自动化测试状态重置与单测隔离。

### 2.3 可视化视图与多入口集成
1. **独立视图与统一弹窗**：
   - `CommandDictionaryView.tsx`：4 张 KPI 指标卡片 (AntD 6 `styles={{ body: ... }}`)、多维筛选检索栏、核心表格、600px 报文详情抽屉 (`ProtocolDetailDrawer`，含语法高亮 JSON、一键复制、ACK 契约说明) 及编辑元数据 Modal；
   - `CommandDictionaryModal.tsx`：960px 沉浸式全局弹窗，提供跨模块即时呼出能力。
2. **多入口挂载与菜单恒定契约**：
   - `apps/web/src/router/routes.ts`：注册 `RoutePath.COMMAND_DICTIONARY = '/command-dictionary'`，配置 `hideInMenu: true`，严格保证主菜单可见路由保持 14 项恒定；
   - `apps/web/src/layouts/AdminLayout.tsx`：挂载 `/command-dictionary` 路由视图与 `BookOutlined` 图标映射；
   - `apps/web/src/views/command/CarControlWorkbench.tsx`：顶部工具栏新增【指令字典】按钮，一键唤起 `CommandDictionaryModal`；
   - `apps/web/src/views/command/CapabilityTemplateView.tsx`：顶部操作栏新增【指令字典与协议参数】按钮，一键唤起 `CommandDictionaryModal`；
   - `apps/web/src/views/command/index.ts`：对外统一导出。

## 3. 测试验证与质量门禁 (TDD & Build Verification)
1. **单元测试套件** (`apps/web/src/test/command-dictionary.test.ts`)：
   - 新增 24 项高覆盖测试用例，覆盖种子字典完整性、统计聚合、多维过滤、Markdown 生成、CSV 导出与 CWE-1236 防御、Payload Schema 校验、API 客户端及离线内存状态更新；
   - 全工程单测执行：`node --test --experimental-strip-types src/test/*.test.ts` 313/313 全部通过 (100% Pass)；
   - 验证主菜单可见路由 14 项契约保持恒定 (`admin-layout.test.ts` 通过)。
2. **生产构建检查**：
   - 执行 `pnpm --filter @car-control/web build`；
   - Vite 8 Rolldown 0 错误编译通过，模块打包耗时 814ms。
