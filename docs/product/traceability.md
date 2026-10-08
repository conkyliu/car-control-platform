# Requirements Traceability Matrix (需求追踪矩阵)

| 需求标识 | 模块名称 | 优先级 | 对应 Spec | 责任领域 | Gate 节点 | 当前状态 |
|---|---|---|---|---|---|---|
| `AUTH-001` | 用户认证与 JWT 令牌管理 | P0 | `docs/specs/auth.md` | Auth | Gate 1 | 规划中 |
| `TENANT-001` | 多租户隔离与租户配额 | P0 | `docs/specs/tenant.md` | Tenant | Gate 1 | 规划中 |
| `DEVICE-001` | 设备建档、状态与心跳 | P0 | `docs/specs/device.md` | Device | Gate 0 / Gate 2 | 建设中 |
| `VEHICLE-001` | 车辆管理、车型模板与绑定 | P0 | `docs/specs/vehicle.md` | Vehicle | Gate 2 | 规划中 |
| `CAP-001` | 能力字典与三级继承引擎 | P0 | `docs/specs/capability.md` | Capability | Gate 3 | 规划中 |
| `CMD-001` | 控车指令完整状态机与 ACK | P0 | `docs/specs/command.md` | Command | Gate 0 / Gate 3 | 建设中 |
| `MQTT-001` | 物联网 MQTT 消息下发与应答 | P0 | `docs/specs/mqtt.md` | Messaging | Gate 0 | 建设中 |
| `SIM-001` | 设备模拟器与全场景测试 | P0 | `apps/simulator` | QA/Simulator | Gate 0 | 建设中 |
| `WS-001` | WebSocket 房间授权与状态推送 | P0 | `docs/specs/realtime.md` | Realtime | Gate 0 / Gate 3 | 建设中 |
| `ALARM-001` | 核心报警记录与通知 | P0 | `docs/specs/alarm.md` | Alarm | Gate 4 | 规划中 |
| `LOC-001` | 定位上报与轨迹抽稀 | P0 | `docs/specs/location.md` | Location | Gate 4 | 规划中 |
| `OTA-001` | 固件升级计划与分批调度 | P0 | `docs/specs/ota.md` | OTA | Gate 5 | 规划中 |
| `API-001` | 开放 API 接口与鉴权 | P0 | `docs/specs/openapi.md` | OpenAPI | Gate 7 | 规划中 |
