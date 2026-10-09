# Gate 5: OTA 固件升级系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建手机控车平台 Gate 5 OTA 固件升级系统，包括固件版本元数据与 SHA256 校验和管理、车型/项目多维目标筛选、行车熄火与电瓶电压安全前置校验防线、分批并发调度下发、设备端模拟器仿真、断点分片上报闭环与 WebSocket 全链路进度监控。

**Architecture:**
1. 固件元数据与包管理：`FirmwareService` 管理固件包、目标硬件版本、SHA256/MD5 完整性校验和与车型兼容性规则。
2. 升级计划与目标筛选：`OtaPlanService` 支持按车型、项目或白名单设备筛选，计算待升级设备清单。
3. 安全前置检查 (Safety Pre-check)：`OtaSafetyService` 联合车辆状态与遥测数据，强制检查车辆处于熄火状态（Engine Off / ACC Off）且电瓶电压 $\ge 12.0\text{V}$，严禁在行车或亏电状态下刷写固件。
4. 分批调度执行：按 `batchSize` 与 `batchIntervalSec` 流水线下发 MQTT 下行升级指令 `/sys/{PK}/{Dev}/ota/upgrade`。
5. 进度闭环与断点恢复：`OtaProgressService` 消费设备上报的 `/sys/{PK}/{Dev}/ota/progress`，跟踪 `DOWNLOADING` -> `VERIFYING` -> `FLASHING` -> `SUCCESS` / `FAILED` 状态机，并通过 WebSocket 广播实时进度。
6. 模拟器支持：`DeviceSimulator` 订阅 OTA 下行指令，模拟安全校验、下载递增与校验刷写完成闭环。

**Tech Stack:** NestJS 12, TypeScript, PostgreSQL (Prisma 7), Socket.IO (WebSocket), Crypto (SHA256/MD5), MQTT (Aliyun IoT topic convention).

**Spec:** `docs/specs/ota.md`, `ADR-013`, `ADR-014`

## Global Constraints
- 前端禁止直连 MQTT，所有 OTA 指令下发与设备进度闭环统一经 NestJS 服务处理并推送到 WebSocket 房间；
- 安全红线：行车中（Engine ON / ACC ON）与亏电（电压 < 12.0V）严禁升级固件，安全前置校验不通过必须标记 `SKIPPED_UNSAFE`；
- 多租户强隔离防线：所有固件、计划与设备任务必须在 `TenantContext` 作用域内，跨租户查询或操作严格拦截；
- 每次任务编写自动化测试验证，保证 Gate 0 至 Gate 5 验收套件持续 100% 通过。

---

### Task 1: 编写 OTA 领域规范与架构决策文档 (Specs & ADRs)

**Files:**
- Create: `docs/specs/ota.md`
- Create: `docs/adr/ADR-013-ota-firmware-pipeline-and-safety-precheck.md`
- Create: `docs/adr/ADR-014-ota-batch-scheduling-and-resume.md`

- [ ] **Step 1: 创建 `docs/specs/ota.md`**
定义固件元数据模型、升级计划结构、目标设备筛选规则、熄火/电压安全前置检查、MQTT Topic 格式 (`/sys/{PK}/{Dev}/ota/upgrade` 与 `/sys/{PK}/{Dev}/ota/progress`)、OTA 状态机 (`QUEUED` -> `NOTIFIED` -> `DOWNLOADING` -> `VERIFYING` -> `FLASHING` -> `SUCCESS` / `FAILED` / `TIMEOUT`)。

- [ ] **Step 2: 创建 `docs/adr/ADR-013-ota-firmware-pipeline-and-safety-precheck.md`**
记录固件全生命周期流水线与行车安全前置检查决策（为何强制熄火与电压检查，拦截机制与审计标准）。

- [ ] **Step 3: 创建 `docs/adr/ADR-014-ota-batch-scheduling-and-resume.md`**
记录分批并发限流调度与分片断点续传架构决策（防止大并发下载击垮 CDN/服务器带宽，离线与网络抖动断点续接机制）。

- [ ] **Step 4: 提交规范文档**
```bash
git add docs/specs/ota.md docs/adr/ADR-013-ota-firmware-pipeline-and-safety-precheck.md docs/adr/ADR-014-ota-batch-scheduling-and-resume.md
git commit -m "docs(gate-5): add OTA specifications and ADRs"
```

---

### Task 2: 扩展 OTA 共享契约与领域类型 (`packages/contracts` & `packages/domain-types`)

**Files:**
- Create: `packages/contracts/src/ota/ota-payloads.ts`
- Modify: `packages/contracts/src/events/websocket-events.ts`
- Modify: `packages/contracts/src/websocket/ws-events.ts`
- Modify: `packages/contracts/src/mqtt/mqtt-topics.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/domain-types/src/ota.ts`
- Modify: `packages/domain-types/src/index.ts`

**Interfaces:**
- `OtaPlanStatus`: `'DRAFT' | 'SCHEDULED' | 'EXECUTING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED'`
- `OtaTaskStatus`: `'QUEUED' | 'NOTIFIED' | 'DOWNLOADING' | 'VERIFYING' | 'FLASHING' | 'SUCCESS' | 'FAILED' | 'SKIPPED_UNSAFE' | 'TIMEOUT'`
- `OtaStep`: `'DOWNLOADING' | 'VERIFYING' | 'FLASHING' | 'REBOOTING' | 'SUCCESS' | 'FAILED'`
- `FirmwarePackageDto`: `{ id: string, tenantId: string, name: string, version: string, targetModelId: string, hardwareVersion: string, fileUrl: string, fileSizeBytes: number, checksumSha256: string, checksumMd5?: string, description?: string, status: 'ACTIVE' | 'DEPRECATED', createdAt: Date }`
- `CreateFirmwareDto`: `Omit<FirmwarePackageDto, 'id' | 'tenantId' | 'createdAt'>`
- `OtaPlanDto`: `{ id: string, tenantId: string, name: string, firmwareId: string, targetType: 'ALL' | 'MODEL' | 'PROJECT' | 'DEVICE_LIST', targetIds: string[], status: OtaPlanStatus, batchSize: number, batchIntervalSec: number, maxRetries: number, preCheckRequired: { engineOff: boolean, minBatteryVoltage: number }, totalDevices: number, successDevices: number, failedDevices: number, createdAt: Date }`
- `CreateOtaPlanDto`: `Omit<OtaPlanDto, 'id' | 'tenantId' | 'status' | 'totalDevices' | 'successDevices' | 'failedDevices' | 'createdAt'>`
- `OtaDeviceTaskDto`: `{ id: string, tenantId: string, planId: string, vehicleId: string, deviceNo: string, firmwareVersion: string, status: OtaTaskStatus, currentStep: OtaStep, progressPercent: number, retryCount: number, failureReason?: string, notifiedAt?: Date, finishedAt?: Date }`
- `OtaUpgradeDownlinkPayload`: `{ traceId: string, planId: string, taskId: string, version: string, fileUrl: string, fileSizeBytes: number, checksumSha256: string, checksumMd5?: string }`
- `OtaProgressPayload`: `{ planId: string, taskId: string, deviceNo: string, step: OtaStep, progressPercent: number, currentChunk?: number, totalChunks?: number, errorCode?: number, errorMessage?: string }`
- `WebSocketEvent.OTA_PROGRESS = 'ota.progress'`, `WebSocketEvent.OTA_COMPLETED = 'ota.completed'`

- [ ] **Step 1: 编写 `ota-payloads.ts`，导出所有枚举、DTO、状态转移判定工具与校验方法**
- [ ] **Step 2: 在 `MqttTopicBuilder` 新增 `otaUpgrade(productKey, deviceNo)` 与 `otaProgress(productKey, deviceNo)`**
- [ ] **Step 3: 扩展 `WebSocketEvent` 与领域实体 `packages/domain-types/src/ota.ts`**
- [ ] **Step 4: 编译 contracts & domain-types 并通过单元测试**
```bash
pnpm --filter @car-control/contracts build && pnpm --filter @car-control/domain-types build && pnpm test
```
- [ ] **Step 5: 提交代码**
```bash
git add packages/contracts packages/domain-types
git commit -m "feat(contracts): add OTA firmware, plan, and progress DTOs"
```

---

### Task 3: 建设 OTA 数据仓储层 (`packages/database`)

**Files:**
- Create: `packages/database/src/firmware-repository.ts`
- Create: `packages/database/src/ota-plan-repository.ts`
- Create: `packages/database/src/ota-task-repository.ts`
- Modify: `packages/database/src/index.ts`

**Interfaces:**
- `FirmwareRepository`:
  - `create(pkg)`
  - `findById(id)`
  - `findByVersion(version, targetModelId)`
  - `list(filter: { targetModelId?, status? })`
- `OtaPlanRepository`:
  - `create(plan)`
  - `findById(id)`
  - `list(filter: { status?, firmwareId? })`
  - `updateStatus(id, status)`
  - `updateCounters(id, increments: { success?: number, failed?: number })`
- `OtaTaskRepository`:
  - `create(task)`
  - `findById(id)`
  - `findByPlanAndDevice(planId, deviceNo)`
  - `listByPlan(planId)`
  - `updateProgress(taskId, progress: { status: OtaTaskStatus, step: OtaStep, percent: number, reason?: string })`
  - `incrementRetry(taskId)`

- [ ] **Step 1: 实现 `FirmwareRepository` (支持多租户隔离与版本唯一性)**
- [ ] **Step 2: 实现 `OtaPlanRepository` (升级计划与状态计数器原子更新)**
- [ ] **Step 3: 实现 `OtaTaskRepository` (设备升级任务状态流转与单向终态保护)**
- [ ] **Step 4: 编写单元测试并导出**
- [ ] **Step 5: 编译 `@car-control/database` 并验证**
```bash
pnpm --filter @car-control/database build && pnpm --filter @car-control/database test
```
- [ ] **Step 6: 提交代码**
```bash
git add packages/database
git commit -m "feat(database): add firmware, ota plan, and ota task repositories"
```

---

### Task 4: 设备模拟器扩展 OTA 升级与进度仿真 (`apps/simulator`)

**Files:**
- Modify: `apps/simulator/src/device-simulator.ts`
- Modify: `apps/simulator/src/types.ts`
- Modify: `apps/simulator/src/test/simulator.test.ts`

- [ ] **Step 1: 在 `DeviceSimulator` 中扩展 OTA 监听逻辑**
订阅 `/sys/{PK}/{Dev}/ota/upgrade`（及兼容 Topic），收到升级指令后：
1. 检查模拟设备状态：若 `options.simulatedEngineRunning` 为 true 或 `options.simulatedBatteryVoltage < 12.0`，拒绝升级并立即上报失败进度 (`errorCode: 1002, errorMessage: 'PRECHECK_FAILED_ENGINE_ON'`)；
2. 正常情况下，启动模拟下载分片循环，逐步上报 `DOWNLOADING` 进度 (25% -> 50% -> 100%) 到 `/sys/{PK}/{Dev}/ota/progress`；
3. 上报 `VERIFYING` 校验固件 SHA256；
4. 上报 `FLASHING` 模拟刷写；
5. 最终上报 `SUCCESS` 并更新模拟器当前 `firmwareVersion`。
- [ ] **Step 2: 新增测试用例验证模拟器正常 OTA 进度闭环与安全前置拒绝**
- [ ] **Step 3: 编译并运行模拟器测试**
```bash
pnpm --filter @car-control/simulator build && node --test apps/simulator/dist/test/simulator.test.js
```
- [ ] **Step 4: 提交代码**
```bash
git add apps/simulator
git commit -m "feat(simulator): add OTA firmware upgrade reception and progress simulation"
```

---

### Task 5: 核心业务服务与调度引擎 (`apps/api/src/ota`)

**Files:**
- Create: `apps/api/src/ota/firmware.service.ts`
- Create: `apps/api/src/ota/ota-safety.service.ts`
- Create: `apps/api/src/ota/ota-plan.service.ts`
- Create: `apps/api/src/ota/ota-progress.service.ts`
- Create: `apps/api/src/ota/ota.controller.ts`
- Create: `apps/api/src/ota/ota.module.ts`
- Modify: `apps/api/src/messaging/messaging.port.ts`
- Modify: `apps/api/src/messaging/in-memory-messaging.adapter.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: 编写 `FirmwareService` (固件包创建、SHA-256 校验和、版本匹配)**
- [ ] **Step 2: 编写 `OtaSafetyService` (行车状态与电瓶电压安全前置检查)**
- [ ] **Step 3: 编写 `OtaPlanService` (目标设备解析、分批调度分发、下发 MQTT OTA 指令)**
- [ ] **Step 4: 编写 `OtaProgressService` (监听 MQTT 上行 OTA 进度、更新 Task 状态、WebSocket 广播、计算计划整体完成度)**
- [ ] **Step 5: 编写 `OtaController` 暴露 REST 接口，注册 `OtaModule` 到 `AppModule`**
- [ ] **Step 6: 编写单元与集成测试 `apps/api/src/test/ota-service.test.ts`**
- [ ] **Step 7: 编译 `@car-control/api` 并验证**
```bash
pnpm --filter @car-control/api build && node --test apps/api/dist/test/ota-service.test.js
```
- [ ] **Step 8: 提交代码**
```bash
git add apps/api/src/ota apps/api/src/messaging apps/api/src/app.module.ts apps/api/src/test/ota-service.test.ts
git commit -m "feat(api): implement OTA firmware, safety pre-check, and plan scheduling services"
```

---

### Task 6: Gate 5 验收测试套件编写与全量回归验收

**Files:**
- Create: `apps/api/src/test/ota-firmware.e2e.test.ts`
- Modify: `CURRENT.md`
- Modify: `task_plan.md`

**验收用例清单 (Gate 5 Acceptance Criteria):**
1. **固件版本管理与 SHA256 完整性校验**：创建固件包，校验版本唯一性与 SHA256 校验和计算。
2. **多维目标设备解析筛选**：按项目、车型或指定白名单筛选出待升级设备，自动过滤不匹配的设备。
3. **安全前置检查拦截 (Safety Pre-check)**：车辆在行车中（Engine ON / ACC ON）或低电量（< 12.0V）时触发安全阻断，任务标记 `SKIPPED_UNSAFE`。
4. **分批次并发调度下发**：升级计划按批次规模分发升级指令，分批间隔正确生效。
5. **设备模拟器升级进度全链路闭环**：模拟器接收升级通知，依次上报 `DOWNLOADING` -> `VERIFYING` -> `FLASHING` -> `SUCCESS`，WebSocket 实时收到进度广播，任务与计划终态置为 `COMPLETED`。
6. **升级失败与重试机制**：模拟器上报失败时触发重试计数，达到 `maxRetries` 后标记最终 `FAILED`。
7. **多租户安全隔离防线**：租户 B 无法查询、修改或执行租户 A 的固件包、升级计划与设备任务。

- [ ] **Step 1: 编写 `apps/api/src/test/ota-firmware.e2e.test.ts`**
- [ ] **Step 2: 编译 `@car-control/api`**
```bash
pnpm --filter @car-control/api build
```
- [ ] **Step 3: 运行 Gate 5 验收测试**
```bash
node --test apps/api/dist/test/ota-firmware.e2e.test.js
```
- [ ] **Step 4: 运行全工程所有测试套件 (Gate 0 ~ Gate 5 + Simulator + DB)**
```bash
pnpm test
```
- [ ] **Step 5: 提交代码并更新 `CURRENT.md` 与 `task_plan.md`**
```bash
git add apps/api/src/test/ota-firmware.e2e.test.ts CURRENT.md task_plan.md
git commit -m "feat(gate-5): complete OTA firmware upgrade system with 100% pass acceptance suite"
```
