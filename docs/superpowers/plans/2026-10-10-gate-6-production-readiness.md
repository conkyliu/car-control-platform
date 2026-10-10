# Gate 6: Production Readiness & Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建生产级高可用架构、全链路可观测性监控体系与千级设备并发性能硬基准，涵盖 Redis 分布式防重互斥锁、Prometheus 标准指标暴露、OpenTelemetry 5 阶段分布式链路追踪以及 100/500/1000 级设备阶梯压测自动化验证。

**Architecture:** 采用端口与适配器（Hexagonal Architecture）解耦缓存与分布式锁（InMemory / Redis 双模），核心控车流水线集成车辆级排他防重锁；构建独立可观测性模块输出标准 Prometheus 指标与 OpenTelemetry W3C 5-Span Trace；构建高仿真多设备并发压测驱动器执行阶梯压测并断言 SLA 门禁。

**Tech Stack:** Node.js 24 LTS, NestJS 12, TypeScript 6, ioredis, Prometheus exposition format, OpenTelemetry W3C Trace Context, DeviceSimulator.

**Spec:** `docs/superpowers/specs/2026-10-10-gate-6-production-readiness-design.md`

## Global Constraints

- 遵循 Hexagonal 架构，`CachePort` 与 `DistributedLockPort` 默认提供 `InMemoryLockAdapter`，确保无外部 Redis 时单元测试与 CI 100% 可行零阻塞；
- 控车防重锁键格式严格固定为 `lock:cmd:${tenantId}:${vehicleId}`，TTL 为 10000ms，加锁失败抛出 `409 ConflictException` (`VEHICLE_COMMAND_IN_PROGRESS`)；
- Prometheus 指标端点 `GET /metrics` 输出类型为 `text/plain; version=0.0.4; charset=utf-8`，直方图 Buckets 精确覆盖车控关键 SLA：`[0.05, 0.1, 0.25, 0.5, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0]`；
- OpenTelemetry 链路追踪必须符合 W3C Trace Context 规范，记录 5 个标准 Span：`http.inbound_request` ($T_0 \to T_1$), `command.security_and_dispatch` ($T_1 \to T_2$), `device.execution_ack` ($T_2 \to T_4$), `ack.processing_and_persistence` ($T_4 \to T_5$), `websocket.client_notification` ($T_5 \to T_6$)；
- 并发压测硬门禁：1000 次端到端并发控车满足成功率 $\ge 99.9\%$, $P_{50} \le 1.0\text{s}$, $P_{95} \le 2.0\text{s}$, $P_{99} \le 5.0\text{s}$；
- 保持严格的 `TenantContext` 强隔离防线，零跨租户数据或锁状态泄露；
- 全工作区 77/77 现有测试保持 100% 通过无回归。

---

### Task 1: 编写规范与架构决策文档 (Specs & ADRs)

**Files:**
- Create: `docs/specs/observability.md`
- Create: `docs/adr/ADR-015-distributed-lock-and-caching-strategy.md`
- Create: `docs/adr/ADR-016-observability-metrics-and-e2e-benchmarks.md`

**Interfaces:**
- Produces: 
  - `docs/specs/observability.md`: Prometheus metrics schema, OTel 5-span pipeline, SLA performance criteria.
  - `ADR-015`: Context, Decision, Consequences for dual-mode CachePort/DistributedLockPort and vehicle-level mutex lock.
  - `ADR-016`: Context, Decision, Consequences for Prometheus metric exposition and E2E W3C tracing.

- [ ] **Step 1: Write `docs/specs/observability.md`**

Define the observability specification, metric names, types, labels, histogram buckets, W3C trace context format, and benchmark criteria:
- Metric names: `car_commands_total`, `car_command_duration_seconds`, `car_telemetry_uplinks_total`, `car_alarms_total`, `car_active_simulators`, `car_websocket_connections`, `car_lock_contention_total`.
- OpenTelemetry 5-Span definitions: $T_0 \to T_1$, $T_1 \to T_2$, $T_2 \to T_4$, $T_4 \to T_5$, $T_5 \to T_6$.
- Benchmark SLA gates: 100, 500, 1000 tiers; $P_{50} \le 1.0\text{s}, P_{95} \le 2.0\text{s}, P_{99} \le 5.0\text{s}$; Success $\ge 99.9\%$.

- [ ] **Step 2: Write `docs/adr/ADR-015-distributed-lock-and-caching-strategy.md`**

Record architectural decisions on Hexagonal port/adapter design (`CachePort`, `DistributedLockPort`), Redis Redlock / SET NX PX with Lua script release, and `VEHICLE_COMMAND_IN_PROGRESS` conflict prevention.

- [ ] **Step 3: Write `docs/adr/ADR-016-observability-metrics-and-e2e-benchmarks.md`**

Record architectural decisions on in-house lightweight Prometheus text exposition and OpenTelemetry W3C trace instrumentation, avoiding heavyweight brittle external framework dependencies while maintaining strict spec compliance.

- [ ] **Step 4: Commit documentation**

```bash
git add docs/specs/observability.md docs/adr/ADR-015-distributed-lock-and-caching-strategy.md docs/adr/ADR-016-observability-metrics-and-e2e-benchmarks.md
git commit -m "docs(gate-6): add observability specs and ADR-015, ADR-016"
```

---

### Task 2: 核心分布式缓存、防重锁与 CommandService 集成 (`apps/api/src/common/cache`)

**Files:**
- Create: `apps/api/src/common/cache/cache.port.ts`
- Create: `apps/api/src/common/cache/in-memory-cache.adapter.ts`
- Create: `apps/api/src/common/cache/redis-cache.adapter.ts`
- Create: `apps/api/src/common/cache/cache.module.ts`
- Modify: `apps/api/src/command/command.service.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/test/distributed-lock.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface LockHandle {
    resource: string;
    token: string;
    ttlMs: number;
    acquiredAt: number;
  }
  export interface DistributedLockPort {
    acquire(resource: string, ttlMs: number, waitTimeoutMs?: number): Promise<LockHandle | null>;
    release(handle: LockHandle): Promise<boolean>;
    withLock<T>(resource: string, ttlMs: number, fn: () => Promise<T>): Promise<T>;
  }
  export interface CachePort {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
    del(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
  }
  ```
- Consumes:
  - Injects `DistributedLockPort` into `CommandService` to guard `lock:cmd:${tenantId}:${vehicleId}`.

- [ ] **Step 1: Write failing unit test for DistributedLock and Cache (`apps/api/src/test/distributed-lock.test.ts`)**

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryLockAdapter } from '../common/cache/in-memory-cache.adapter.js';

test('DistributedLock: mutual exclusion and expiration', async (t) => {
  const lockAdapter = new InMemoryLockAdapter();
  const resource = 'test:vehicle:001';

  // 1. 首次获取锁成功
  const lock1 = await lockAdapter.acquire(resource, 500);
  assert.ok(lock1);
  assert.strictEqual(lock1.resource, resource);

  // 2. 并发重复获取应被排他阻断 (null)
  const lock2 = await lockAdapter.acquire(resource, 500);
  assert.strictEqual(lock2, null);

  // 3. 释放锁后恢复可获取
  const released = await lockAdapter.release(lock1);
  assert.strictEqual(released, true);

  const lock3 = await lockAdapter.acquire(resource, 500);
  assert.ok(lock3);
  await lockAdapter.release(lock3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/api/dist/test/distributed-lock.test.js`
Expected: FAIL with module not found or build error.

- [ ] **Step 3: Implement `CachePort`, `DistributedLockPort`, and `InMemoryLockAdapter`**

In `apps/api/src/common/cache/cache.port.ts` and `in-memory-cache.adapter.ts`:
- Define `LockHandle`, `DistributedLockPort`, `CachePort`.
- Implement `InMemoryLockAdapter`:
  - `Map<string, { token: string; expireAt: number; timer: NodeJS.Timeout }>`
  - `acquire(resource, ttlMs, waitTimeoutMs)`: atomic check-and-set token, set timer for automatic release.
  - `release(handle)`: check token match before deleting; clear timer.
  - `withLock(resource, ttlMs, fn)`: acquire -> run `fn` -> release in `finally`.
  - Cache methods: `get`, `set`, `del`, `exists`.

- [ ] **Step 4: Implement `RedisLockAdapter` (`apps/api/src/common/cache/redis-cache.adapter.ts`)**

Implement `RedisLockAdapter` implementing both `DistributedLockPort` and `CachePort`:
- `acquire`: `redis.set(resource, token, 'PX', ttlMs, 'NX')`
- `release`: Lua script comparison and delete
- Fallback safely or connect to `REDIS_URL` if present.

- [ ] **Step 5: Integrate `DistributedLockPort` into `CommandService`**

In `apps/api/src/command/command.service.ts`:
- Inject `@Inject('DistributedLockPort') private readonly lockPort: DistributedLockPort`.
- In `executeCommand(dto)`:
  - Generate lock key: `const lockKey = `lock:cmd:${tenant.tenantId}:${dto.vehicleId}`;`
  - Call `const lock = await this.lockPort.acquire(lockKey, 10000);`
  - If `!lock`: throw `new ConflictException('VEHICLE_COMMAND_IN_PROGRESS')`.
  - Wrap downstream execution in `try ... finally { await this.lockPort.release(lock); }`.

- [ ] **Step 6: Build and verify test passes**

Run: `pnpm --filter @car-control/api build && node --test apps/api/dist/test/distributed-lock.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/common/cache apps/api/src/command/command.service.ts apps/api/src/app.module.ts apps/api/src/test/distributed-lock.test.ts
git commit -m "feat(api): implement distributed cache, mutex lock, and command concurrency prevention"
```

---

### Task 3: Prometheus 指标服务与 `GET /metrics` 端点 (`apps/api/src/observability/metrics`)

**Files:**
- Create: `apps/api/src/observability/metrics/metrics.types.ts`
- Create: `apps/api/src/observability/metrics/metrics.service.ts`
- Create: `apps/api/src/observability/metrics/metrics.controller.ts`
- Create: `apps/api/src/observability/observability.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/test/metrics.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface MetricsService {
    incrementCommands(tenantId: string, commandCode: string, status: string): void;
    observeCommandDuration(tenantId: string, commandCode: string, durationSeconds: number): void;
    incrementTelemetryUplinks(tenantId: string, productKey: string): void;
    incrementAlarms(tenantId: string, alarmType: string, level: string): void;
    setActiveSimulators(count: number, onlineStatus: string): void;
    setWebsocketConnections(tenantId: string, count: number): void;
    incrementLockContention(tenantId: string): void;
    exportPrometheusMetrics(): string;
  }
  ```
- Exposes:
  - `GET /metrics` returning standard text/plain Prometheus exposition.

- [ ] **Step 1: Write failing unit test for MetricsService (`apps/api/src/test/metrics.test.ts`)**

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { MetricsService } from '../observability/metrics/metrics.service.js';

test('MetricsService: Prometheus exposition and counters', async (t) => {
  const metrics = new MetricsService();
  metrics.incrementCommands('tenant_01', 'UNLOCK', 'SUCCESS');
  metrics.observeCommandDuration('tenant_01', 'UNLOCK', 0.24);
  metrics.setActiveSimulators(10, 'ONLINE');

  const text = metrics.exportPrometheusMetrics();
  assert.ok(text.includes('# TYPE car_commands_total counter'));
  assert.ok(text.includes('car_commands_total{tenant_id="tenant_01",command_code="UNLOCK",status="SUCCESS"} 1'));
  assert.ok(text.includes('# TYPE car_command_duration_seconds histogram'));
  assert.ok(text.includes('car_active_simulators{online_status="ONLINE"} 10'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/api/dist/test/metrics.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `MetricsService` and Prometheus exposition**

In `apps/api/src/observability/metrics/metrics.service.ts`:
- Implement thread-safe counters, gauges, and histograms with standard buckets `[0.05, 0.1, 0.25, 0.5, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0]`.
- Implement `exportPrometheusMetrics()` producing valid `# HELP`, `# TYPE`, and formatted series.

- [ ] **Step 4: Implement `MetricsController` & `ObservabilityModule`**

In `apps/api/src/observability/metrics/metrics.controller.ts`:
- `@Controller('metrics')`
- `@Get()` returning `res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8').send(this.metricsService.exportPrometheusMetrics())`.
- Register `ObservabilityModule` in `AppModule`.

- [ ] **Step 5: Build and verify test passes**

Run: `pnpm --filter @car-control/api build && node --test apps/api/dist/test/metrics.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/observability apps/api/src/app.module.ts apps/api/src/test/metrics.test.ts
git commit -m "feat(api): implement Prometheus metrics service and GET /metrics endpoint"
```

---

### Task 4: OpenTelemetry W3C 5-Span 全链路分布式链路追踪 (`apps/api/src/observability/tracing`)

**Files:**
- Create: `apps/api/src/observability/tracing/tracer.types.ts`
- Create: `apps/api/src/observability/tracing/tracer.service.ts`
- Modify: `apps/api/src/observability/observability.module.ts`
- Modify: `apps/api/src/command/command.service.ts`
- Test: `apps/api/src/test/tracer.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface CommandTraceSpan {
    name: string;
    startTime: number;
    endTime: number;
    durationMs: number;
    attributes?: Record<string, any>;
  }
  export interface CommandTrace {
    traceId: string;
    commandId: string;
    vehicleId: string;
    totalDurationMs: number;
    spans: CommandTraceSpan[];
  }
  export interface TracerService {
    startTrace(commandId: string, vehicleId: string, explicitTraceId?: string): CommandTrace;
    recordSpan(traceId: string, spanName: string, durationMs: number, attributes?: Record<string, any>): void;
    finishTrace(traceId: string): CommandTrace | null;
    getTrace(traceId: string): CommandTrace | null;
  }
  ```
- Consumes:
  - Injects `TracerService` and `MetricsService` into `CommandService` to capture 5 spans and observe duration.

- [ ] **Step 1: Write failing test for TracerService (`apps/api/src/test/tracer.test.ts`)**

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { TracerService } from '../observability/tracing/tracer.service.js';

test('TracerService: captures 5 spans and matches total duration', async (t) => {
  const tracer = new TracerService();
  const trace = tracer.startTrace('cmd_001', 'veh_001');

  tracer.recordSpan(trace.traceId, 'http.inbound_request', 10);
  tracer.recordSpan(trace.traceId, 'command.security_and_dispatch', 15);
  tracer.recordSpan(trace.traceId, 'device.execution_ack', 40);
  tracer.recordSpan(trace.traceId, 'ack.processing_and_persistence', 12);
  tracer.recordSpan(trace.traceId, 'websocket.client_notification', 8);

  const finished = tracer.finishTrace(trace.traceId);
  assert.ok(finished);
  assert.strictEqual(finished.spans.length, 5);
  assert.strictEqual(finished.totalDurationMs, 85);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/api/dist/test/tracer.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `TracerService`**

In `apps/api/src/observability/tracing/tracer.service.ts`:
- Store active and completed traces with TTL cleanup.
- Generate valid 32-character hex `traceId` if none provided.
- Support span addition and total duration calculation.

- [ ] **Step 4: Instrument `CommandService` with 5-Span Tracing & Metrics**

In `apps/api/src/command/command.service.ts`:
- Inject `TracerService` and `MetricsService`.
- Record `http.inbound_request`, `command.security_and_dispatch`, `device.execution_ack`, `ack.processing_and_persistence`, `websocket.client_notification`.
- Feed `metricsService.observeCommandDuration(tenantId, commandCode, totalDurationMs / 1000)`.

- [ ] **Step 5: Build and verify test passes**

Run: `pnpm --filter @car-control/api build && node --test apps/api/dist/test/tracer.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/observability/tracing apps/api/src/command/command.service.ts apps/api/src/test/tracer.test.ts
git commit -m "feat(api): implement OpenTelemetry 5-span distributed command tracing"
```

---

### Task 5: 阶梯式并发压测驱动器与性能基准生成器 (`apps/api/src/test/benchmark`)

**Files:**
- Create: `apps/api/src/test/benchmark/benchmark.types.ts`
- Create: `apps/api/src/test/benchmark/load-test-runner.ts`
- Test: `apps/api/src/test/benchmark/load-test-runner.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface BenchmarkResult {
    totalRequests: number;
    successRequests: number;
    failedRequests: number;
    successRate: number;
    durationMs: number;
    tps: number;
    p50Ms: number;
    p90Ms: number;
    p95Ms: number;
    p99Ms: number;
    latencies: number[];
  }
  export interface LoadTestRunner {
    runTier(tierCount: number, options?: { concurrency?: number; simulatedLatencyMs?: number }): Promise<BenchmarkResult>;
    generateMarkdownReport(results: Record<string, BenchmarkResult>): string;
  }
  ```

- [ ] **Step 1: Write test for LoadTestRunner (`apps/api/src/test/benchmark/load-test-runner.test.ts`)**

Verify load runner correctly calculates percentiles ($P_{50}, P_{90}, P_{95}, P_{99}$), success rate, and Markdown output.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/api/dist/test/benchmark/load-test-runner.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `LoadTestRunner`**

In `apps/api/src/test/benchmark/load-test-runner.ts`:
- Implement worker pool concurrency executor (`concurrency: 20~50`).
- Setup mock or in-memory vehicles & `DeviceSimulator` instances.
- Execute simulated/real commands, record latencies array.
- Sort latencies and calculate exact $P_{50}, P_{90}, P_{95}, P_{99}$, TPS, and success rate.
- Implement `generateMarkdownReport`.

- [ ] **Step 4: Build and verify test passes**

Run: `pnpm --filter @car-control/api build && node --test apps/api/dist/test/benchmark/load-test-runner.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/test/benchmark
git commit -m "feat(api): implement tiered load test benchmark runner"
```

---

### Task 6: Gate 6 验收测试套件编写与全量回归验收 (`apps/api/src/test`)

**Files:**
- Create: `apps/api/src/test/production-readiness.e2e.test.ts`
- Modify: `CURRENT.md`
- Modify: `task_plan.md`
- Output: `.superpowers/sdd/2026-10-10-gate-6-production-readiness/task-6-report.md`

**Acceptance Criteria Checklist:**
- [x] **AC-1**: 分布式缓存与并发防重排他锁（同车高频并发仅首个获取，其余拦截 409 `VEHICLE_COMMAND_IN_PROGRESS`，终态自动释放）
- [x] **AC-2**: Prometheus 标准指标端点导出（`GET /metrics` 包含全部 7 项核心指标且数据准确）
- [x] **AC-3**: OpenTelemetry 5 阶段分布式 Span 链路追踪（`http.inbound_request`, `command.security_and_dispatch`, `device.execution_ack`, `ack.processing_and_persistence`, `websocket.client_notification`，耗时和与总耗时一致）
- [x] **AC-4**: 100 设备并发基准测试（100 设备并发心跳/控车，0 丢包 0 错误 100% 成功）
- [x] **AC-5**: 500 设备并发平滑扩展测试（500 设备并发，锁争抢安全，状态机无竞态冲突）
- [x] **AC-6**: 1000 级设备高并发压测与 SLA 硬门禁（1000 次端到端并发，断言 Success $\ge 99.9\%$, $P_{50} \le 1.0\text{s}$, $P_{95} \le 2.0\text{s}$, $P_{99} \le 5.0\text{s}$，并生成基准报告）
- [x] **AC-7**: 高压场景下的多租户强隔离防线（Tenant B 无法获取/修改/干扰 Tenant A 的缓存、锁及控车指令）

- [x] **Step 1: Write `apps/api/src/test/production-readiness.e2e.test.ts` implementing all 7 ACs**

Use real repositories, real `DeviceSimulator`, `InMemoryMessagingAdapter`, `DistributedLockPort`, `MetricsService`, and `TracerService`.

- [x] **Step 2: Build API package**

Run: `pnpm --filter @car-control/api build`
Expected: Build succeeds with 0 TypeScript errors.

- [x] **Step 3: Run Gate 6 E2E acceptance suite**

Run: `node --test apps/api/dist/test/production-readiness.e2e.test.js`
Expected: 7/7 (or 8/8 subtests) PASS with 0 failures.

- [x] **Step 4: Run full workspace regression test suite**

Run: `pnpm test`
Expected: All packages pass, 0 failures, 0 regressions.

- [x] **Step 5: Update `CURRENT.md` and `task_plan.md`**

Mark Gate 6 as completed and record metrics in `CURRENT.md`.

- [x] **Step 6: Write task report and commit**

```bash
git add apps/api/src/test/production-readiness.e2e.test.ts CURRENT.md task_plan.md
git commit -m "feat(gate-6): complete production readiness and observability milestone with 100% pass acceptance suite"
```

