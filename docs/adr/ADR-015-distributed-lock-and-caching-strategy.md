# ADR-015: 基于六边形架构的分布式互斥防重锁与双模缓存策略决策

## 背景
智能网联汽车控车系统具备典型的物理世界动作滞后性与高并发重入风险。用户在 APP 端操作车辆（如远程开关车门、开启空调、寻车鸣笛等），指令经由云端验证、MQTT 协议下发、车载 T-Box 解析并经由 CAN/车载以太网总线驱动执行机构，完整物理执行动作通常耗时数百毫秒至数秒不等。在此物理闭环期间，系统面临以下严峻并发挑战：

1. **同车高频并发重入与指令竞态冲突 (Race Conditions & Re-entrancy)**：
   - 用户在弱网或网络卡顿时频繁快速连续点击控车按钮，产生并发 HTTP 请求；
   - 移动端或网关的弱网自动重试机制可能在毫秒级内重放完全相同的请求；
   - 多授权人（如家庭共享账号、车队管理员与司机）在同一时刻对同一辆车发起语义互斥的控制（例如同时发起“锁车”与“解锁”）；
   - 若系统缺乏前置互斥门禁，多个并发协程将同时穿透安全校验并下发至 MQTT 通道，导致车载 ECU 收到交替冲突指令，引发硬件总线拥塞、执行错乱甚至触发 ECU 故障防盗锁死；
2. **异步状态机乱序终态覆盖**：
   - 两条指令并发下发后，车载总线物理执行与 MQTT 上行 ACK 的到达顺序具有不确定性；
   - 若后发指令先返回 `SUCCESS`，先发指令后返回 `FAILED`，数据库状态机将发生终态覆盖，使云端持久化状态与物理车辆真实状态严重脱节；
3. **架构可测试性与外部依赖耦合矛盾**：
   - 传统的分布式锁通常直接硬编码绑定外部 Redis 客户端（如 Redlock、ioredis 强耦合）；
   - 这导致本地开发、CI/CD 持续集成以及上百项自动化单元测试必须在后台运行真实的 Redis 实例，造成单测启动开销高、跨平台适配复杂、脱机环境构建困难，甚至因外部网络波动导致流水线假死。

---

## 决策

1. **六边形架构端口与适配器解耦设计 (Hexagonal Ports & Adapters)**：
   - 遵循六边形架构，定义核心领域级抽象端口：
     - `DistributedLockPort`：定义 `acquire(resource, ttlMs, waitTimeoutMs)`、`release(handle)` 及语法糖 `withLock(resource, ttlMs, fn)`；
     - `CachePort`：定义标准的 `get(key)`、`set(key, value, ttlSeconds)`、`del(key)` 及 `exists(key)` 键值存储抽象；
   - 解耦具体存储驱动，使控车核心服务 (`CommandService`) 仅依赖抽象端口接口，零感知底层技术选型。

2. **生产与开发/测试双模适配器实现 (Dual-Mode Adapters)**：
   - **`InMemoryLockAdapter`（单机/开发/CI测试模式）**：
     - 基于进程内 `Map<string, { token: string; expireAt: number; timer: NodeJS.Timeout }>` 实现原子比较与自动定时过期；
     - 零外部中间件依赖，作为默认开发与自动化测试的核心驱动，确保脱机运行和测试 100% 毫秒级通过；
   - **`RedisLockAdapter`（生产分布式集群模式）**：
     - 基于 `ioredis` 实现工业级分布式排他互斥锁；
     - **原子加锁语义**：采用 `SET resource_key token PX ttlMs NX` 指令，保证加锁动作与设置过期时间的绝对原子性，防止系统崩溃导致的死锁；
     - **Lua 脚本安全释放**：释放锁时必须比对当前随机令牌 `token` 是否与持有者一致，杜绝因协程执行超时后误删其他业务协程新获取的同名锁：
       ```lua
       if redis.call("get", KEYS[1]) == ARGV[1] then
         return redis.call("del", KEYS[1])
       else
         return 0
       end
       ```
   - **环境变量无缝切换**：通过 `CACHE_DRIVER=memory|redis` 与 `REDIS_URL` 实现环境自适应无感装配。

3. **车辆级细粒度排他防重互斥锁 (Vehicle-Level Mutex Lock)**：
   - **锁键标准格式**：`lock:cmd:${tenantId}:${vehicleId}`；
   - **超时时间窗口 (TTL)**：固定为 `10000ms`（与控车全局 ACK 等待超时时间严格对齐）；
   - **快速失败与友好冲突响应 (Fail-Fast Conflict Prevention)**：
     - 当针对同一车辆已有指令正在执行时，后续并发请求在获取锁阶段立即返回 `null`；
     - 系统不进行无谓的长时间阻塞自旋，而是立即抛出 HTTP 409 `ConflictException`，返回统一错误码 `VEHICLE_COMMAND_IN_PROGRESS`；
     - 同步递增 Prometheus 监控指标 `car_lock_contention_total{tenant_id="..."}`，便于监控报警；
   - **生命周期安全释放保障**：
     - 在 `CommandService.executeCommand` 流水线中，获取锁后使用 `try ... finally` 强制兜底；
     - 无论指令最终是设备正常 ACK (`SUCCESS`)、设备逻辑拒绝 (`DEVICE_REJECTED`)、网络超时 (`TIMEOUT`) 还是系统不可预知异常，均在 `finally` 阶段依据持有的 `LockHandle` 原子释放互斥锁。

4. **严格的多租户防线强隔离**：
   - 锁键名强制绑定 `${tenantId}` 前缀，不同租户之间物理隔绝；
   - 彻底杜绝恶意的跨租户伪造参数导致其他租户车辆被拒绝服务（DoS）。

---

## 结果

- **消除并发竞态与硬件错乱**：在云端网关入口处对同车并发进行了绝对拦截，彻底解决了重复下发、状态覆盖与车载 ECU 动作混乱问题；
- **开发与测试体验极大提升**：纯内存适配器使全部 77+ 项现有单元测试和后续集成测试能够瞬间执行完毕，无需在 CI 机器中维护 Redis 容器，系统构建极度轻量；
- **水平扩展生产就绪**：切换到 `RedisLockAdapter` 后，无缝支持多节点 API 集群水平扩展，集群各实例共享分布式锁状态，保证全局唯一排他；
- **锁安全性与健壮性**：`SET NX PX` + Lua 比对脚本避免了死锁与误删；10000ms 兜底过期时间确保即使单节点突然发生硬件掉电，车辆锁也会在 10 秒后自动解开恢复可用；
- **细粒度高吞吐**：锁粒度精确至单车级别，不同车辆之间的并发请求毫无锁争抢，系统并发吞吐可随车辆数线性横向扩展。
