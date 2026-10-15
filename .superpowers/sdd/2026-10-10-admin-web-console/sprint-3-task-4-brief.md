# Sprint 3 Task 4 Brief: 单车专属可控范围覆盖抽屉 (`VehicleOverrideDrawer.tsx`)

## 1. 任务背景与核心业务场景
在大型车队运营、车辆试乘试驾、VIP 专属服务或故障排查等场景下，单辆车可能需要突破或限制其出厂车型能力模板的默认控车权限：
- **测试/限制车辆**：某测试车辆即便车型支持远程点火，但调度员需要在系统层单车禁用 `START_ENGINE`，防止未授权发动；
- **VIP/应急车辆**：针对特定专用车，将指令冷却频控从 10 秒缩减至 0 秒，并将超时阈值延长；
- **临时故障隔离**：某车辆天窗电机出现硬件故障，临时单车禁用 `SUNROOF_CONTROL`，避免司机误触发导致电机烧毁。

在后端的能力继承管道中，**单车能力覆盖 (`VehicleCapabilityOverride`) 处于最高优先级**（管道：Global Definition -> Model Template -> Project Override -> Vehicle Override）。

本任务需交付 **单车专属可控范围配置抽屉 (`VehicleOverrideDrawer.tsx`)**：
支持车队调度员或管理员在车辆列表或车控工作台，一键滑出抽屉，直观对比当前车辆的【基准车型模板能力】与【单车自定义覆盖规则】，支持逐项指令切换“继承模板”或“独立覆盖”，并能一键重置与全量审计。

---

## 2. 交付文件清单

1. `apps/web/src/views/command/vehicle-override-core.ts`：
   - 纯领域模型、函数、Schema 定义与测试种子：
     - 单车覆盖数据结构 `VehicleCapabilityOverrideDto`:
       ```ts
       export interface VehicleCapabilityOverrideDto {
         id: string;
         vehicleId: string;
         vin: string;
         plateNumber: string;
         modelId: string;
         updatedAt: string;
         updatedBy?: string;
         overrides: Partial<Record<CommandCode, CapabilityRule>>;
       }
       ```
     - 单车能力项生效状态模型 `VehicleEffectiveCommandItem`:
       ```ts
       export interface VehicleEffectiveCommandItem {
         commandCode: CommandCode;
         category: CommandCategory;
         isOverridden: boolean; // 是否启用了单车专属覆盖
         effectiveRule: CapabilityRule; // 当前生效的规则 (若覆盖取覆盖值，否则取车型模板值)
         templateRule: CapabilityRule;  // 基础车型模板的默认规则
         differsFromTemplate: boolean;  // 覆盖值是否与车型模板存在实际属性差异
         overrideReason?: string;       // 单车覆盖原因/备注说明
       }
       ```
     - 纯核算与比对函数：
       - `resolveVehicleEffectiveList(template: ModelTemplateDto, override?: VehicleCapabilityOverrideDto | null): VehicleEffectiveCommandItem[]`: 计算 13 类指令的最终生效规则与差异比对
       - `calculateOverrideSummary(items: VehicleEffectiveCommandItem[])`: 统计单车覆盖项总数、实际产生差异项数、禁用指令数、L2 门禁重载数
       - `cleanRedundantOverrides(overrides: Partial<Record<CommandCode, CapabilityRule>>, template: ModelTemplateDto)`: 清理与车型模板完全一致的冗余覆盖项，优化存储与传输
     - 高保真种子覆盖数据 `SEED_VEHICLE_OVERRIDES`:
       - 典型测试车辆 (禁用点火与车窗升降，带有覆盖原因)
       - 典型运营车辆 (默认全部继承模板无覆盖)
2. `apps/web/src/api/vehicle-override.ts` (或在 `api/capability.ts` 扩展并独立导出)：
   - `fetchVehicleOverrideApi(vehicleId: string): Promise<VehicleCapabilityOverrideDto | null>`
   - `saveVehicleOverrideApi(vehicleId: string, overrides: Partial<Record<CommandCode, CapabilityRule>>, reason?: string): Promise<VehicleCapabilityOverrideDto>`
   - `resetVehicleOverrideApi(vehicleId: string): Promise<boolean>` (清空单车覆盖，完全回归继承车型模板)
   - 严格遵循 `isApiError` 模式：透传真实服务端异常，在离线/Mock 降级下安全修改内存种子池。
3. `apps/web/src/views/command/VehicleOverrideDrawer.tsx`：
   - 720px 右侧滑出抽屉（支持 `destroyOnClose`、Ant Design 6 纯原生 CSS 变量、`styles={{ body: ... }}`）：
     - **抽屉头部**: 车牌号 Tag、VIN 码 Monospace（支持一键复制）、所属车型名称与 0x02 协议 Badge、动力类型 Tag (EV/PHEV/ICE/REEV)；
     - **覆盖状态 KPI 摘要条 (Alert / Ribbon)**:
       - 提示："当前车辆已配置 X 项专属覆盖规则，Y 项与车型模板产生差异"，或绿色提示："当前车辆完全继承车型默认模板，未配置专属覆盖"；
     - **能力覆盖对照矩阵表格 (`Table`)**:
       - 列 1: 指令分类与名称（分类 Badge + 图标 + 代码 Monospace）
       - 列 2: 模式切换（`Radio.Group` 或 `Switch`: 【继承车型】 vs 【专属覆盖】）
       - 列 3: 生效控车状态（`Switch` 允许控车 / 禁止控车，继承时置灰只读并标明【来自模板】）
       - 列 4: 安全等级（`Select` L0 / L1 / L2，被覆盖且与模板不一致时展示黄色【差异】Tag）
       - 列 5: 响应超时（`InputNumber` 3,000~60,000ms）
       - 列 6: 频控冷却（`InputNumber` 0~300s）
       - 列 7: 覆盖操作与参数（支持还原单项为继承、配置专属参数约束）
     - **底部全局操作栏**:
       - 【全部重置为继承车型模板】按钮（Popconfirm 二次确认）
       - 【取消】与【保存单车覆盖】主按钮（带 Loading 态与成功 Toast 提醒）
4. 业务联动入口接入：
   - `apps/web/src/views/vehicle/VehicleListView.tsx`：
     - 在车辆操作列增加【能力覆盖】操作按钮，点击即唤起 `VehicleOverrideDrawer`；
   - `apps/web/src/views/command/CarControlWorkbench.tsx`：
     - 在顶部车辆卡片操作区域增加【专属能力覆盖】按钮，快速查看或修改当前选定车辆的能力覆盖；
5. `apps/web/src/views/command/index.ts`：
   - 导出 `VehicleOverrideDrawer` 及 `vehicle-override-core.ts` 纯函数。
6. `apps/web/src/test/vehicle-override.test.ts`：
   - TDD 全量单元测试套件：覆盖有效能力解析算法、继承与覆盖状态切换、冗余项清理、统计指标核算、API 客户端及离线内存状态双向同步。

---

## 3. 验收与质量门禁 (Gate Constraints)
- **CSS 变量与 AntD 6 原生规范**：全部使用纯原生 CSS 变量，Card 采用 `styles={{ body: ... }}`。
- **保护主菜单路由恒定**：保持主菜单 14 条路由不变。
- **全量门禁检查**：
  - `pnpm --filter @car-control/web test` 100% 通过（新增测试用例不少于 20 项）；
  - `pnpm --filter @car-control/web build` Vite 8 Rolldown 0 错误编译通过。
