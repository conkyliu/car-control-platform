# Gate 4: 实时业务与报警轨迹中心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建手机控车平台 Gate 4 实时业务模块，包括高频遥测位置上报、Redis/PostgreSQL 冷热分离存储、服务端 Douglas-Peucker 轨迹抽稀算法、电子围栏判定、异常报警生命周期管理（设备告警与围栏越界告警）、WebSocket 实时广播与全链路通讯日志多维检索。

**Architecture:** 
1. 遥测管道：设备端上报 GPS 经纬度/速度/航向角/状态 -> `MessagingPort` 消费 -> `TelemetryService` 校验与更新当前最新位置缓存 -> 沉淀历史轨迹点 -> WebSocket 向车辆订阅房间广播 `LOCATION_UPDATED`。
2. 历史轨迹服务端抽稀：`Douglas-Peucker` 几何算法，在时间范围查询时根据 `epsilon` 容差对原始上千/上万点进行矢量抽稀（压缩率 80%+），保留转折点并降低前端回放负载。
3. 围栏与报警引擎：`GeofenceService` 基于 Haversine 距离公式进行围栏出入判定；`AlarmService` 处理设备上报及内部触发的报警，提供状态流转（PENDING -> PROCESSED / IGNORED）并广播 `ALARM_TRIGGERED`。
4. 通讯日志流水：`CommunicationLogService` 自动监听所有 MQTT 上下行报文并进行多租户结构化索引，支持按 traceId / vehicleId / topic 检索。

**Tech Stack:** NestJS 12, TypeScript, PostgreSQL (Prisma 7), Socket.IO (WebSocket), Douglas-Peucker Algorithm, Haversine Formula.

**Spec:** `docs/specs/telemetry.md`, `docs/specs/alert.md`, `ADR-011`, `ADR-012`

## Global Constraints
- 前端禁止直连 MQTT，所有遥测与报警均通过 NestJS 校验后通过 WebSocket 网关推送到前端房间；
- 多租户强隔离防线：所有仓储查询与更新必须在 `TenantContext` 作用域内，跨租户查询返回空或抛出安全异常；
- 轨迹抽稀必须在服务端完成，严禁将全量数万原始点直接推送给前端；
- 每次任务编写自动化测试验证，保证 Gate 0 至 Gate 4 验收套件持续 100% 通过。

---

### Task 1: 编写领域规范与架构决策文档 (Specs & ADRs)

**Files:**
- Create: `docs/specs/telemetry.md`
- Create: `docs/specs/alert.md`
- Create: `docs/adr/ADR-011-telemetry-storage-and-simplification.md`
- Create: `docs/adr/ADR-012-alarm-lifecycle-and-realtime-broadcast.md`

- [ ] **Step 1: 创建 `docs/specs/telemetry.md`**
定义 GPS 上报报文格式、坐标系转换 (WGS84 -> GCJ-02)、最新位置热缓存与历史分区归档策略、Douglas-Peucker 抽稀容差规则。

- [ ] **Step 2: 创建 `docs/specs/alert.md`**
定义告警类型枚举 (`LOW_BATTERY`, `VIBRATION`, `OVERSPEED`, `POWER_CUT`, `SOS`, `TOW_AWAY`, `GEOFENCE_IN`, `GEOFENCE_OUT`)、严重等级 (`INFO`, `WARNING`, `CRITICAL`)、处置生命周期状态机。

- [ ] **Step 3: 创建 `docs/adr/ADR-011-telemetry-storage-and-simplification.md`**
记录遥测冷热分离与 Douglas-Peucker 服务端抽稀决策背景与实现原理。

- [ ] **Step 4: 创建 `docs/adr/ADR-012-alarm-lifecycle-and-realtime-broadcast.md`**
记录报警中心状态流转、WebSocket 广播机制与跨租户隔离决策。

- [ ] **Step 5: 提交规范文档**
```bash
git add docs/specs/telemetry.md docs/specs/alert.md docs/adr/ADR-011-telemetry-storage-and-simplification.md docs/adr/ADR-012-alarm-lifecycle-and-realtime-broadcast.md
git commit -m "docs(gate-4): add telemetry and alert specifications and ADRs"
```

---

### Task 2: 扩展共享契约与领域类型 (`packages/contracts` & `packages/domain-types`)

**Files:**
- Create: `packages/contracts/src/telemetry/telemetry-payloads.ts`
- Create: `packages/contracts/src/alarm/alarm-payloads.ts`
- Create: `packages/contracts/src/log/communication-log-payloads.ts`
- Modify: `packages/contracts/src/events/websocket-events.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/domain-types/src/index.ts`

**Interfaces:**
- Consumes: `MqttTopicBuilder`, `WebSocketEvent`
- Produces:
  - `TelemetryLocationPayload`: `{ lat: number, lng: number, altitude?: number, speed?: number, heading?: number, satellites?: number, gpsValid: boolean, timestamp: number }`
  - `TrajectoryQueryDto`: `{ startTime: string | Date, endTime: string | Date, tolerance?: number }`
  - `AlarmType`: `'LOW_BATTERY' | 'VIBRATION' | 'OVERSPEED' | 'POWER_CUT' | 'SOS' | 'TOW_AWAY' | 'GEOFENCE_IN' | 'GEOFENCE_OUT'`
  - `AlarmLevel`: `'INFO' | 'WARNING' | 'CRITICAL'`
  - `AlarmStatus`: `'PENDING' | 'PROCESSED' | 'IGNORED'`
  - `AlarmRecordDto`: `{ id: string, tenantId: string, projectId: string, vehicleId: string, deviceNo: string, alarmType: AlarmType, alarmLevel: AlarmLevel, lat?: number, lng?: number, speed?: number, status: AlarmStatus, message?: string, triggeredAt: Date, processedAt?: Date, processedBy?: string }`
  - `CommunicationLogDto`: `{ id: string, tenantId: string, vehicleId?: string, deviceNo: string, traceId?: string, requestId?: string, direction: 'UPLINK' | 'DOWNLINK', channel: 'MQTT' | 'TCP' | 'HTTP', topic: string, payload: any, createdAt: Date }`

- [ ] **Step 1: 编写 `telemetry-payloads.ts`、`alarm-payloads.ts`、`communication-log-payloads.ts`**
- [ ] **Step 2: 扩展 `WebSocketEvent` 添加 `LOCATION_UPDATED = 'location:updated'` 和 `ALARM_TRIGGERED = 'alarm:triggered'`**
- [ ] **Step 3: 导出并在 `packages/domain-types` 中声明实体接口**
- [ ] **Step 4: 编译 contracts & domain-types 并验证**
```bash
pnpm --filter @car-control/contracts build && pnpm --filter @car-control/domain-types build
```
- [ ] **Step 5: 提交代码**
```bash
git add packages/contracts packages/domain-types
git commit -m "feat(contracts): add telemetry, alarm, and communication log DTOs"
```

---

### Task 3: 建设数据仓储层 (`packages/database`)

**Files:**
- Create: `packages/database/src/location-repository.ts`
- Create: `packages/database/src/alarm-repository.ts`
- Create: `packages/database/src/communication-log-repository.ts`
- Modify: `packages/database/src/index.ts`

**Interfaces:**
- `LocationRepository`:
  - `saveLocation(vehicleId: string, point: TelemetryLocationPayload): Promise<void>`
  - `getLatestLocation(vehicleId: string): Promise<TelemetryLocationPayload | null>`
  - `getTrajectory(vehicleId: string, start: Date, end: Date): Promise<TelemetryLocationPayload[]>`
- `AlarmRepository`:
  - `create(alarm: Omit<AlarmRecordDto, 'id'>): Promise<AlarmRecordDto>`
  - `findById(id: string): Promise<AlarmRecordDto | null>`
  - `list(filter: { vehicleId?: string, status?: AlarmStatus }): Promise<AlarmRecordDto[]>`
  - `updateStatus(id: string, status: AlarmStatus, operatorId: string, remark?: string): Promise<AlarmRecordDto>`
- `CommunicationLogRepository`:
  - `log(entry: Omit<CommunicationLogDto, 'id' | 'createdAt'>): Promise<CommunicationLogDto>`
  - `query(filter: { vehicleId?: string, deviceNo?: string, traceId?: string }): Promise<CommunicationLogDto[]>`

- [ ] **Step 1: 实现 `LocationRepository` (支持内存热缓存 + 时序数组存储，严格受 `TenantContext` 隔离约束)**
- [ ] **Step 2: 实现 `AlarmRepository` (租户隔离、状态流转)**
- [ ] **Step 3: 实现 `CommunicationLogRepository` (多维检索)**
- [ ] **Step 4: 在 `packages/database/src/index.ts` 导出**
- [ ] **Step 5: 编译 `@car-control/database`**
```bash
pnpm --filter @car-control/database build
```
- [ ] **Step 6: 提交代码**
```bash
git add packages/database
git commit -m "feat(database): add location, alarm, and communication log repositories"
```

---

### Task 4: 设备模拟器扩展遥测与报警上报 (`apps/simulator`)

**Files:**
- Modify: `apps/simulator/src/device-simulator.ts`
- Modify: `apps/simulator/src/test/simulator.test.ts`

- [ ] **Step 1: 在 `DeviceSimulator` 中新增 `reportLocation(payload: Partial<TelemetryLocationPayload>)` 方法**
发布至 `car/up/${productKey}/${deviceNo}/telemetry/location` MQTT Topic。
- [ ] **Step 2: 在 `DeviceSimulator` 中新增 `reportAlarm(alarmType: AlarmType, alarmLevel: AlarmLevel, message?: string, coords?: { lat: number, lng: number })` 方法**
发布至 `car/up/${productKey}/${deviceNo}/alarm/report` MQTT Topic。
- [ ] **Step 3: 编写单测验证设备上报位置与报警**
- [ ] **Step 4: 编译并运行模拟器测试**
```bash
pnpm --filter @car-control/simulator build && node --test apps/simulator/dist/test/simulator.test.js
```
- [ ] **Step 5: 提交代码**
```bash
git add apps/simulator
git commit -m "feat(simulator): add telemetry location and alarm uplink reporting"
```

---

### Task 5: 算法与遥测定位服务 (`apps/api/src/telemetry`)

**Files:**
- Create: `apps/api/src/telemetry/douglas-peucker.ts`
- Create: `apps/api/src/telemetry/geofence.service.ts`
- Create: `apps/api/src/telemetry/telemetry.service.ts`
- Create: `apps/api/src/telemetry/telemetry.controller.ts`
- Create: `apps/api/src/telemetry/telemetry.module.ts`

**Interfaces:**
- `douglasPeucker(points: TelemetryLocationPayload[], tolerance: number): TelemetryLocationPayload[]`
- `GeofenceService`:
  - `checkGeofence(circle: { centerLat: number, centerLng: number, radiusMeters: number }, point: { lat: number, lng: number }): boolean` (使用 Haversine 大圆距离公式)
- `TelemetryService`:
  - `handleLocationUplink(deviceNo: string, payload: TelemetryLocationPayload): Promise<void>`
  - `getLatestLocation(vehicleId: string): Promise<TelemetryLocationPayload | null>`
  - `getTrajectory(vehicleId: string, start: Date, end: Date, tolerance?: number): Promise<TelemetryLocationPayload[]>`

- [ ] **Step 1: 编写 Douglas-Peucker 算法与单元测试**
实现标准分治递归矢量抽稀算法，确保首尾两点严格保留，中间偏离最大距离超过 epsilon 的保留，直线/小偏差点剔除。
- [ ] **Step 2: 编写 `GeofenceService` 圆形电子围栏出入判定服务**
- [ ] **Step 3: 编写 `TelemetryService` 与 `TelemetryController`**
- [ ] **Step 4: 组装 `TelemetryModule` 并接入 `MessagingPort` 遥测上行监听**
- [ ] **Step 5: 编译并验证**
```bash
pnpm --filter @car-control/api build
```
- [ ] **Step 6: 提交代码**
```bash
git add apps/api/src/telemetry
git commit -m "feat(api): implement Douglas-Peucker trajectory simplification and telemetry service"
```

---

### Task 6: 报警中心与通讯日志服务 (`apps/api/src/alarm` & `apps/api/src/log`)

**Files:**
- Create: `apps/api/src/alarm/alarm.service.ts`
- Create: `apps/api/src/alarm/alarm.controller.ts`
- Create: `apps/api/src/alarm/alarm.module.ts`
- Create: `apps/api/src/log/communication-log.service.ts`
- Create: `apps/api/src/log/communication-log.controller.ts`
- Create: `apps/api/src/log/communication-log.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: 编写 `AlarmService` 与 `AlarmController`**
实现报警接入、WebSocket 全网/房间广播 (`ALARM_TRIGGERED`)、报警处置（确认/忽略）、审计日志关联。
- [ ] **Step 2: 编写 `CommunicationLogService` 与 `CommunicationLogController`**
统一记录下行指令、上行 ACK、上行遥测与上行报警报文，提供多维检索接口。
- [ ] **Step 3: 在 `AppModule` 注册所有新模块**
- [ ] **Step 4: 编译 `@car-control/api`**
```bash
pnpm --filter @car-control/api build
```
- [ ] **Step 5: 提交代码**
```bash
git add apps/api/src/alarm apps/api/src/log apps/api/src/app.module.ts
git commit -m "feat(api): implement alarm lifecycle and communication log services"
```

---

### Task 7: Gate 4 验收测试套件编写与全量回归验收

**Files:**
- Create: `apps/api/src/test/realtime-telemetry-alarm.e2e.test.ts`
- Modify: `CURRENT.md`
- Modify: `task_plan.md`

**验收用例清单 (Gate 4 Acceptance Criteria):**
1. **实时位置上报与 WebSocket 广播**：设备定时上报 GPS 位置，系统更新当前最新位置，WebSocket 实时广播 `LOCATION_UPDATED`。
2. **历史轨迹服务端抽稀**：密集上报 100+ 个轨迹点，服务端通过 Douglas-Peucker 算法抽稀至少于 20% 点位，首尾点与转折点 100% 保持精准。
3. **地理围栏出入判定**：设置圆形围栏（中心与半径），车辆坐标移动至围栏外，触发 `GEOFENCE_OUT` 报警。
4. **设备端主动告警上报**：设备主动上报 `LOW_BATTERY` 与 `VIBRATION` 告警，系统生成 `AlarmRecord`，WebSocket 广播 `ALARM_TRIGGERED`。
5. **报警生命周期流转**：管理员确认/忽略告警，状态流转为 `PROCESSED`，操作人与处理时间留痕，写入审计日志。
6. **通讯上下行日志自动沉淀**：指令下发、ACK、位置上报、告警上报均自动沉淀至 `CommunicationLog`，支持按 vehicleId / traceId 检索。
7. **多租户安全隔离防线**：租户 A 无法查询租户 B 车辆的最新位置、历史轨迹、告警列表与通讯日志。

- [ ] **Step 1: 编写 `apps/api/src/test/realtime-telemetry-alarm.e2e.test.ts`**
- [ ] **Step 2: 编译 `@car-control/api`**
```bash
pnpm --filter @car-control/api build
```
- [ ] **Step 3: 运行 Gate 4 验收测试**
```bash
node --test apps/api/dist/test/realtime-telemetry-alarm.e2e.test.js
```
- [ ] **Step 4: 运行全工程所有测试套件 (Gate 0, 1, 2, 3, 4 + Simulator + DB)**
```bash
node --test apps/simulator/dist/test/simulator.test.js packages/database/dist/test/tenant-isolation.test.js apps/api/dist/test/transport-poc.e2e.test.js apps/api/dist/test/platform-safe.e2e.test.js apps/api/dist/test/vehicle-online.e2e.test.js apps/api/dist/test/control-closed-loop.e2e.test.js apps/api/dist/test/realtime-telemetry-alarm.e2e.test.js
```
- [ ] **Step 5: 提交代码并更新 `CURRENT.md` 与 `task_plan.md`**
```bash
git add apps/api/src/test/realtime-telemetry-alarm.e2e.test.ts CURRENT.md task_plan.md
git commit -m "feat(gate-4): complete realtime telemetry, geofence, and alert center with 100% pass E2E suite"
```
