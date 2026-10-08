# MQTT Communication Specification (物联网通讯规范)

## 1. 业务目标
定义云端（NestJS API / Messaging Port）与车载设备（TBox / 模拟器）之间的 MQTT 通信 Topic 命名结构与消息体格式。

## 2. Topic 命名空间规范

| 业务分类 | 方向 | Topic 格式 | 说明 |
|---|---|---|---|
| **设备上线/离线** | 上行 (Device -> Cloud) | `/sys/{productKey}/{deviceNo}/status` | 包含在线状态、RSSI、固件版本 |
| **设备心跳** | 上行 (Device -> Cloud) | `/sys/{productKey}/{deviceNo}/heartbeat` | 定期上报心跳包（默认 30s） |
| **命令下发** | 下行 (Cloud -> Device) | `/sys/{productKey}/{deviceNo}/cmd/down` | 下发开锁/闭锁等控制指令 |
| **命令应答 (ACK)** | 上行 (Device -> Cloud) | `/sys/{productKey}/{deviceNo}/cmd/ack` | 设备执行结果应答 |
| **实时定位** | 上行 (Device -> Cloud) | `/sys/{productKey}/{deviceNo}/location` | GPS 经纬度、速度、方向角 |
| **报警上报** | 上行 (Device -> Cloud) | `/sys/{productKey}/{deviceNo}/alarm` | 碰撞、低电、防拆、防盗触发 |

## 3. 下行控制报文格式 (Cloud -> Device)

Topic: `/sys/{productKey}/{deviceNo}/cmd/down`
```json
{
  "traceId": "trace-uuid-123456",
  "requestId": "req-uuid-987654",
  "commandId": "cmd-uuid-abcdef",
  "commandCode": "CMD_UNLOCK",
  "timestamp": 1791448800000,
  "params": {
    "doors": ["ALL"]
  }
}
```

## 4. 上行 ACK 报文格式 (Device -> Cloud)

Topic: `/sys/{productKey}/{deviceNo}/cmd/ack`
```json
{
  "traceId": "trace-uuid-123456",
  "requestId": "req-uuid-987654",
  "commandId": "cmd-uuid-abcdef",
  "commandCode": "CMD_UNLOCK",
  "timestamp": 1791448801200,
  "code": 0,
  "message": "SUCCESS",
  "data": {
    "executionTimeMs": 350,
    "doorStatus": "UNLOCKED"
  }
}
```

- `code = 0`: 成功 (SUCCESS)
- `code = 1001`: 条件不满足 (DEVICE_REJECTED，例如车速非 0)
- `code = 1002`: 硬件执行失败 (FAILED，例如执行器无反馈)
- `code = 1003`: 安全校验未通过 (SECURITY_FAILED)
