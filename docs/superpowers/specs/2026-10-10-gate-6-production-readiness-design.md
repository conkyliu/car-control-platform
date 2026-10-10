# Gate 6: Production Readiness & Observability Design Specification

> Date: 2026-10-10  
> Status: APPROVED  
> Authors: Antigravity Team  
> Scope: Gate 6 (Week 15-18) Production Readiness, Distributed Cache & Lock, Observability, Benchmark Suite  

---

## 1. Context & Objectives

根据《手机控车平台-全栈开发计划-V2.0.md》的整体里程碑规划，平台已在前五个 Gate 完成了传输闭环 (Gate 0)、安全与多租户底座 (Gate 1)、设备与车辆管理 (Gate 2)、控车核心与能力继承引擎 (Gate 3)、实时业务与报警轨迹中心 (Gate 4) 以及 OTA 固件升级系统 (Gate 5)。

Gate 6 的核心使命是为平台构筑**生产级高可用架构、全链路可观测性监控体系与千级设备并发性能硬基准**：
1. **分布式防重互斥锁与缓存体系**：在核心控车流水线中构筑针对车辆维度的并发防重锁，彻底消除高频重复下发、并发重放及指令状态竞态；
2. **Prometheus 工业级监控指标体系**：对外暴露标准化 `GET /metrics` 端点，采集请求流量、耗时分布直方图、在线设备、长连接以及锁争抢指标；
3. **OpenTelemetry W3C 5 阶段分布式链路追踪**：精确测量《全栈开发计划-V2.0》第 27 节定义的控车端到端延迟（$T_0 \to T_6$），分层剖析 HTTP 接入、安全校验调度、设备执行、ACK 消费入库与 WebSocket 广播 5 个子 Span；
4. **阶梯式并发压测基准与 SLA 门禁**：通过真实的 `DeviceSimulator` 集群运行 100 $\to$ 500 $\to$ 1000 级设备并发控车与高密遥测上报，严格验证并断言 $P_{50} \le 1.0\text{s}, P_{95} \le 2.0\text{s}, P_{99} \le 5.0\text{s}$ 及成功率 $\ge 99.9\%$。

---

## 2. 总体架构设计 (Hexagonal Architecture)

Gate 6 采用端口与适配器（Hexagonal Architecture）架构，业务服务层与具体底层驱动完全解耦：

```text
                  ┌──────────────────────────────────────────────┐
                  │          HTTP / REST / WebSocket Clients     │
                  └───────────────────────┬──────────────────────┘
                                          │
                                          ▼
                         ┌─────────────────────────────────┐
                         │      NestJS Controllers / WS    │
                         └────────────────┬────────────────┘
                                          │
                   ┌──────────────────────┴──────────────────────┐
                   ▼                                             ▼
       ┌───────────────────────┐                     ┌───────────────────────┐
       │     CommandService    │                     │    MetricsController  │
       │   (Core Vehicle Flow) │                     │     (GET /metrics)    │
       └───────────┬───────────┘                     └───────────┬───────────┘
                   │                                             │
      ┌────────────┼───────────────────────────┐                 │
      ▼            ▼                           ▼                 ▼
┌───────────┐ ┌───────────────┐        ┌───────────────┐ ┌───────────────┐
│ CachePort │ │ DistLockPort  │        │ TracerService │ │MetricsService │
└─────┬─────┘ └───────┬───────┘        └───────┬───────┘ └───────┬───────┘
      │               │                        │                 │
 ┌────┴────┐     ┌────┴────┐                   │                 │
 │ InMemory│     │ InMemory│                   ▼                 ▼
 │ Adapter │     │ Adapter │            OpenTelemetry       Prometheus
 ├─────────┤     ├─────────┤            W3C 5-Span          Exposition
 │  Redis  │     │  Redis  │            Trace Context       (text/plain)
 │ Adapter │     │ Adapter │
 └─────────┘     └─────────┘
```

---

## 3. 分布式缓存与并发防重锁架构

### 3.1 端口抽象 (`apps/api/src/common/cache`)
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

### 3.2 双模适配器
1. **`InMemoryLockAdapter`**：
   - 基于内存 `Map<string, { token: string; expireAt: number }>`；
   - 包含定时过期检查机制，无需外部依赖；
   - 作为单元测试、CI 以及本地单机运行环境的标准驱动。
2. **`RedisLockAdapter`**：
   - 基于 `ioredis` 实现生产级互斥锁；
   - 加锁语义：`SET resource_key token NX PX ttlMs`；
   - 释放锁使用安全 Lua 脚本：
     ```lua
     if redis.call("get", KEYS[1]) == ARGV[1] then
       return redis.call("del", KEYS[1])
     else
       return 0
     end
     ```
   - 支持通过环境变量 `CACHE_DRIVER=memory|redis` 和 `REDIS_URL` 无感配置切换。

### 3.3 控车并发互斥防重锁落地
- **锁资源定义**：`lock:cmd:${tenantId}:${vehicleId}`
- **加锁时机**：在 `CommandService.executeCommand` 前置校验通过后申请，设置超时为 10000ms（与控车指令超时一致）。
- **锁冲突拦截**：若获取失败，直接抛出 `ConflictException` (HTTP 409)，错误信息为 `VEHICLE_COMMAND_IN_PROGRESS`，并在 Prometheus 中递增 `car_lock_contention_total` 指标。
- **锁安全释放**：无论指令是成功、被拒绝、超时还是发生系统异常，均在 `finally` 块中原子释放。

---

## 4. 全链路可观测性系统架构

### 4.1 Prometheus 指标体系 (`apps/api/src/observability/metrics`)
提供标准 `GET /metrics` 接口（响应类型 `text/plain; version=0.0.4; charset=utf-8`），定义如下生产级指标：

| 指标名称 | 类型 | 标签 | 含义与说明 |
|---|---|---|---|
| `car_commands_total` | Counter | `tenant_id`, `command_code`, `status` | 控车下发总次数及状态分布 |
| `car_command_duration_seconds` | Histogram | `tenant_id`, `command_code`, `le` | 控车全链路耗时直方图，SLA Buckets: `[0.05, 0.1, 0.25, 0.5, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0]` |
| `car_telemetry_uplinks_total` | Counter | `tenant_id`, `product_key` | 遥测定位上报总量 |
| `car_alarms_total` | Counter | `tenant_id`, `alarm_type`, `level` | 异常报警触发总量 |
| `car_active_simulators` | Gauge | `online_status` | 在线活跃设备/模拟器数 |
| `car_websocket_connections` | Gauge | `tenant_id` | 实时 WebSocket 连接数 |
| `car_lock_contention_total` | Counter | `tenant_id` | 车辆并发防重锁冲突阻断次数 |

### 4.2 OpenTelemetry W3C 5 阶段分布式链路追踪 (`apps/api/src/observability/tracing`)
符合 W3C Trace Context 规范，下发指令时生成标准 32 位十六进制 `traceId`，记录 5 个核心子 Span：
1. **`Span 1: http.inbound_request`** ($T_0 \to T_1$): Controller 参数反序列化、JWT 认证、RBAC 授权、分布式防重锁申请；
2. **`Span 2: command.security_and_dispatch`** ($T_1 \to T_2$): 三级能力继承计算、车辆状态/风控校验、状态机流转为 `PENDING` 并发布 MQTT 报文；
3. **`Span 3: device.execution_ack`** ($T_2 \to T_4$): 虚拟设备/TBox 接收 MQTT 指令、总线执行并上报 MQTT ACK；
4. **`Span 4: ack.processing_and_persistence`** ($T_4 \to T_5$): 平台消费 ACK、状态机流转为 `SUCCESS`/`FAILED`、数据库仓储落库及通讯日志持久化；
5. **`Span 5: websocket.client_notification`** ($T_5 \to T_6$): 通过 WebSocket 向专属车辆房间广播指令结果。

---

## 5. 阶梯式并发压测基准套件

### 5.1 压测驱动器设计 (`apps/api/src/test/benchmark/load-test-runner.ts`)
- **阶梯规模**：
  - Tier 1: 100 台设备并发
  - Tier 2: 500 台设备并发
  - Tier 3: 1000 台设备并发
- **并发工作池**：并发协程控制在 20~50，避免进程因不受控的 Promise 堆积产生垃圾回收抖动；
- **真实设备仿真**：每台设备均为真实的 `DeviceSimulator` 实例，模拟 20ms~50ms 真实物理总线执行延迟；
- **统计指标计算**：
  - 排序全部耗时序列，计算 $P_{50}, P_{90}, P_{95}, P_{99}$；
  - 统计成功率：$\text{SUCCESS} / \text{TOTAL} \times 100\%$；
  - 统计每秒事务数：$\text{TPS} = \text{COMPLETED} / \text{DURATION}$；
  - 导出 Markdown / JSON 格式基准报告。

---

## 6. Gate 6 门禁验收标准 (Acceptance Criteria)

| 门禁代号 | 验收标准 (Acceptance Criteria) | 具体验证与断言内容 |
|---|---|---|
| **AC-1** | **分布式缓存与并发防重互斥锁** | 对同一辆车发起并发调用，仅首个请求成功获得锁并流转，后续请求被拦截并返回 `409 ConflictException` (`VEHICLE_COMMAND_IN_PROGRESS`)；指令完成后锁原子释放，后续指令恢复正常。 |
| **AC-2** | **Prometheus 标准指标端点导出** | 访问 `GET /metrics`，验证返回标准 Prometheus 文本格式，包含全部 7 个指标且与业务调用精准同步。 |
| **AC-3** | **OpenTelemetry 5 阶段分布式链路追踪** | 指令执行后生成的 W3C Trace 包含 5 个子 Span，各 Span 耗时之和与总耗时严格一致。 |
| **AC-4** | **100 设备并发基准测试** | 启动 100 台设备并发控车与心跳遥测，验证系统零丢包、零错误，100% 成功闭环。 |
| **AC-5** | **500 设备并发平滑扩展测试** | 扩展至 500 台设备并发，验证锁争抢安全、状态机无竞态冲突、内存平稳不泄漏。 |
| **AC-6** | **1000 级设备高并发压测与 SLA 硬门禁** | 自动化执行 1000 次端到端指令并发测试，严格断言满足性能红线：<br>1. 成功率 $\ge 99.9\%$<br>2. $P_{50} \le 1.0\text{s}$<br>3. $P_{95} \le 2.0\text{s}$<br>4. $P_{99} \le 5.0\text{s}$<br>并输出持久化性能报告。 |
| **AC-7** | **高压场景下的多租户强隔离防线** | 在千级并发背景下，验证 Tenant B 绝对无法获取、修改或干扰 Tenant A 的缓存数据、锁键及控车指令。 |

---

## 7. 任务拆分与实施计划概览 (Tasks)

1. **Task 1: 规范与 ADR 文档编制**：`docs/specs/observability.md`、`ADR-015`（分布式锁与缓存策略）、`ADR-016`（全链路可观测性与性能基准）。
2. **Task 2: 分布式缓存与并发防重锁核心**：`CachePort`、`DistributedLockPort`、`InMemoryLockAdapter`、`RedisLockAdapter`，并在 `CommandService` 深度集成。
3. **Task 3: Prometheus 指标服务与端点**：`MetricsService`、`MetricsController`、`GET /metrics` 导出。
4. **Task 4: OpenTelemetry 5 阶段链路追踪**：`TracerService`、`CommandTrace` 注入与提取、Span 阶段切片。
5. **Task 5: 阶梯并发压测驱动器与基准生成器**：`load-test-runner.ts` 建设，支持 100/500/1000 设备并发调度。
6. **Task 6: Gate 6 验收测试套件编写与全量回归**：`production-readiness.e2e.test.ts` (AC-1 ~ AC-7 全部 100% 通过)，更新 `CURRENT.md` 与 `task_plan.md`。
