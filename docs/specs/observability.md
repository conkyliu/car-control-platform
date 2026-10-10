# Observability & Production Readiness Domain Specification (全链路可观测性与生产就绪度规范)

> **版本**: V1.0  
> **编制日期**: 2026-10-10  
> **状态**: APPROVED  
> **适用范围**: Gate 6 (Week 15-18) 生产就绪度、分布式缓存互斥锁、Prometheus 监控指标体系、OpenTelemetry 5 阶段分布式链路追踪及千级设备并发性能基准  

---

## 1. 业务目标与架构全景

智能网联汽车控车系统属于典型的**软硬件异构、长耗时、高可靠要求的分布式异步链路系统**。一次远程车控请求跨越移动终端、API 网关、权限引擎、MQTT 通讯 Broker、车载蜂窝网络、车载网关控制器（T-Box/Gateway）、CAN 总线电子控制单元（ECU）以及反向的 ACK 上报与 WebSocket 实时广播。

为了确保系统在生产环境的高可用、确定性低延迟与故障秒级可定界，Gate 6 确立四大核心技术支柱：
1. **分布式防重互斥锁与缓存体系**：在核心控车流水线中构筑针对单车维度的细粒度防重排他锁，杜绝高频并发点击、指令状态竞态与车载总线指令混乱；
2. **Prometheus 工业级监控指标体系**：基于标准化文本协议输出系统关键计数器、仪表盘和高精度的车控耗时直方图，支撑监控大屏与告警收敛；
3. **OpenTelemetry W3C 5 阶段分布式链路追踪**：对标行业 W3C Trace Context 规范，微观切片度量从 HTTP 接收到 WebSocket 客户端推送的全链路 5 个子 Span；
4. **阶梯式并发压测基准与 SLA 门禁**：通过真实的 `DeviceSimulator` 集群执行 100 $\to$ 500 $\to$ 1000 级并发阶梯压测，设立 $P_{50} \le 1.0\text{s}, P_{95} \le 2.0\text{s}, P_{99} \le 5.0\text{s}$ 及成功率 $\ge 99.9\%$ 的生产就绪硬门禁。

```text
                                 【车联网全链路可观测性与调度流水线】
                                 
   [HTTP Client]  ──(T0)──►  [API Gateway / CommandController]
                                      │
                                      ▼
                        ┌──────────────────────────────┐
                        │ Span 1: http.inbound_request │ (T0 -> T1)
                        │ • JWT 认证 / RBAC 授权        │
                        │ • 分布式防重锁获取            │
                        └──────────────┬───────────────┘
                                       ▼
                        ┌──────────────────────────────┐
                        │ Span 2: command.security_and │ (T1 -> T2)
                        │ • 三级能力继承模型校验        │
                        │ • 状态机变迁与 MQTT 下发      │
                        └──────────────┬───────────────┘
                                       │ (MQTT 下行)
                                       ▼
                        ┌──────────────────────────────┐
                        │ Span 3: device.execution_ack │ (T2 -> T4)
                        │ • 车载 T-Box / 虚拟设备接收  │
                        │ • 物理总线执行 (20~50ms 模拟) │
                        │ • 组装并发布 MQTT 执行 ACK   │
                        └──────────────┬───────────────┘
                                       │ (MQTT 上行)
                                       ▼
                        ┌──────────────────────────────┐
                        │ Span 4: ack.processing_and   │ (T4 -> T5)
                        │ • ACK 报文解析与校验         │
                        │ • 状态机终态持久化 & 通讯日志 │
                        │ • 分布式锁原子释放           │
                        └──────────────┬───────────────┘
                                       ▼
                        ┌──────────────────────────────┐
                        │ Span 5: ws.client_notif      │ (T5 -> T6)
                        │ • 车辆房间定向推流           │
                        │ • Prometheus 指标耗时记录    │
                        └──────────────┬───────────────┘
                                       ▼
                              [WebSocket Client]
```

---

## 2. Prometheus 监控指标规范 (Metrics Schema)

### 2.1 协议与暴露端点
- **HTTP Endpoint**: `GET /metrics`
- **Content-Type**: `text/plain; version=0.0.4; charset=utf-8`
- **访问控制**: 允许内部 Prometheus Server 刮取，生产环境可结合 Bearer Token 或网络白名单放行。

### 2.2 核心指标字典 (7 大指标)

| 指标名称 (`Metric Name`) | 监控类型 (`Type`) | 标签列表 (`Labels`) | 业务含义与说明 |
|---|---|---|---|
| `car_commands_total` | `Counter` | `tenant_id`, `command_code`, `status` | 控车指令下发总次数分布。`status` 枚举取值：`SUCCESS`, `FAILED`, `DEVICE_REJECTED`, `TIMEOUT`, `CONFLICT`。 |
| `car_command_duration_seconds` | `Histogram` | `tenant_id`, `command_code`, `le` | 控车端到端耗时分布直方图（单位：秒）。精确统计不同指令类型的执行耗时百分位数。 |
| `car_telemetry_uplinks_total` | `Counter` | `tenant_id`, `product_key` | 车辆遥测定位与状态数据上报总量。用于监控车辆上行通讯吞吐率。 |
| `car_alarms_total` | `Counter` | `tenant_id`, `alarm_type`, `level` | 触发的异常告警事件总量。`level` 枚举取值：`INFO`, `WARN`, `CRITICAL`。 |
| `car_active_simulators` | `Gauge` | `online_status` | 当前活跃运行的虚拟设备/硬件设备仿真器总数。`online_status`: `online`, `offline`。 |
| `car_websocket_connections` | `Gauge` | `tenant_id` | 实时保持连接的 WebSocket 长连接客户端数量。 |
| `car_lock_contention_total` | `Counter` | `tenant_id` | 车辆并发防重互斥锁获取冲突阻断次数（即触发 409 Conflict 的次数）。 |

### 2.3 直方图分桶规范 (Histogram SLA Buckets)
控车链路属于毫秒级至秒级的硬实时交互，直方图分桶配置固定为 10 个精确阶段桶（单位为秒）：
```text
Buckets = [0.05, 0.1, 0.25, 0.5, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0]
```

**各分桶所对应的物理与网络含义说明：**
- `le="0.05"` ($\le 50\text{ms}$): 极速快速拦截（如前置防重锁冲突阻断、参数校验失败拦截）；
- `le="0.10"` ($\le 100\text{ms}$): 极高吞吐下的无网络设备执行模式或内存级自测模式；
- `le="0.25"` ($\le 250\text{ms}$): 理想蜂窝网络环境下的超低延迟控车执行；
- `le="0.50"` ($\le 500\text{ms}$): 良好网络环境下的常规控车闭环耗时；
- `le="1.00"` ($\le 1.0\text{s}$): **$P_{50}$ SLA 门禁基准线**，要求 50% 以上请求在 1 秒内完成；
- `le="1.50"` ($\le 1.5\text{s}$): 偶发蜂窝网络重传或中继延迟；
- `le="2.00"` ($\le 2.0\text{s}$): **$P_{95}$ SLA 门禁基准线**，要求 95% 以上请求在 2 秒内完成；
- `le="3.00"` ($\le 3.0\text{s}$): 车载 ECU 复杂机构动作或多域控制器同步动作耗时；
- `le="5.00"` ($\le 5.0\text{s}$): **$P_{99}$ SLA 门禁基准线**，极端弱网抖动下的长尾防线；
- `le="10.00"` ($\le 10.0\text{s}$): 指令全局 ACK 等待超时时间窗口。超过 10 秒直接由 BullMQ 超时机制置为 `TIMEOUT`。

### 2.4 Prometheus 暴露文本格式样例
```prometheus
# HELP car_commands_total Total number of car control commands processed
# TYPE car_commands_total counter
car_commands_total{tenant_id="tenant-alpha",command_code="CMD_LOCK",status="SUCCESS"} 142
car_commands_total{tenant_id="tenant-alpha",command_code="CMD_UNLOCK",status="SUCCESS"} 98
car_commands_total{tenant_id="tenant-alpha",command_code="CMD_LOCK",status="CONFLICT"} 3

# HELP car_command_duration_seconds End-to-end command execution latency in seconds
# TYPE car_command_duration_seconds histogram
car_command_duration_seconds_bucket{tenant_id="tenant-alpha",command_code="CMD_LOCK",le="0.05"} 12
car_command_duration_seconds_bucket{tenant_id="tenant-alpha",command_code="CMD_LOCK",le="0.1"} 35
car_command_duration_seconds_bucket{tenant_id="tenant-alpha",command_code="CMD_LOCK",le="0.25"} 88
car_command_duration_seconds_bucket{tenant_id="tenant-alpha",command_code="CMD_LOCK",le="0.5"} 120
car_command_duration_seconds_bucket{tenant_id="tenant-alpha",command_code="CMD_LOCK",le="1"} 138
car_command_duration_seconds_bucket{tenant_id="tenant-alpha",command_code="CMD_LOCK",le="1.5"} 140
car_command_duration_seconds_bucket{tenant_id="tenant-alpha",command_code="CMD_LOCK",le="2"} 142
car_command_duration_seconds_bucket{tenant_id="tenant-alpha",command_code="CMD_LOCK",le="3"} 142
car_command_duration_seconds_bucket{tenant_id="tenant-alpha",command_code="CMD_LOCK",le="5"} 142
car_command_duration_seconds_bucket{tenant_id="tenant-alpha",command_code="CMD_LOCK",le="10"} 142
car_command_duration_seconds_bucket{tenant_id="tenant-alpha",command_code="CMD_LOCK",le="+Inf"} 142
car_command_duration_seconds_sum{tenant_id="tenant-alpha",command_code="CMD_LOCK"} 48.72
car_command_duration_seconds_count{tenant_id="tenant-alpha",command_code="CMD_LOCK"} 142

# HELP car_telemetry_uplinks_total Total count of GPS and telemetry packets ingested
# TYPE car_telemetry_uplinks_total counter
car_telemetry_uplinks_total{tenant_id="tenant-alpha",product_key="PK_MODEL_Y"} 4520

# HELP car_alarms_total Total count of trigger alarms
# TYPE car_alarms_total counter
car_alarms_total{tenant_id="tenant-alpha",alarm_type="LOW_BATTERY",level="WARN"} 15

# HELP car_active_simulators Number of currently active simulators
# TYPE car_active_simulators gauge
car_active_simulators{online_status="online"} 100
car_active_simulators{online_status="offline"} 0

# HELP car_websocket_connections Number of active WebSocket connections
# TYPE car_websocket_connections gauge
car_websocket_connections{tenant_id="tenant-alpha"} 45

# HELP car_lock_contention_total Total count of distributed command lock contentions
# TYPE car_lock_contention_total counter
car_lock_contention_total{tenant_id="tenant-alpha"} 3
```

---

## 3. OpenTelemetry W3C 5-Span 分布式链路追踪规范

### 3.1 W3C Trace Context 协议规范
- **Header Key**: `traceparent`
- **格式标准**: `00-${traceId}-${spanId}-${traceFlags}`
  - `version`: `00` (固定为 2 位十六进制字符)
  - `traceId`: 32 位十六进制小写字符串 (16 字节随机生成)，全局唯一标识单次指令生命周期；
  - `spanId`: 16 位十六进制小写字符串 (8 字节)，标识当前阶段 Span；
  - `traceFlags`: `01` (标明已采样录制)。

### 3.2 5-Span 端到端链路阶段划分
全链路延迟定义为：
$$T_{\text{total}} = T_6 - T_0 = \sum_{i=1}^5 \text{Duration}(\text{Span}_i)$$

| Span 序号 | Span 名称 (`name`) | 时序区间 | 职责与技术动作 | 阶段典型耗时范围 |
|---|---|---|---|---|
| **Span 1** | `http.inbound_request` | $T_0 \to T_1$ | 1. API 网关/Controller 接收客户端请求并反序列化。<br>2. 校验 JWT Token 并提取租户上下文 (`tenantId`)。<br>3. RBAC 权限判定。<br>4. 申请车辆维度排他互斥锁 (`lock:cmd:${tenantId}:${vehicleId}`)。 | $1\text{ms} \sim 10\text{ms}$ |
| **Span 2** | `command.security_and_dispatch` | $T_1 \to T_2$ | 1. 计算三级车型能力继承树（租户 $\to$ 车型 $\to$ 车辆）。<br>2. 校验车控安全等级与前置条件（车速、发动机状态）。<br>3. 初始化指令状态机实体（状态转移至 `QUEUED` $\to$ `SENDING`）。<br>4. 组装 MQTT 下行载荷并向 Broker 发布主题。 | $5\text{ms} \sim 25\text{ms}$ |
| **Span 3** | `device.execution_ack` | $T_2 \to T_4$ | 1. 车载 T-Box / 虚拟设备通过 MQTT 订阅拉取下发指令。<br>2. 车载微控制器向 CAN/以太网总线派发执行帧并驱动执行机构。<br>3. 收集总线执行响应，组装 ACK 报文并通过 MQTT 上行发布。 | $20\text{ms} \sim 1500\text{ms}$ |
| **Span 4** | `ack.processing_and_persistence` | $T_4 \to T_5$ | 1. 服务端 MQTT 消息分发器解析上行 ACK 报文。<br>2. 指令状态机流转为终态 (`SUCCESS` / `FAILED` / `DEVICE_REJECTED`)。<br>3. PostgreSQL 事务持久化状态更新与通讯审计日志落库。<br>4. 原子释放车辆互斥防重锁。 | $5\text{ms} \sim 20\text{ms}$ |
| **Span 5** | `websocket.client_notification` | $T_5 \to T_6$ | 1. 提取租户与所属车辆房间信息。<br>2. 组装指令完成通知载荷并通过 WebSocket 房间进行定向推流。<br>3. 记录 Prometheus 直方图与计数器指标。 | $1\text{ms} \sim 5\text{ms}$ |

### 3.3 追踪数据结构定义
```typescript
export interface SpanRecord {
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number; // 毫秒级 UNIX 时间戳 (支持微秒浮点数)
  endTime: number;
  durationMs: number;
  attributes: Record<string, string | number | boolean>;
}

export interface CommandTrace {
  traceId: string;
  tenantId: string;
  vehicleId: string;
  commandId: string;
  commandCode: string;
  spans: SpanRecord[];
  totalDurationMs: number;
  status: 'SUCCESS' | 'FAILED' | 'DEVICE_REJECTED' | 'TIMEOUT';
}
```

---

## 4. 阶梯并发压测与 SLA 硬门禁规范 (Load Testing & Benchmarks)

### 4.1 压测阶梯规模与环境配置
压测套件采用 `DeviceSimulator` 集群与 `InMemoryTransport` 总线运行阶梯式高并发压测：

| 阶梯层级 (`Tier`) | 并发设备数 (`Vehicles`) | 并发工作池大小 (`Concurrency`) | 模拟总线执行时延 (`Device Delay`) | 总指令请求数 (`Total Commands`) |
|---|---|---|---|---|
| **Tier 1** | 100 台 | 20 | 20ms ~ 30ms 随机分布 | 100 次 |
| **Tier 2** | 500 台 | 35 | 20ms ~ 40ms 随机分布 | 500 次 |
| **Tier 3 (生产硬基准)** | 1000 台 | 50 | 20ms ~ 50ms 随机分布 | 1000 次 |

### 4.2 性能 SLA 硬门禁标准
为确保生产系统能够从容应对早晚高峰大规模车队并发控车，Tier 3 (1000 级) 并发测试必须严格通过以下四维 SLA 门禁断言：

1. **指令执行成功率门禁**:
   $$\text{Success Rate} = \frac{\text{Success Count}}{\text{Total Commands}} \times 100\% \ge 99.9\%$$
2. **中位数耗时门禁 ($P_{50}$)**:
   $$P_{50} \le 1.0\text{ 秒} \quad (1000\text{ms})$$
3. **95 分位耗时门禁 ($P_{95}$)**:
   $$P_{95} \le 2.0\text{ 秒} \quad (2000\text{ms})$$
4. **99 分位极端长尾门禁 ($P_{99}$)**:
   $$P_{99} \le 5.0\text{ 秒} \quad (5000\text{ms})$$

### 4.3 压测输出度量指标计算公式
- **排序样本集**: 将完成的所有成功指令耗时按升序排列 $D = [d_1, d_2, \dots, d_N]$；
- **分位数计算**:
  $$P_k = D\left[ \lceil \frac{k}{100} \times N \rceil - 1 \right]$$
- **每秒完成事务数 (TPS)**:
  $$\text{TPS} = \frac{N}{T_{\text{end}} - T_{\text{start}}} \times 1000$$

### 4.4 压测报告基准模板 (Markdown 输出)
压测运行完成后，驱动器必须格式化输出控制台或日志报告：
```markdown
# Load Test Benchmark Report (1000-Scale Concurrency)
- Total Commands: 1000
- Success Count: 1000 (100.00%)
- Failed Count: 0 (0.00%)
- Total Duration: 1420ms
- System Throughput: 704.22 TPS
- Latency Distribution:
  - Min: 28.50ms
  - P50: 142.10ms (SLA: <= 1000ms -> PASS)
  - P90: 215.30ms
  - P95: 260.40ms (SLA: <= 2000ms -> PASS)
  - P99: 340.20ms (SLA: <= 5000ms -> PASS)
  - Max: 412.80ms
```

---

## 5. 分布式缓存与并发互斥防重锁接口契约

### 5.1 端口抽象 (`CachePort` & `DistributedLockPort`)
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

### 5.2 互斥锁规则与防重异常定义
- **互斥锁资源键名格式**: `lock:cmd:${tenantId}:${vehicleId}`
- **锁生存时间 (TTL)**: 默认 `10000ms`（与控车全局 ACK 超时窗口严格对齐）
- **争抢拦截响应**: 当锁已被占用时，`acquire` 返回 `null`，应用层抛出 HTTP 409:
  ```json
  {
    "statusCode": 409,
    "error": "Conflict",
    "message": "VEHICLE_COMMAND_IN_PROGRESS"
  }
  ```
- **原子释放原则**: 无论指令成功、设备逻辑拒绝、网络超时还是未捕获异常，锁必须在 `finally` 阶段依据令牌 `token` 安全释放。

---

## 6. 多租户数据强隔离与数据脱敏安全要求

1. **Prometheus 指标隔离**:
   - 指标中所有带有租户标识的标签必须为严格校验后的系统合法租户（`tenant_id`）；
   - 严禁将密码、手机号、车辆车牌号、完整 VIN 码等敏感 PII 信息作为标签暴露给 Prometheus，防止时间序列基数爆炸 (Cardinality Explosion) 与数据泄露。
2. **OpenTelemetry 追踪脱敏**:
   - TraceSpan 的 Attributes 中严禁记录 JWT Token、用户密码明文或客户私密生物特征；
   - 仅允许携带无敏感性系统标识：`tenantId`, `vehicleId`, `commandId`, `commandCode`, `status`。
3. **互斥锁租户防线**:
   - 锁键名必须强制前缀 `lock:cmd:${tenantId}:`；
   - 严禁不同租户通过相同或伪造的 `vehicleId` 相互抢占锁，杜绝跨租户资源争抢拒绝服务（DoS 攻击）。
