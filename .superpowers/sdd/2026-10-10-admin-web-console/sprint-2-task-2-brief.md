# Sprint 2 Task 2 Brief: 批量设备导入向导 (`BatchImportModal.tsx` + `excel-import-core.ts` + 批量导入 API 集成)

## 1. 任务背景与目标
基于《手机控车平台功能清单.docx》模块 04（4.1 设备建档与批量导入）、《开发计划-V2.1》与《docs/design/page-specs/device-management.md》3.2节，在 `apps/web` 中交付 3 步向导式批量设备导入中心。包含标准 CSV 模板生成与下载、前端行级预校验、批内查重、租户配额硬约束拦截、`POST /api/v1/devices/batch-import` 调用、以及导入结果与失败清单一键导出。

## 2. 详细功能与交互规范

### A. 核心纯逻辑与预校验引擎 (`apps/web/src/views/device/excel-import-core.ts`)
1. **标准模板生成器 (`generateDeviceImportTemplate`)**：
   - 生成带 `\uFEFF` UTF-8 BOM 的标准 CSV 字符串；
   - 表头包含：`设备编号(必填),IMEI(必填15位),硬件型号ProductKey(必填),归属项目ID(选填),ICCID(选填20位)`；
   - 内置 2 行规范示范数据（如 `DEV_SZ_001,868123045678901,TBOX-G4-STD,proj-sz-01,89860401123456789001`）。
2. **预校验解析引擎 (`parseDeviceImportCsv`)**：
   - 解析入参 CSV 内容（支持 RFC 4180 引号包裹与换行）；
   - 批次上限硬门禁：单批次超过 1,000 行立即抛出或标记为超限 (`maxRowsExceeded: true`)；
   - 逐行校验：
     - `deviceNo` 非空，长度 3~32 位；
     - `imei` 严格 15 位全数字正则校验；
     - `productKey` 非空且在有效产品型号范围内；
     - `iccid` 若填写，校验 19~20 位字母数字规范；
   - 批内重复检测：批次内出现重复 `deviceNo` 或 `imei` 时，记录重复原因；
   - 租户配额预检：根据传入的当前已用数与总配额计算 `remainingQuota`。若待导入有效行数超过 `remainingQuota`，设置 `isQuotaExceeded: true` 并计算超限台数；
   - 输出结构化 `ImportValidationResult`：
     `{ totalRows, validItems, invalidRows, duplicateCount, isQuotaExceeded, quotaRequired, quotaAvailable }`。
3. **失败跳过清单导出 (`generateSkippedErrorsCsv`)**：
   - 汇总导入失败或被跳过的行（包含行号、设备编号、IMEI、失败/跳过原因），生成带 UTF-8 BOM 的 CSV 文本以供下载。

### B. 批量导入向导模态框 (`apps/web/src/views/device/BatchImportModal.tsx`)
1. **3 步骤条流程 (`Steps`)**：
   - **Step 1: 下载模板 (Download Template)**：
     - 导入说明提示：单批次最大支持 1,000 台，IMEI 必须为 15 位数字，必填项说明；
     - `📥 下载标准导入模板 (.csv)` 按钮，触发浏览器下载；
     - “下一步：上传文件” 按钮。
   - **Step 2: 拖拽上传与预检 (Upload & Pre-validate)**：
     - `Upload.Dragger` 区域，支持点击或拖拽 `.csv` 文件；
     - 前端秒级预检：展示预检结果卡片（总数据行数、有效记录数、格式错误数、重复数）；
     - **配额超限阻断**：若 `isQuotaExceeded`，高亮红色 Alert 提示：“当前待导入 X 台超过租户剩余配额 Y 台，请删减数据或联系管理员扩容”，并禁用“开始导入”按钮；
     - 若有错误行，在下方以简易 Table 展开展示错误行号与具体错误原因；
     - “上一步”与“开始导入 (Primary)”按钮。
   - **Step 3: 导入执行与结果反馈 (Execute & Result)**：
     - 调用 `batchImportDevicesApi`，展示执行中动画/进度条；
     - 导入结果展示：
       - 成功提示："批量导入完成！成功导入 X 台，跳过/失败 Y 台"；
       - 若有跳过/失败项，展示 `📥 导出错误清单 CSV` 按钮；
       - “完成并关闭”按钮，重置向导状态，关闭 Modal 并触发父级刷新。

### C. 数据分层与 API 抽象 (`apps/web/src/api/device.ts`)
- 增加 `batchImportDevicesApi(devices: CreateDeviceInput[])`:
  - 调用 `POST /api/v1/devices/batch-import`；
  - 遵循 `isApiError` 模式：真实业务异常（400/409/403）抛出并提示，离线环境在内存池中安全批量写入并返回 `{ total, successCount, errors }`。

### D. `DeviceListView.tsx` 页面集成
- 顶部筛选栏中的 `📥 批量导入` 按钮绑定打开 `BatchImportModal`；
- 导入完成后自动回调 `loadData()` 刷新设备列表与顶部配额指标。

### E. 自动化测试要求 (`apps/web/src/test/batch-import.test.ts`)
1. 模板生成器格式与表头完整性断言；
2. 正常 CSV 文本多行逐项解析断言；
3. IMEI 格式错误逐行拦截断言；
4. 批内自身重复 IMEI / 设备号拦截断言；
5. 超过 1000 行单批硬门禁拦截；
6. 超过租户剩余配额硬门禁拦截；
7. 失败跳过清单 CSV 导出格式断言；
8. `batchImportDevicesApi` 客户端调用断言。

### F. 编译与构建门禁
- `pnpm --filter @car-control/web test` 100% 通过；
- `pnpm --filter @car-control/web build` Vite 8 / Rolldown 0 报错通过。
