# Sprint 3 Task 3 Report: 车型能力模板配置中心 (`CapabilityTemplateView.tsx`)

## 1. 任务概述与交付状态
- **任务编号**：Sprint 3 Task 3
- **状态**：✅ 100% 完成
- **提交哈希**：`d3235a27317d45c2ef03dd8eb0656e9eab5d8b44`
- **一句话总结**：实现车型能力模板配置中心 (`CapabilityTemplateView.tsx`)、纯领域模型与校验核算器 (`capability-core.ts`)、离线降级 API 客户端 (`api/capability.ts`)，并无缝集成路由挂载与车控工作台联动。

---

## 2. 变更文件清单

| 文件路径 | 变更类型 | 说明 |
|---|---|---|
| `apps/web/src/views/command/capability-core.ts` | 新建 | 4 大功能集群枚举、单项能力规则 `CapabilityRule`、车型模板 DTO、超时与频控校验纯函数、参数 Schema 约束校验、模板聚合指标统计 `calculateTemplateStats`、差异比对纯函数 `diffCapabilityTemplates`、深度克隆 `cloneModelTemplate` 与 3 款高保真生产种子模板 |
| `apps/web/src/api/capability.ts` | 新建 | 模板获取、按车型查询、更新、创建与克隆 API，严格保留真实服务端 `ApiError` 并提供离线/Mock 内存降级池同步 |
| `apps/web/src/views/command/CapabilityTemplateView.tsx` | 新建 | 响应式主视图（科技深蓝、Ant Design 6 纯 CSS 变量、`styles={{ body: ... }}`）：4 大统计 KPI 卡片、Master 车型模板列表、Detail 能力矩阵配置表格、批量启用/禁用/恢复默认、`CloneTemplateModal`、`ParamConstraintModal`、`TemplateDiffModal` |
| `apps/web/src/views/command/index.ts` | 修改 | 统一导出 `CapabilityTemplateView` 及 `capability-core.ts` 纯函数与类型 |
| `apps/web/src/router/routes.ts` | 修改 | 注册 `RoutePath.CAPABILITIES = '/capabilities'`，配置 `hideInMenu: true`，严格保证 `getMenuRoutes().length === 14` 契约不变 |
| `apps/web/src/layouts/AdminLayout.tsx` | 修改 | 路由组件挂载 `RoutePath.CAPABILITIES` -> `<CapabilityTemplateView />` |
| `apps/web/src/views/command/CarControlWorkbench.tsx` | 修改 | 顶部操作栏增加【车型能力配置】跳转按钮，联动打开多标签页 |
| `apps/web/src/test/capability-template.test.ts` | 新建 | TDD 全量单元测试套件（32 个测试用例，12 个测试集，100% 通过） |

---

## 3. 验收门禁与测试执行详情

### 3.1 单元测试套件 (`pnpm --filter @car-control/web test`)
全量 237 个单元测试 100% 通过（新增 32 个用例全部绿灯通过）：
```
▶ Model Capability Template Center Core & TDD Test Suite
  ▶ 1. Command Category Definitions & Metadata Mapping
    ✔ defines all 4 core business command categories
    ✔ maps all 13 CommandCodes exactly once without duplication or omission
    ✔ correctly maps specific command codes to their intended categories
  ▶ 2. Parameter Validation Pure Functions
    ▶ validateTimeoutMs
      ✔ accepts integer timeout between 3,000ms and 60,000ms
      ✔ rejects values below 3,000ms
      ✔ rejects values above 60,000ms
      ✔ rejects floats, NaN, and non-number inputs
    ▶ validateFrequencyLimit
      ✔ accepts frequency limit between 0s and 300s
      ✔ rejects negative limits
      ✔ rejects limits exceeding 300 seconds
      ✔ rejects non-integer and invalid numbers
    ▶ validateParamConstraints
      ✔ validates AC_START temperature ranges and mode configurations
      ✔ validates ENGINE_START remote duration constraints
      ✔ validates SEAT_HEAT heating levels and position constraints
      ✔ allows empty or undefined constraints for commands without required schema
  ▶ 3. Template Statistics Calculation (calculateTemplateStats)
    ✔ accurately computes summary metrics for seed templates
    ✔ safely handles empty templates array without NaN or division by zero
  ▶ 4. Template Diffing Pure Function (diffCapabilityTemplates)
    ✔ returns no differences when comparing a template with itself
    ✔ identifies differences in supported status, timeout, security level, and param constraints
  ▶ 5. Template Cloning Pure Function (cloneModelTemplate)
    ✔ deep clones capabilities to a new instance with independent references
  ▶ 6. Production Seed Templates Integrity
    ✔ provides EV flagship template with 13/13 supported and custom constraints
    ✔ provides ICE economy template with 9/13 supported and L2 engine start
    ✔ provides PHEV SUV template with 12/13 supported
  ▶ 7. API Client & In-Memory Offline State Synchronization
    ✔ fetchCapabilityTemplatesApi returns all templates in offline fallback
    ✔ fetchCapabilityTemplateByModelApi finds template by modelId or returns null
    ✔ updateCapabilityTemplateApi updates capabilities and persists in memory
    ✔ createCapabilityTemplateApi creates a new template and adds to list
    ✔ cloneCapabilityTemplateApi clones existing template and registers into pool
    ✔ re-throws server ApiError without swallowing it
    ✔ throws error when cloning from non-existent template
    ✔ throws error when updating non-existent template in memory fallback
  ▶ 8. Route Registration & 14-Menu Constant Invariance
    ✔ registers RoutePath.CAPABILITIES = "/capabilities" with hideInMenu = true
```

### 3.2 编译与打包门禁 (`pnpm --filter @car-control/web build`)
- TypeScript 类型检查：0 errors
- Vite 8 Rolldown 生产打包：0 warnings, 0 errors, 构建耗时 708ms

---

## 4. 关键架构设计与质量守则
1. **Ant Design 6 样式与 CSS 变量规范**：所有 `Card` 容器均使用 `styles={{ body: ... }}`，杜绝废弃的 `bodyStyle`。
2. **路由恒定契约**：`RoutePath.CAPABILITIES` 设置 `hideInMenu: true`，主菜单数量严格保持在 14 个，通过了完整的菜单与面包屑断言测试。
3. **Node.js strip-types 兼容性**：枚举采用 `as const` 对象及衍生类型模式，完全消除 strip-types 模式下的语法异常。
4. **强异常隔离**：API 客户端使用 `isApiError` 模式安全透传真实服务端校验异常，在离线降级下更新内存克隆池，保障演示与独立开发高保真可用。

---

## 5. 潜在关注与后续建议
- 当前 `CarControlWorkbench` 从 `fetchVehicleCapabilitiesApi` 加载车辆对应的有效能力，未来可在车型模板发生保存变更后，通过事件总线或 WebSocket 通知工作台自动热重载车型生效能力。
