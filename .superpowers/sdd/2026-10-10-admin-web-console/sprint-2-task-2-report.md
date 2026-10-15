# Sprint 2 Task 2 Report: 批量设备导入向导 (`BatchImportModal.tsx` + `excel-import-core.ts` + 批量导入 API 集成)

## 1. 任务基本信息
- **任务编号**：Sprint 2 Task 2
- **任务目标**：基于《手机控车平台功能清单.docx》模块 04（4.1 设备建档与批量导入）与《docs/design/page-specs/device-management.md》3.2 节，交付 3 步向导式批量设备导入中心。包含标准 CSV 模板生成与下载、前端行级预校验、批内查重、租户配额硬约束拦截、`POST /api/v1/devices/batch-import` 调用、以及导入结果与失败清单一键导出。
- **Base Commit**：`b07322c` (`fix(web): address reviewer feedback on device status transition defense and dynamic tenant quota`)
- **Current Commit**：`f40c186` (`feat(web): implement BatchImportModal wizard and CSV pre-validation engine`)
- **状态**：COMPLETED (100% 验收通过)

---

## 2. 交付物清单与代码路径

### 2.1 批量导入纯逻辑与预校验引擎
1. `apps/web/src/views/device/excel-import-core.ts`:
   - `generateDeviceImportTemplate()`: 生成带有 `\uFEFF` UTF-8 BOM 的标准 CSV 字符串，表头为 `设备编号(必填),IMEI(必填15位),硬件型号ProductKey(必填),归属项目ID(选填),ICCID(选填20位)`，内置 2 行真实示范数据。
   - `parseCsvRows(content)`: RFC 4180 标准 CSV 解析器，支持双引号包裹、逗号、转义双引号 `""`、以及 `\r\n` / `\n` 跨行解析，自动过滤全空白无效行。
   - `parseDeviceImportCsv(content, options)`:
     - 批次上限硬门禁：单批次超过 1,000 行标记为 `maxRowsExceeded: true`。
     - 行级规范校验：
       - `deviceNo` 非空且长度在 3~32 位字符之间；
       - `imei` 严格 15 位全数字正则校验 (`/^\d{15}$/`)；
       - `productKey` 非空且在有效型号列表内 (`TBOX-G4-STD`, `TBOX-G5-PRO`, `OBD-II-PLUS`, `TCU-EV-100`)；
       - `iccid` 选填，若填写严格校验 19~20 位字母数字规范；
       - `projectId` 选填，缺省时自动回退为默认项目。
     - 批内去重：检测批次内出现重复的 `deviceNo` 或 `imei`，记录详细重复原因并累计 `duplicateCount`。
     - 租户配额预检：根据传入的 `remainingQuota` 比对有效待导入设备数，若超限标记 `isQuotaExceeded: true`，记录 `quotaRequired` 与 `quotaAvailable`。
     - 输出结构化 `ImportValidationResult`。
   - `generateSkippedErrorsCsv(errors)`: 汇总导入失败或被跳过的行（包含行号、设备编号、IMEI、失败原因），生成带有 UTF-8 BOM 的 CSV 文本以供下载。
   - `escapeCsvCell(val)`: CSV 单元格转义与公式注入防御（对以 `=`, `+`, `-`, `@`, `\t`, `\r` 开头的恶意公式值前置单引号转义，转义双引号与包含逗号换行字段）。

### 2.2 数据分层与 API 抽象
2. `apps/web/src/api/device.ts`:
   - `batchImportDevicesApi(devices: CreateDeviceInput[])`:
     - 发起 `POST /devices/batch-import` (对应 NestJS `@Post('batch-import')`)。
     - 遵循 `isApiError` 模式：真实后端业务异常（400/409/403）抛出并提示；离线/开发环境在内存状态池中安全批量写入，具备内存池排重防护，返回 `{ total, successCount, errors }`。
   - 类型导出：`BatchImportResultDto`, `BatchImportErrorItem`。

### 2.3 批量导入向导模态框
3. `apps/web/src/views/device/BatchImportModal.tsx`:
   - 基于 Ant Design 6 `Steps` 实现 3 步向导式体验：
     - **Step 1: 下载模板**：展示单批次 1,000 台、IMEI 15位等规范指引；提供 `📥 下载标准导入模板 (.csv)` 按钮一键下载 UTF-8 BOM 模板；提供“下一步：上传文件”跳转。
     - **Step 2: 拖拽上传与预检**：
       - `Upload.Dragger` 区域，支持选择或拖拽 `.csv` 文件，使用 `FileReader` 在客户端进行秒级全量语法校验。
       - 预检卡片实时展示：总数据行数、有效记录数、格式错误行、批内重复项。
       - **硬门禁阻断告警**：
         - 若 `maxRowsExceeded`，高亮红色 Alert 提示超出 1,000 行限制并阻断提交；
         - 若 `isQuotaExceeded`，高亮红色 Alert 提示待导入台数超出租户剩余配额并禁用“开始导入”按钮。
       - 格式错误或重复项预览表格：行号、设备编号、IMEI、具体未通过原因。
       - “上一步”与“开始导入”按钮联动。
     - **Step 3: 执行导入与结果反馈**：
       - 执行导入时的 Progress 进度条与过渡动画；
       - Ant Design `Result` 展示导入总结：“成功入库 X 台，跳过/失败 Y 台”；
       - 若存在跳过/失败项，提供 `📥 导出跳过/错误清单 CSV` 按钮一键下载失败清单；
       - “完成并关闭”按钮重置向导并触发外部刷新回调。

### 2.4 页面集成与导出
4. `apps/web/src/views/device/DeviceListView.tsx`:
   - 顶部筛选栏绑定 `📥 批量导入` 按钮打开 `BatchImportModal`。
   - 传入当前租户剩余可用配额 `remainingQuota = Math.max(0, tenantQuota - devices.length)`。
   - 传入 `onSuccess={loadData}` 实现导入后自动刷新设备列表与顶部配额指标卡片。
5. `apps/web/src/views/device/index.ts`:
   - 导出 `BatchImportModal` 及 `excel-import-core.ts` 全部纯函数与类型。

---

## 3. 自动化测试结果 (TDD)
- **测试文件**：`apps/web/src/test/batch-import.test.ts`
- **执行命令**：`pnpm --filter @car-control/web test`

### 测试套件覆盖清单：
1. `generateDeviceImportTemplate generates spec-compliant UTF-8 BOM CSV template with valid headers and sample rows` ✔
2. `parseDeviceImportCsv parses normal multi-row CSV with quoted cells, project defaults, and valid ICCID` ✔
3. `parseDeviceImportCsv intercepts row format errors (IMEI, deviceNo, ProductKey, ICCID) and preserves row index` ✔
4. `parseDeviceImportCsv detects intra-batch duplicate deviceNo and IMEI within the same batch` ✔
5. `parseDeviceImportCsv enforces 1000-row batch hard limit gate` ✔
6. `parseDeviceImportCsv detects tenant remaining quota overflow and blocks` ✔
7. `generateSkippedErrorsCsv exports standard UTF-8 BOM CSV with error reasons and formula injection defense` ✔
8. `batchImportDevicesApi performs batch creation and handles offline fallback with duplicate detection` ✔

- **Web 测试通过率**：80 / 80 tests passed (100%)
- **Monorepo 全量测试**：192 / 192 tests passed (100% across api & web)

---

## 4. 生产构建验证
- **执行命令**：`pnpm --filter @car-control/web build`
- **结果**：`tsc && vite build` 0 错误通过，无类型错误，无编译警告。
