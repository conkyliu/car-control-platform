# ARCHITECTURE.md · 手机控车平台系统架构

## 1. 架构全景

```text
                         ┌─────────────────────────────┐
                         │ React Web (Admin)           │
                         │ React Native (Mobile App)   │
                         └──────────────┬──────────────┘
                                        │ HTTPS / WSS
                                        ▼
                         ┌─────────────────────────────┐
                         │ NestJS Business API         │
                         │ (Modular Monolith)          │
                         │ Auth / Tenant / Vehicle /   │
                         │ Command / Capability / etc. │
                         └──────────────┬──────────────┘
                                        │
             ┌──────────────────────────┼──────────────────────────┐
             ▼                          ▼                          ▼
      PostgreSQL 16/17             Redis 7                     BullMQ
   (业务事实源 / 分区表)       (实时状态 / 会话 / 锁)         (异步任务 / 超时队列)
             │                          │                          │
             └──────────────────────────┴──────────────────────────┘
                                        │
                                        ▼
                             Event / Messaging Port
                                        │
                     ┌──────────────────┴──────────────────┐
                     ▼                                     ▼
               Aliyun MQTT                       Optional TCP Gateway
            (标准设备下行与上行)                  (私有协议 TBox 接入)
                     │                                     │
                     └──────────────────┬──────────────────┘
                                        ▼
                                 TBox / Simulator
```

## 2. 核心链路设计

### 2.1 控车下行与反馈闭环 (Command Flow)
```text
React / App (POST /vehicles/:id/commands)
  ↓
NestJS API Guard (JWT -> TenantContext -> Permission -> VehicleScope)
  ↓
CommandService
  ├─ CapabilityService.resolveEffective(vehicleId, commandCode)
  ├─ SecurityService.verifySecurityLevel(level, securityCode)
  ├─ VehicleStatus & DeviceStatus (Online check)
  └─ CommandRepository.create(status = CREATED, idempotencyKey)
  ↓
MessagingPort.publishCommand(deviceTopic, payload)
  ↓
CommandState -> SENT -> WAITING_ACK (启动 BullMQ 超时计时器)
  ↓
Device (TBox / Simulator) 接收并执行硬件继电器
  ↓
Device 上报 ACK (MQTT: /devices/:id/ack)
  ↓
IoTConsumer / AMQP -> CommandService.handleAck(ackPayload)
  ├─ 状态机流转 -> SUCCESS / DEVICE_REJECTED / FAILED
  ├─ 记录审计日志 (AuditLog)
  └─ WebSocketGateway.pushToRoom(`vehicle:${vehicleId}`, event)
  ↓
React / App 实时收到更新并渲染
```

### 2.2 状态机定义
- `CREATED`: 初始录入
- `VALIDATING`: 校验权限/能力/安全码中
- `QUEUED`: 进入下发排队
- `SENDING`: 正在下发至消息总线
- `SENT`: 已投递至设备通道
- `WAITING_ACK`: 等待设备应答
- 终态：`SUCCESS` (成功), `DEVICE_REJECTED` (设备拒绝执行), `FAILED` (执行失败), `TIMEOUT` (应答超时), `CANCELLED` (已取消), `EXPIRED` (过期)

## 3. 多租户隔离方案 (Multi-Tenant Isolation)

- 所有租户数据表包含 `tenant_id`。
- 请求进入经过 `TenantContextMiddleware` 解析 JWT 中的 `tenant_id`，绑定到 AsyncLocalStorage。
- 服务层与 Repository 层显式通过 `TenantContext` 注入作用域条件：
  ```ts
  findVehicleById(id: string, tenantId: string)
  ```
- 绝对禁止仅依赖全局隐式 ORM 过滤器，必须保持代码显式安全，并通过 cross-tenant E2E 测试保证隔离性。

## 4. 时延与可观测性链路 (Traceability)

全链路携带统一上下文 Header / Payload：
- `traceId`: 贯穿 HTTP -> Command -> MQTT -> Simulator -> ACK -> WebSocket
- `requestId`: 客户端请求唯一标识
- `idempotencyKey`: 幂等重试防重 Key
