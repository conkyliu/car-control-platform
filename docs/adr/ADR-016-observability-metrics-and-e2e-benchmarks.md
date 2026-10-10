# ADR-016: 全链路可观测性指标、W3C 分布式追踪与 E2E 压测 SLA 门禁决策

## 背景
智能网联汽车控车系统具有“全链路跨系统集成、软硬件异构、长耗时异步确认”的物理系统特征。一次完整的远程控车涉及：前端发起 HTTP 请求 $\to$ API 网关鉴权 $\to$ 车辆安全规则计算 $\to$ MQTT 下行下发 $\to$ 车载终端（T-Box）接收 $\to$ 车载 CAN/LIN 总线物理驱动与执行机构动作 $\to$ 设备生成并上报 ACK $\to$ 云端异步消费处理持久化 $\to$ WebSocket 实时推流回前端。

在此复杂长链条下，传统的监控与压测手段暴露出严重的局限性：
1. **黑盒化排障与定界困难 (Black-Box Observability Gap)**：
   - 传统监控仅记录前端或网关层面的 HTTP 响应时间（如 1.2 秒）；
   - 当线上发生控车卡顿或超时时，无法准确剖析到底是 API 权限计算慢、MQTT Broker 发生排队拥塞、蜂窝移动网络丢包重传、还是底层车载硬件控制器物理执行耗时长；
   - 跨部门（云端服务团队、固件团队、网络运营商与硬件团队）互相定界极其困难，长尾缺陷排查成本高昂；
2. **外部重量级 APM 框架的脆弱性与过度工程**：
   - 盲目引入大型商业或全功能开源 APM Agent（如 Datadog、Dynatrace 或复杂版本的 OpenTelemetry Node SDK 全家桶）会导致启动耗时剧增、依赖树庞大、打包体积膨胀；
   - 外部 Agent 在非生产的脱机 CI/CD 单元测试环境中难以稳定运行，且往往存在 Monkey Patching Node.js 原生底层模块带来的运行时黑盒风险；
   - 与此同时，若完全不遵从行业通用标准而自研私有追踪报文格式，则丧失了与主流 Prometheus / Grafana / Jaeger 云原生监控底座无缝对接的能力；
3. **缺乏千级并发真实场景的高保真压测基准与硬性 SLA 门禁**：
   - 传统压测往往采用 Mock API 或直接对 HTTP 单接口进行压测，忽视了车载总线真实物理时延（20ms~50ms）和设备并发上报对云端事件循环与数据库连接池的真实冲击；
   - 平台若无一套确定性、可回归执行的 100 $\to$ 500 $\to$ 1000 级设备并发基准套件与严格的 SLA 性能断言，无法在生产发布前证明其生产就绪度（Production Readiness）。

---

## 决策

1. **自主实现内建轻量化 Prometheus 标准指标引擎 (Lightweight Native Exposition)**：
   - 遵循 Prometheus Text Format (0.0.4) 标准规范，自主设计轻量高性能 `MetricsService` 与导出控制器 `GET /metrics`；
   - **完全消除外部笨重依赖**：不引入不稳定的第三方客户端，仅用纯 TypeScript 实现原子计数器、仪表盘和直方图聚合，零网络侵入、零多余开销；
   - **全景覆盖 7 大车联网领域核心指标**：
     - `car_commands_total` (Counter, `tenant_id`, `command_code`, `status`)
     - `car_command_duration_seconds` (Histogram, `tenant_id`, `command_code`, `le`)
     - `car_telemetry_uplinks_total` (Counter, `tenant_id`, `product_key`)
     - `car_alarms_total` (Counter, `tenant_id`, `alarm_type`, `level`)
     - `car_active_simulators` (Gauge, `online_status`)
     - `car_websocket_connections` (Gauge, `tenant_id`)
     - `car_lock_contention_total` (Counter, `tenant_id`)
   - **严谨匹配车联网特性的直方图 SLA 分桶**：
     - 配置 `[0.05, 0.1, 0.25, 0.5, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0]` 秒，实现对毫秒级快速拦截、秒级常规交互及 10s 全局超时的精准度量。

2. **对标 W3C Trace Context 的 5 阶段精细化分布式链路追踪 (W3C 5-Span Pipeline)**：
   - 追踪格式完全对标 W3C 标准：`00-${traceId}-${spanId}-${traceFlags}`（32 位十六进制 `traceId`，16 位十六进制 `spanId`）；
   - 在单次控车流水线中划定标准 5 个子 Span：
     - **Span 1 (`http.inbound_request`, $T_0 \to T_1$)**：接收请求、鉴权认证、防重互斥锁申请；
     - **Span 2 (`command.security_and_dispatch`, $T_1 \to T_2$)**：能力继承校验、状态机流转为 `QUEUED`/`SENDING` 并投递 MQTT；
     - **Span 3 (`device.execution_ack`, $T_2 \to T_4$)**：车端/虚拟设备接收、总线物理执行（含 20~50ms 仿真时延）及 MQTT ACK 上行；
     - **Span 4 (`ack.processing_and_persistence`, $T_4 \to T_5$)**：服务端消费 ACK、状态机流转终态、DB 仓储事务更新及锁安全释放；
     - **Span 5 (`websocket.client_notification`, $T_5 \to T_6$)**：WebSocket 房间定向推流通知及 Prometheus 指标记录；
   - 计算端到端绝对耗时 $T_{\text{total}} = T_6 - T_0$，各 Span 耗时累加严格与总时长对齐，具备结构化分析输出能力。

3. **构建高仿真阶梯式并发压测执行器与 SLA 性能硬门禁 (Load Testing & Hard SLA Gates)**：
   - 构建 `LoadTestRunner` 压测驱动器，借助真实的 `DeviceSimulator` 和内存 MQTT 总线进行端到端闭环高压测试；
   - 引入并发工作池（Worker Pool 并发度控制在 20~50），在防止 Node.js 事件循环饥饿与 GC 尖刺的前提下实现平滑调度；
   - **阶梯并发验证**：
     - Tier 1: 100 设备并发基准；
     - Tier 2: 500 设备并发扩展验证；
     - Tier 3: 1000 级设备高并发生产基准。
   - **建立自动化 CI/CD 阻断式 SLA 硬门禁**：
     - **成功率**：$\text{Success Rate} \ge 99.9\%$；
     - **耗时分位数**：$P_{50} \le 1.0\text{s}$、$P_{95} \le 2.0\text{s}$、$P_{99} \le 5.0\text{s}$；
     - 自动化压测执行器自动排序耗时样本、计算各分位数与 TPS，若任一指标劣于红线，测试套件断言失败阻断构建。

---

## 结果

- **标准兼容与无感集成**：指标与链路追踪完全遵循 Prometheus 与 W3C 行业标准，未来可无缝接入 Prometheus Server、Grafana Dashboard、Jaeger 与主流云原生监控平台，无需重构业务代码；
- **排障定位秒级定界**：5-Span 链路追踪彻底终结了车控链路黑盒，云端、网络与车载设备的耗时边界物理透明，长尾定位时间从数小时缩短至秒级；
- **极致轻量与零构建包袱**：内建轻量化实现避免了外部 APM 庞大依赖，单测与 CI 可以在数百毫秒内完成全链路可观测性验证，极大地提升了研发与持续交付效率；
- **生产就绪度量化保证**：1000 级设备并发压测驱动器与硬性 SLA 断言为平台在早晚高峰、高密并发环境下的生产稳定性提供了坚实的量化科学依据。
