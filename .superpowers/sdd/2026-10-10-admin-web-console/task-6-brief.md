# Sprint 1 Task 6 Brief: 操作审计日志中心 (`AuditLogView.tsx`)

## 1. 任务背景与目标
基于《手机控车平台功能清单.docx》模块 03（3.4 操作审计）、模块 19（19.1~19.8 日志追溯）、《开发计划-V2.1》与《docs/product/requirements-map.md》，在 `apps/web` 中交付企业级操作审计日志中心，支持全链路 Trace ID 追踪、高危敏感操作标记、多维检索、详情抽屉与防篡改签名展示。

## 2. 详细功能与交互规范

### A. 业务模块与视图结构 (`apps/web/src/views/rbac/AuditLogView.tsx`)
1. **顶部指标概览卡片 (Summary Cards)**：
   - 今日操作总数 (Total Operations)
   - 远程车控审计数 (Vehicle Control Audits，科技蓝)
   - 高危敏感操作数 (High-Risk Operations，橙色警告，如删除/改密/强控)
   - 异常失败审计数 (Failed Operations，红色告警)
2. **多维筛选工具栏 (Filter Bar)**：
   - 关键字搜索（操作人 / Trace ID / 客户端 IP / 目标资源 ID 模糊检索）
   - 业务模块筛选（用户权限 / 车辆资产 / 远程车控 / 固件升级 / 电子围栏 / 租户配置）
   - 操作类型筛选（登录认证 / 新增 / 修改 / 执行指令 / 删除注销 / 数据导出）
   - 执行状态筛选（全部 / 成功 / 失败）
   - 时间跨度筛选（`DatePicker.RangePicker`，支持预设：今天、近 7 天、近 30 天）
   - `导出日志` 按钮（带确认提示，客户端生成并下载 CSV）
   - `刷新` 按钮
3. **操作审计表格 (`Ant Design 6 Table`)**：
   - 列定义：
     - Trace ID / 日志 ID（展示前8位，带复制按钮与悬浮 Tooltip）
     - 操作时间（格式化为 `YYYY-MM-DD HH:mm:ss`）
     - 操作人员（操作员姓名/账号 + 机构名称）
     - 客户端 IP（如 `192.168.1.100` 及城市归属地）
     - 业务模块（Tag 渲染）
     - 操作行为与风险等级（Tag 标识操作类型，并附带高/中/低危 Badge）
     - 目标资源（资源类型 + 资源标识，如 `Vehicle: VIN...`）
     - 状态（成功 绿色 Tag / 失败 红色 Tag）
     - 执行耗时（如 `42ms`，超过 1000ms 标橙提示）
     - 操作列：`详情` 按钮（触发抽屉）
4. **审计详情抽屉 (`AuditLogDetailDrawer`)**：
   - 右侧滑出抽屉（宽度 640px）：
     - 基础信息：日志 ID、W3C Trace ID、租户标识、操作人员、IP 与 User-Agent、耗时
     - 合规与安全：风险等级评估、防篡改哈希签名 (SHA-256 Digest)
     - 请求报文详情 (Request Payload)：格式化 JSON 卡片展示入参
     - 响应结果 / 异常归因 (Response & Error Trace)：状态码、返回结果或失败异常原因

### B. 数据分层与 API 抽象
1. `apps/web/src/api/audit.ts`:
   - `fetchAuditLogsApi(params)`: 支持模块、操作类型、状态、关键字与分页/时间范围查询
   - `exportAuditLogsApi(params)`: 导出接口
   - 遵循 `isApiError` 模式：真实服务端异常中断并提示，离线/开发环境无服务时平滑降级至 `SEED_AUDIT_LOGS`
2. `apps/web/src/views/rbac/audit-core.ts`:
   - 纯函数集合：
     - `calculateAuditStats`: 计算总量、车控量、高危量、失败量
     - `filterAuditLogs`: 多维组合过滤与时间范围筛选
     - `getRiskLevel`: 根据 action 与 module 判定风险等级 (HIGH, MEDIUM, LOW)
     - `generateAuditLogCsv`: 将日志集合转换为 UTF-8 BOM CSV 文本并支持下载
     - `SEED_AUDIT_LOGS`: 生产级真实审计示范数据（覆盖车控下发、用户增删改、密码重置、围栏修改等）

### C. 路由与主布局挂载
1. 在 `apps/web/src/views/rbac/index.ts` 导出 `AuditLogView`。
2. 在 `apps/web/src/layouts/AdminLayout.tsx` 中挂载：
   - `activeKey === RoutePath.LOGS` -> `<AuditLogView />`

### D. 自动化测试要求 (`apps/web/src/test/audit-log-view.test.ts`)
1. 审计统计指标纯逻辑计算测试；
2. 多维组合过滤（关键字、模块、操作类型、状态、时间范围）测试；
3. 风险等级判定规则测试；
4. CSV 导出字符串生成测试（表头字段完整、特殊字符转义、包含 BOM）；
5. API 客户端导出方法存在性与基础调用断言。

### E. 编译与构建门禁
- `pnpm --filter @car-control/web test` 100% 通过；
- `pnpm --filter @car-control/web build` Vite 8 / Rolldown 0 报错通过。
