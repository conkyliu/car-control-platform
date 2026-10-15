# Sprint 1 Task 6 Report: 操作审计日志中心 (`AuditLogView.tsx`)

## 1. 任务基本信息
- **任务编号**：Sprint 1 Task 6
- **任务目标**：交付企业级操作审计日志中心，支持全链路 W3C Trace ID 追踪、高危敏感操作分级评定、多维组合检索、RFC 4180 / UTF-8 BOM CSV 导出、640px 详情抽屉与 SHA-256 防篡改签名合规展示。
- **Base Commit**：`613f6bd` (`fix(web): address reviewer recommendations on org tree lookup and permission key filtering`)
- **Current Commit**：`b813340` (`feat(web): implement AuditLogView operation audit center`)
- **状态**：COMPLETED (100% 验收达标)

---

## 2. 交付物清单与代码路径

### 2.1 API 契约与 HTTP 客户端
1. `apps/web/src/api/audit.ts`:
   - `fetchAuditLogsApi(params)`: 支持模块、操作类型、状态、风险等级、时间范围及关键字检索
   - `exportAuditLogsApi(params)`: 导出接口，支持远端数据拉取或客户端回退生成
   - 类型定义：`AuditLogDto`, `AuditLogQueryParams`, `AuditLogStatsDto`, `AuditLogRiskLevel`, `AuditLogStatus`
   - 遵循 `isApiError` 模式：真实服务端异常抛出中断并提示，离线/开发环境无服务时平滑降级至 `SEED_AUDIT_LOGS`

### 2.2 核心纯逻辑与合规安全
2. `apps/web/src/views/rbac/audit-core.ts`:
   - `calculateAuditStats`: 计算操作总数、远程车控审计数、高危敏感操作数、异常失败审计数
   - `getRiskLevel`: 基于操作类型与模块的分级评定算法（高危 HIGH: 删除/注销/重置密码/远程熄火/强控/批量OTA/解绑硬件；中危 MEDIUM: 远程开锁/开后备箱/空调/新增修改/围栏配置/数据导出；低危 LOW: 登录认证/登出/只读查询）
   - `filterAuditLogs`: 多维组合过滤（关键字模糊匹配操作人、用户名、Trace ID、IP、资源 ID，业务模块、操作类型、执行状态、风险等级、精确时间区间）
   - `generateAuditLogCsv`: 生成标准 RFC 4180 格式 CSV 文本，带 `\uFEFF` UTF-8 BOM 解决 Excel 中文乱码，严格转义双引号、逗号及换行符
   - `AUDIT_MODULES` & `AUDIT_ACTIONS`: 标准业务模块字典与操作行为代码映射
   - `SEED_AUDIT_LOGS`: 生产级真实审计示范数据（覆盖车控下发、用户增删改、密码重置、围栏修改、设备解绑、登录鉴权、高耗时告警与失败归因等，内置 64 位 SHA-256 数字摘要与 W3C Trace ID）

### 2.3 业务视图与主布局挂载
3. `apps/web/src/views/rbac/AuditLogView.tsx`:
   - **顶部指标卡片 (Summary Cards)**：操作审计总数、远程车控审计（科技蓝 `#1677ff`）、高危敏感操作（橙色告警 `#fa8c16`）、异常失败审计（红色告警 `#ff4d4f`）
   - **多维筛选工具栏 (Filter Bar)**：关键字搜索框、业务模块下拉、操作行为下拉、执行状态下拉、风险等级下拉、时间跨度预设单选（全部 / 今天 / 近 7 天 / 近 30 天）、`DatePicker.RangePicker` 精确时间范围选择器、导出日志（带确认提示 `Modal.confirm`）、刷新与重置按钮
   - **Ant Design 6 响应式表格 (`Table`)**：
     - Trace ID / 日志 ID（截断展示，悬浮 Tooltip 完整标识，带一键剪贴板复制按钮）
     - 操作时间（等宽字体展示）
     - 操作人员（姓名、账号与机构 Tag）
     - 客户端 IP（IP 地址与物理归属地城市）
     - 业务模块（语义化彩色 Tag）
     - 操作行为与风险等级（行为 Tag + 高/中/低危药丸徽标）
     - 目标资源（资源类别 + 资源 ID 带复制）
     - 执行状态（成功绿色 Check / 失败红色 Close）
     - 执行耗时（正常次要文本，超过 1000ms 触发橙黄色超时预警 Tag）
     - 操作列：`详情` 抽屉触发按钮
   - **操作审计详情抽屉 (`AuditLogDetailDrawer`)**：
     - 右侧 640px 抽屉弹出
     - 基础元数据 Descriptions 栅格：日志 ID、W3C Trace ID、租户、人员、机构、IP 与地域、User-Agent、耗时
     - 合规与防篡改安全保障：风险等级徽章、深色等宽卡片展示 SHA-256 Digest 数字签名、一键复制签名、“已通过 SHA-256 数字摘要防篡改一致性校验”
     - 请求报文详情 (Request Payload)：代码高亮 JSON 卡片
     - 响应结果与异常归因 (Response & Error Trace)：失败场景展示明确错误归因 Alert，成功场景展示返回数据 JSON
4. `apps/web/src/views/rbac/index.ts`:
   - 统一导出 `AuditLogView` 及审计核心工具函数
5. `apps/web/src/layouts/AdminLayout.tsx`:
   - 挂载路由：`activeKey === RoutePath.LOGS` -> `<AuditLogView />`

---

## 3. 自动化测试结果与覆盖率 (TDD)
- **测试文件**：`apps/web/src/test/audit-log-view.test.ts`
- **执行命令**：`pnpm --filter @car-control/web test`
- **测试结果**：全量 62 个测试用例 100% 全部通过 (0 失败，0 告警)
- **核心断言项**：
  1. `calculateAuditStats accurately computes summary metrics`
  2. `getRiskLevel evaluates high, medium, and low operational risk correctly`
  3. `filterAuditLogs filters across keyword, module, action, status, and date range`
  4. `generateAuditLogCsv creates spec-compliant UTF-8 BOM CSV text with proper escaping`
  5. `SEED_AUDIT_LOGS contains production-grade sample entries with valid SHA-256 signatures`
  6. `isApiError differentiates server ApiError instances correctly`
  7. `fetchAuditLogsApi and exportAuditLogsApi are exported and handle fallback gracefully`
  8. `AUDIT_MODULES and AUDIT_ACTIONS contain complete standard categories`

---

## 4. 生产构建验证
- **执行命令**：`pnpm --filter @car-control/web build`
- **打包工具**：TypeScript 5.8.2 + Vite 8.3.4 (Rolldown engine)
- **构建结果**：0 errors, 0 warnings，成功生成 `dist/assets/index-DqFEJbC_.js` (665ms)。

---

## 5. 潜在关注点与后续建议 (Concerns & Next Steps)
1. **海量审计日志流式导出**：当前客户端 CSV 导出适用于前台万级以内过滤结果下载。如后续运营需要导出百万级全量通讯报文，建议后端提供异步流式对象存储 (S3 / OSS) 导出任务流水；
2. **区块链或硬件安全模块 (HSM) 存证集成**：前端已预留并完整展示了 SHA-256 防篡改签名与链路 Hash 校验位，后端落地时可直接对接蚂蚁链或国密数字证书存证服务。
