# Sprint 3 Task 3 Brief: 车型能力模板配置中心 (`CapabilityTemplateView.tsx`)

## 1. 任务背景与系统定位
在车控物联网架构中，不同车型由于出厂硬件配置（如燃油/纯电动力总成、有无全景天窗、有无座椅加热模块、空调控制器精度）与车规级 CAN 总线拓扑不同，所支持的远程车控指令集和参数边界存在巨大差异。
若前端直接允许向不支持的车型下发指令，会造成设备 CAN 总线报错、执行超时甚至车辆告警。

因此，**车型能力模板配置中心 (`CapabilityTemplateView.tsx`)** 是车控系统的核心能力守门中枢：
1. **全局统一字典与分类**：覆盖系统定义的 13 类车控指令（门锁、后备箱、寻车、点火、熄火、空调开闭、车窗、天窗、座椅加热），结构化映射至 4 大业务功能集群；
2. **车型级能力模板矩阵**：按车型与协议 0x02 代号维护可用指令集，支持可视化勾选/禁用、安全等级重载 (L0/L1/L2)、响应超时阈值 (3,000~60,000ms)、防风暴频控冷却 (0~300s) 以及专属参数 Schema 约束；
3. **能力继承与多车复用**：提供模板克隆复制能力，支持一键应用到同动力平台的新车型，并支持模板间配置差异（Diff）分析；
4. **与车控工作台联动**：`CarControlWorkbench.tsx` 动态加载对应车型的生效能力，对不支持或已禁用的指令展示置灰并附带精确 Tooltip，彻底杜绝违规指令下发。

---

## 2. 交付文件清单

1. `apps/web/src/views/command/capability-core.ts`：
   - 纯领域模型、函数、Schema 定义与测试种子：
     - 指令分类枚举 `CommandCategory` (DOOR_BODY, POWER_FIND, CABIN_CLIMATE, WINDOW_ROOF)
     - 参数约束模型 `ParamConstraintSchema` (温度上下限、风速档位、启动时长下限/上限/步长、座椅档位等)
     - 单项指令能力规则 `CapabilityRule`:
       ```ts
       export interface CapabilityRule {
         supported: boolean;
         securityLevel: SecurityLevel;
         timeoutMs: number;
         frequencyLimitSeconds: number;
         paramConstraints?: Record<string, unknown>;
         description?: string;
       }
       ```
     - 车型能力模板模型 `ModelTemplateDto`:
       ```ts
       export interface ModelTemplateDto {
         id: string;
         modelId: string;
         modelName: string;
         protocolCode: string; // 0x02 协议十六进制代号 (如 0x0001)
         powertrain: 'EV' | 'PHEV' | 'ICE' | 'REEV';
         description?: string;
         updatedAt: string;
         updatedBy?: string;
         capabilities: Record<CommandCode, CapabilityRule>;
       }
       ```
     - 纯校验函数：
       - `validateTimeoutMs(ms: number)`: 3,000 ~ 60,000 ms
       - `validateFrequencyLimit(sec: number)`: 0 ~ 300 s
       - `validateParamConstraints(code: CommandCode, constraints: any)`: 参数约束合法性校验
     - 辅助计算纯函数：
       - `calculateTemplateStats(templates: ModelTemplateDto[])`: 模板总数、各动力类型统计、平均能力支持率、L2 高危指令覆盖数
       - `diffCapabilityTemplates(base: ModelTemplateDto, target: ModelTemplateDto)`: 快速比对两个模板之间的指令支持差异与参数差异
       - `cloneModelTemplate(source: ModelTemplateDto, targetModelId: string, targetModelName: string, targetProtocolCode: string)`: 纯内存克隆并返回新实例
     - 高保真种子数据 `SEED_CAPABILITY_TEMPLATES`：
       - 至少覆盖 3 款典型车型：纯电旗舰 (EV, 13 项全支持)、经济燃油 (ICE, 仅支持 9 项，无天窗/座椅加热，点火为 L2)、插混 SUV (PHEV, 支持 12 项)
2. `apps/web/src/api/capability.ts`：
   - `fetchCapabilityTemplatesApi(): Promise<ModelTemplateDto[]>`
   - `fetchCapabilityTemplateByModelApi(modelId: string): Promise<ModelTemplateDto | null>`
   - `updateCapabilityTemplateApi(id: string, capabilities: Record<CommandCode, CapabilityRule>): Promise<ModelTemplateDto>`
   - `createCapabilityTemplateApi(data: CreateCapabilityTemplateInput): Promise<ModelTemplateDto>`
   - `cloneCapabilityTemplateApi(sourceId: string, targetModelId: string, targetModelName: string): Promise<ModelTemplateDto>`
   - 严格遵循 `isApiError` 模式：传递真实服务端异常，在离线/Mock 降级下安全修改内存种子池。
3. `apps/web/src/views/command/CapabilityTemplateView.tsx`：
   - 响应式主视图（科技深蓝规范、Ant Design 6 纯原生 CSS 变量、Card 采用 `styles={{ body: ... }}`）：
     - 统计指标卡片栏（4 张 Card）：模板总数、平均覆盖率、L2 高危门禁数、自定义参数模板数；
     - 双栏 Master-Detail 结构（或顶部分页 Tab + 主控表格）：
       - 左侧/顶栏车型选择器：展示车型名称、0x02 协议代码 Badge、动力类型 Tag (EV/PHEV/ICE/REEV)、当前支持指令数（如 `11/13 支持`），附带【+ 新建模板】与【克隆复制模板】按钮；
       - 主配置矩阵表格 (`Table`):
         - 列 1: 指令分类与名称（分类 Badge + 图标 + 指令代码 Monospace）
         - 列 2: 支持状态（`Switch` 绿色开启 / 置灰关闭）
         - 列 3: 安全等级（`Select` L0 / L1 / L2，切换为 L2 时带有醒目安全警示）
         - 列 4: 响应超时时间（`InputNumber` 步长 1000ms，范围 3000~60000ms）
         - 列 5: 冷却频控限制（`InputNumber` 步长 1s，范围 0~300s，0 表示无冷却限制）
         - 列 6: 专属参数约束（针对特定指令如空调、点火、座椅加热，提供参数范围设置抽屉/模态框触发器与参数摘要展示）
       - 底部操作栏：
         - 【一键全部启用】 / 【一键全部禁用】快捷按钮；
         - 【恢复车型出厂默认】按钮；
         - 【模板差异对比】按钮（唤起 `TemplateDiffModal` 直观查看与基线模板的 Diff）；
         - 【保存能力配置】主按钮（带 Loading 态与成功 Toast 提醒）。
     - `CloneTemplateModal`：支持从当前模板复制配置并绑定至尚未配置模板的车型。
     - `ParamConstraintModal`：针对 `AC_START`、`START_ENGINE`、`SEAT_HEAT` 等指令的专属参数上下限配置对话框。
4. `apps/web/src/views/command/index.ts`：
   - 统一导出 `CapabilityTemplateView`、`capability-core.ts` 工具函数。
5. `apps/web/src/router/routes.ts`：
   - 注册 `RoutePath.CAPABILITIES = '/capabilities'`，配置 `hideInMenu: true`，确保 `getMenuRoutes().length === 14` 契约不变。
6. `apps/web/src/layouts/AdminLayout.tsx`：
   - 路由挂载 `RoutePath.CAPABILITIES` -> `<CapabilityTemplateView />`。
7. `apps/web/src/views/command/CarControlWorkbench.tsx`：
   - 在顶部操作栏增加【车型能力模板配置】按钮，点击调用 `nav.openTab({ key: RoutePath.CAPABILITIES, title: '车型能力模板配置' })`。
8. `apps/web/src/test/capability-template.test.ts`：
   - TDD 全量单元测试套件：覆盖参数 Schema 校验、超时/频控边界校验、统计指标聚合、模板克隆与 Diff 算法、API 客户端及离线内存降级。

---

## 3. 验收与质量门禁 (Gate Constraints)
- **CSS 变量与 AntD 6 原生规范**：严禁使用已弃用的 `bodyStyle`，统一采用 `styles={{ body: ... }}`。
- **14 条主菜单路由恒定**：`RoutePath.CAPABILITIES` 必须标记 `hideInMenu: true`，确保现有全部菜单路由断言 100% 稳定通过。
- **全量门禁检查**：
  - `pnpm --filter @car-control/web test` 100% 通过（新增测试用例不少于 20 项）；
  - `pnpm --filter @car-control/web build` Vite 8 Rolldown 0 错误编译通过。
