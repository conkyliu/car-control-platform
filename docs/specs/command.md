# Command Domain Specification (指令领域规范)

## 1. 业务目标
控车指令领域是整个平台的生命线，负责从应用层（React/APP）接收车控请求，完成前置权限与安全校验，生成带有全生命周期状态机的指令记录，并通过设备通信通道下发与接收异步应答（ACK）。

## 2. 状态机规范 (State Machine)

### 2.1 状态枚举
- `CREATED`: 指令记录已生成，待校验。
- `VALIDATING`: 正在进行权限、车型能力、安全等级与车辆状态检查。
- `QUEUED`: 校验通过，进入下发队列等待派发。
- `SENDING`: 正在调用通信层下发。
- `SENT`: 已成功投递至 MQTT/网关通道。
- `WAITING_ACK`: 等待设备上报执行结果（默认超时窗口：10s）。
- `SUCCESS`: 设备执行成功并返回正向 ACK。
- `DEVICE_REJECTED`: 设备拒绝执行（如车速非零、发动机防盗锁死、电压过低等）。
- `FAILED`: 设备执行失败或网络下发故障。
- `TIMEOUT`: 在指定时限内未收到设备有效 ACK。
- `CANCELLED`: 指令在下发前被主动取消。
- `EXPIRED`: 排队超时未下发。

### 2.2 状态转移图
```text
           ┌──────────┐
           │ CREATED  │
           └────┬─────┘
                ▼
         ┌─────────────┐
         │ VALIDATING  │
         └──────┬──────┘
                ├────────────────────────┐ (校验失败)
                ▼                        ▼
           ┌─────────┐              ┌─────────┐
           │ QUEUED  │              │ FAILED  │
           └────┬────┘              └─────────┘
                ▼
          ┌──────────┐
          │ SENDING  │
          └─────┬────┘
                ▼
           ┌─────────┐
           │  SENT   │
           └────┬────┘
                ▼
        ┌─────────────┐
        │ WAITING_ACK │
        └──────┬──────┘
               ├───► SUCCESS (设备执行成功)
               ├───► DEVICE_REJECTED (设备逻辑拒绝)
               ├───► FAILED (硬件故障或上报失败)
               └───► TIMEOUT (BullMQ 计时超时)
```

## 3. 指令字典 (Command Codes)

| 指令代码 (`commandCode`) | 说明 | 默认超时 | 默认安全等级 | 参数定义 |
|---|---|---|---|---|
| `CMD_LOCK` | 锁车门 | 10s | L0 | `{ "doors": ["ALL"] }` |
| `CMD_UNLOCK` | 解锁车门 | 10s | L1 | `{ "doors": ["ALL"] }` |
| `CMD_FIND_VEHICLE` | 鸣笛闪灯寻车 | 10s | L0 | `{ "duration": 15, "mode": "HORN_AND_LIGHT" }` |
| `CMD_TRUNK_OPEN` | 开启后备箱 | 10s | L1 | `{}` |
| `CMD_TRUNK_CLOSE` | 关闭后备箱 | 10s | L1 | `{}` |
| `CMD_ENGINE_START` | 远程启动发动机 | 15s | L2 | `{ "duration": 10 }` |
| `CMD_ENGINE_STOP` | 远程熄火 | 15s | L2 | `{}` |
| `CMD_WINDOW_OPEN` | 打开车窗 | 10s | L1 | `{ "position": 100 }` |
| `CMD_WINDOW_CLOSE` | 关闭车窗 | 10s | L1 | `{ "position": 0 }` |
| `CMD_AC_START` | 开启空调 | 15s | L1 | `{ "temp": 24, "mode": "AUTO" }` |
| `CMD_AC_STOP` | 关闭空调 | 10s | L0 | `{}` |

## 4. 幂等与重试规范
1. **客户端幂等**：每次提交必须携带 `idempotencyKey`（UUIDv4）。若在防重窗口（5 分钟）内提交相同的 key，直接返回首次创建的指令记录，禁止二次入库下发。
2. **设备重复 ACK 防护**：若设备因网络抖动重发 ACK，若指令已处于终态（`SUCCESS` / `DEVICE_REJECTED` / `FAILED`），直接丢弃或仅记录通讯日志，不得触发状态二次流转或重复事件。
3. **迟到 ACK 处理**：若指令已进入 `TIMEOUT` 终态后收到设备 ACK，状态保持 `TIMEOUT`，记录异常审计事件并告警。
